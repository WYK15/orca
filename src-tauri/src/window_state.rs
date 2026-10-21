use crate::backend::Backend;
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{Emitter, Manager, Window};

#[derive(Default)]
pub struct WindowState(Mutex<Option<Value>>);

pub fn synchronize(window: &Window) {
    if window.label() != "main" {
        return;
    }
    let app = window.app_handle();
    if app.try_state::<Backend>().is_none() {
        return;
    }
    let state = json!({
        "focused": window.is_focused().unwrap_or(false),
        "visible": window.is_visible().unwrap_or(false),
        "minimized": window.is_minimized().unwrap_or(false),
        "maximized": window.is_maximized().unwrap_or(false),
        "fullscreen": window.is_fullscreen().unwrap_or(false),
    });
    let cache = app.state::<WindowState>();
    let Ok(mut previous) = cache.0.lock() else {
        return;
    };
    if previous.as_ref() == Some(&state) {
        return;
    }
    for (channel, key) in [
        ("window:maximize-changed", "maximized"),
        ("window:fullscreen-changed", "fullscreen"),
    ] {
        if previous.as_ref().map(|previous| &previous[key]) != Some(&state[key]) {
            let _ = app.emit_to(
                "main",
                "desktop:event",
                json!({ "channel": channel, "args": [state[key]] }),
            );
        }
    }
    *previous = Some(state.clone());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app
            .state::<Backend>()
            .call("send".into(), "desktop:window-state".into(), vec![state])
            .await;
    });
}
