#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod application_menu;
mod backend;
mod clipboard;
mod credential_key;
mod file_drop;
mod keyboard_input_source;
mod markdown_print;
mod native;
#[cfg(target_os = "macos")]
mod notifications;
mod window_state;

use backend::Backend;
use serde_json::Value;
use tauri::{Emitter, Manager, State, WebviewWindow};

#[tauri::command]
async fn backend_call(
    window: WebviewWindow,
    backend: State<'_, Backend>,
    kind: String,
    channel: String,
    args: Vec<Value>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Untrusted desktop window".into());
    }
    let url = window.url().map_err(|error| error.to_string())?;
    let trusted = if tauri::is_dev() {
        url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == Some(1420)
    } else {
        (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (matches!(url.scheme(), "http" | "https")
                && url.host_str() == Some("tauri.localhost"))
    };
    if !trusted {
        return Err("Untrusted desktop origin".into());
    }
    backend.call(kind, channel, args).await
}

fn main() {
    let mut context = tauri::generate_context!();
    for window in &mut context.config_mut().app.windows {
        // Windows native drop interception disables the existing HTML5 workspace/tab drags.
        window.drag_drop_enabled = !cfg!(target_os = "windows");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(clipboard::NativeClipboard::default())
        .manage(credential_key::CredentialKey::default())
        .manage(window_state::WindowState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(event) = event {
                file_drop::dispatch(window, event);
            }
            if matches!(
                event,
                tauri::WindowEvent::Focused(_)
                    | tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::Destroyed
            ) {
                window_state::synchronize(window);
            }
        })
        .on_menu_event(|app, event| {
            if application_menu::clicked(app, event.id().as_ref()) {
                return;
            }
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = app
                    .state::<Backend>()
                    .call(
                        "send".into(),
                        "desktop:menu-click".into(),
                        vec![serde_json::json!(event.id().as_ref())],
                    )
                    .await;
            });
        })
        .invoke_handler(tauri::generate_handler![backend_call])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            notifications::initialize(app.handle());
            #[cfg(not(target_os = "macos"))]
            if let Some(window) = app.get_webview_window("main") {
                window.set_decorations(false)?;
            }
            let backend = Backend::start(app.handle())?;
            app.manage(backend);
            Ok(())
        })
        .build(context)
        .expect("Could not initialize Orcaw Tauri")
        .run(|app, event| {
            if let tauri::RunEvent::Ready = event {
                if let Some(window) = app.get_webview_window("main") {
                    window_state::synchronize(&window.as_ref().window());
                }
            }
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                if app.get_webview_window("main").is_some() {
                    api.prevent_exit();
                    let _ = app.emit_to(
                        "main",
                        "desktop:event",
                        serde_json::json!({
                            "channel": "window:close-requested", "args": [{ "isQuitting": true }]
                        }),
                    );
                }
            }
            if let tauri::RunEvent::Exit = event {
                app.state::<Backend>().stop();
                app.state::<clipboard::NativeClipboard>().cleanup();
            }
        });
}
