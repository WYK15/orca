use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub async fn open(app: &AppHandle, request: &Value) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window("markdown-print") {
        let _ = window.set_focus();
        return Err("请先关闭已有的打印窗口".into());
    }
    let html = request["html"].as_str().ok_or("Missing print document")?;
    if html.is_empty() || html.len() > 64 * 1024 * 1024 {
        return Err("Invalid print document".into());
    }
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|error| error.to_string())?;
    let name: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let path = std::env::temp_dir().join(format!("orcaw-print-{name}.html"));
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path).map_err(|error| error.to_string())?;
    if let Err(error) = file.write_all(html.as_bytes()) {
        drop(file);
        let _ = std::fs::remove_file(&path);
        return Err(error.to_string());
    }
    drop(file);
    let url = tauri::Url::from_file_path(&path).map_err(|_| "Invalid print path")?;
    let trusted = url.clone();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let completion = Arc::new(Mutex::new(Some(tx)));
    let ready = completion.clone();
    let window = WebviewWindowBuilder::new(app, "markdown-print", WebviewUrl::External(url))
        .title(format!(
            "打印 · {}",
            request["title"].as_str().unwrap_or("Markdown")
        ))
        .inner_size(820.0, 1000.0)
        .center()
        .on_navigation(move |url| {
            let mut current = url.clone();
            current.set_fragment(None);
            current == trusted
        })
        .on_page_load(move |window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished
                && payload.url().scheme() == "file"
            {
                if let Some(sender) = ready.lock().ok().and_then(|mut sender| sender.take()) {
                    let _ = sender.send(window.print().map_err(|error| error.to_string()));
                }
            }
        })
        .build();
    let window = match window {
        Ok(window) => window,
        Err(error) => {
            let _ = std::fs::remove_file(&path);
            return Err(error.to_string());
        }
    };
    let cleanup = path.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let _ = std::fs::remove_file(&cleanup);
            if let Some(sender) = completion.lock().ok().and_then(|mut sender| sender.take()) {
                let _ = sender.send(Err("打印窗口已关闭".into()));
            }
        }
    });
    match tokio::time::timeout(std::time::Duration::from_secs(20), rx).await {
        Ok(Ok(Ok(()))) => Ok(json!({ "opened": true })),
        result => {
            let _ = window.close();
            let _ = std::fs::remove_file(&path);
            match result {
                Ok(Ok(Err(error))) => Err(error),
                _ => Err("打开打印窗口超时".into()),
            }
        }
    }
}
