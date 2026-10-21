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
        Some("open-url") => {
            let url = text()?;
            if !url.starts_with("https://") && !url.starts_with("http://") {
                return Err("Only HTTP(S) links are supported".into());
            }
            app.opener()
                .open_url(url, None::<&str>)
                .map_err(|e| e.to_string())?;
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
                picker = picker.set_directory(path);
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
