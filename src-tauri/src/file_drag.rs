use objc2::{rc::Retained, MainThreadMarker};
use objc2_app_kit::NSView;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{cell::RefCell, rc::Rc};
use tauri::{AppHandle, Manager, WebviewWindow};

type Reply = tokio::sync::oneshot::Sender<Result<Value, String>>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    paths: Vec<String>,
    source_paths: Vec<String>,
    worktree_id: String,
}

pub async fn start(app: &AppHandle, value: &Value) -> Result<Value, String> {
    let request: Request = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
    if request.paths.is_empty()
        || request.source_paths.len() != request.paths.len()
        || request.source_paths.iter().map(String::len).sum::<usize>() > 256 * 1024
        || request
            .source_paths
            .iter()
            .any(|path| !path.starts_with('/') || path.contains('\0'))
        || request.paths.len() > 256
        || request.paths.iter().map(String::len).sum::<usize>() > 256 * 1024
        || request
            .paths
            .iter()
            .any(|path| !path.starts_with('/') || path.contains('\0'))
        || request.worktree_id.is_empty()
        || request.worktree_id.len() > 4096
    {
        return Err("Invalid native file drag request".into());
    }
    let window = app
        .get_webview_window("main")
        .ok_or("Desktop window unavailable")?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    window
        .clone()
        .run_on_main_thread(move || start_on_main(window, request, tx))
        .map_err(|e| e.to_string())?;
    rx.await
        .map_err(|_| "File drag window closed".to_string())?
}

fn start_on_main(window: WebviewWindow, request: Request, tx: Reply) {
    let sender = Rc::new(RefCell::new(Some(tx)));
    let completion = sender.clone();
    let complete = Box::new(move |copied| {
        if let Some(tx) = completion.borrow_mut().take() {
            let _ = tx.send(Ok(
                json!({ "outcome": if copied { "copied" } else { "cancelled" } }),
            ));
        }
    });
    if let Err(error) = begin(&window, request, complete) {
        if let Some(tx) = sender.borrow_mut().take() {
            let _ = tx.send(Err(error));
        }
    }
}

fn begin(
    window: &WebviewWindow,
    request: Request,
    complete: Box<dyn FnOnce(bool)>,
) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("File dragging requires the main thread")?;
    let pointer = window.ns_view().map_err(|e| e.to_string())?;
    // Tauri owns the view. Retain it only while starting the session.
    let view =
        unsafe { Retained::retain(pointer.cast::<NSView>()) }.ok_or("Desktop view unavailable")?;
    crate::file_drag_source::begin(
        &view,
        request.paths,
        request.source_paths,
        request.worktree_id,
        complete,
        mtm,
    )
}
