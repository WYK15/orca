#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;
mod clipboard;
mod native;

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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(clipboard::NativeClipboard::default())
        .invoke_handler(tauri::generate_handler![backend_call])
        .setup(|app| {
            let backend = Backend::start(app.handle())?;
            app.manage(backend);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Could not initialize Orcaw Tauri")
        .run(|app, event| {
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
