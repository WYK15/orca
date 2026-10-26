use crate::clipboard::NativeClipboard;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub async fn dispatch(app: &AppHandle, frame: &Value) -> Result<Value, String> {
    let args = frame["args"].as_array().ok_or("Invalid native arguments")?;
    let text = || {
        args.first()
            .and_then(Value::as_str)
            .ok_or("Missing native path or text")
    };
    match frame["channel"].as_str() {
        Some("print-html") => {
            crate::markdown_print::open(app, args.first().ok_or("Missing print request")?).await
        }
        Some("profile-import-notice") => {
            app.dialog().message("无法完成 Orcaw 配置导入，将继续打开 Tauri。原 Orcaw 数据未修改；如已创建备份，可在 Tauri 数据目录查看。\n\nCould not finish importing Orcaw settings. Tauri will continue opening; the Orcaw source data was not modified.")
                .title("Orcaw Tauri")
                .show(|_| {});
            Ok(Value::Null)
        }
        Some("profile-import-confirm") => {
            let request = args.first().ok_or("Missing import request")?;
            let (tx, rx) = tokio::sync::oneshot::channel();
            app.dialog()
                .message(
                    request["message"]
                        .as_str()
                        .ok_or("Missing import message")?,
                )
                .title(request["title"].as_str().ok_or("Missing import title")?)
                .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                    request["accept"]
                        .as_str()
                        .ok_or("Missing import button")?
                        .into(),
                    request["cancel"]
                        .as_str()
                        .ok_or("Missing cancel button")?
                        .into(),
                ))
                .show(move |accepted| {
                    let _ = tx.send(accepted);
                });
            Ok(json!(rx.await.map_err(|e| e.to_string())?))
        }
        #[cfg(target_os = "macos")]
        Some(channel) if channel.starts_with("notification-") => {
            crate::notifications::dispatch(app, channel, args).await
        }
        Some("menu-set") => {
            crate::application_menu::install(app, args.first().ok_or("Missing menu template")?)?;
            Ok(Value::Null)
        }
        Some("menu-popup") => {
            use tauri::menu::ContextMenu;
            let menu = app.menu().ok_or("Application menu unavailable")?;
            let window = app
                .get_webview_window("main")
                .ok_or("Desktop window unavailable")?;
            menu.popup(window.as_ref().window().clone())
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        Some("credential-key") => app
            .state::<crate::credential_key::CredentialKey>()
            .load(&app.path().app_data_dir().map_err(|e| e.to_string())?)
            .map(|key| json!(key)),
        Some("open-url") => {
            let url = text()?;
            if !url.starts_with("https://") && !url.starts_with("http://") {
                return Err("Only HTTP(S) links are supported".into());
            }
            #[cfg(target_os = "macos")]
            let opened = app
                .opener()
                .open_url(url, Some("Google Chrome"))
                .or_else(|_| app.opener().open_url(url, None::<&str>));
            #[cfg(not(target_os = "macos"))]
            let opened = app.opener().open_url(url, None::<&str>);
            opened.map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        Some("open-path") => {
            app.opener()
                .open_path(text()?, None::<&str>)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        Some("reveal-path") => {
            app.opener()
                .reveal_item_in_dir(text()?)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        Some("trash-path") => {
            trash::delete(text()?).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        Some(channel) if channel.starts_with("clipboard-") => {
            app.state::<NativeClipboard>().dispatch(channel, args)
        }
        Some("open-dialog") | Some("save-dialog") => {
            let options = args.first().cloned().unwrap_or(Value::Null);
            let mut picker = app.dialog().file();
            if let Some(title) = options["title"].as_str() {
                picker = picker.set_title(title);
            }
            if let Some(path) = options["defaultPath"].as_str() {
                if frame["channel"] == "save-dialog" {
                    let path = std::path::Path::new(path);
                    if let Some(name) = path.file_name() {
                        picker = picker.set_file_name(name.to_string_lossy());
                    }
                    if let Some(parent) = path
                        .parent()
                        .filter(|parent| !parent.as_os_str().is_empty())
                    {
                        picker = picker.set_directory(parent);
                    }
                } else {
                    picker = picker.set_directory(path);
                }
            }
            if let Some(filters) = options["filters"].as_array() {
                for filter in filters {
                    let extensions: Vec<&str> = filter["extensions"]
                        .as_array()
                        .map(|items| items.iter().filter_map(Value::as_str).collect())
                        .unwrap_or_default();
                    picker =
                        picker.add_filter(filter["name"].as_str().unwrap_or("Files"), &extensions);
                }
            }
            let (tx, rx) = tokio::sync::oneshot::channel();
            let properties = options["properties"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let folder = properties.iter().any(|v| v == "openDirectory");
            let multiple = properties.iter().any(|v| v == "multiSelections");
            if frame["channel"] == "save-dialog" {
                picker.save_file(move |path| {
                    let _ = tx.send(path.map(|p| vec![p]));
                });
            } else if folder && multiple {
                picker.pick_folders(move |paths| {
                    let _ = tx.send(paths);
                });
            } else if folder {
                picker.pick_folder(move |path| {
                    let _ = tx.send(path.map(|p| vec![p]));
                });
            } else if multiple {
                picker.pick_files(move |paths| {
                    let _ = tx.send(paths);
                });
            } else {
                picker.pick_file(move |path| {
                    let _ = tx.send(path.map(|p| vec![p]));
                });
            }
            let paths: Option<Vec<String>> = rx
                .await
                .map_err(|e| e.to_string())?
                .map(|items| items.into_iter().map(|path| path.to_string()).collect());
            if frame["channel"] == "save-dialog" {
                Ok(json!(paths.and_then(|mut p| p.pop())))
            } else {
                Ok(json!(paths))
            }
        }
        _ => Err("Unknown native desktop operation".into()),
    }
}
