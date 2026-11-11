use serde_json::{json, Value};
use std::{cell::Cell, path::PathBuf};
use tauri::{DragDropEvent, Emitter, Window};

const MAX_PATHS: usize = 256;
const MAX_PATH_BYTES: usize = 256 * 1024;

thread_local! {
    static HOVERING_FILES: Cell<bool> = const { Cell::new(false) };
}

pub fn dispatch(window: &Window, event: &DragDropEvent) {
    if window.label() != "main" {
        return;
    }
    // Wry's WKWebView backend forwards draggingLocation in view points, despite
    // naming the event's coordinates PhysicalPosition. Other backends use pixels.
    let scale = if cfg!(target_os = "macos") {
        1.0
    } else {
        window.scale_factor().unwrap_or(1.0)
    };
    match event {
        DragDropEvent::Enter { paths, position } => {
            let accepted =
                drop_payload(paths, 0.0, 0.0).is_some_and(|value| value.get("paths").is_some());
            HOVERING_FILES.set(accepted);
            if accepted {
                emit_hover(window, position.x / scale, position.y / scale);
            }
        }
        DragDropEvent::Over { position } => {
            if HOVERING_FILES.get() {
                emit_hover(window, position.x / scale, position.y / scale);
            }
        }
        DragDropEvent::Leave => {
            HOVERING_FILES.set(false);
            let _ = window.emit_to("main", "desktop:file-drag-hover", Value::Null);
        }
        _ => {}
    }
    if let DragDropEvent::Drop { paths, position } = event {
        HOVERING_FILES.set(false);
        if let Some(mut payload) = drop_payload(paths, position.x / scale, position.y / scale) {
            #[cfg(target_os = "macos")]
            if let Some((worktree_id, source_paths)) = crate::file_drag_source::origin_for(paths) {
                payload["sourceWorktreeId"] = json!(worktree_id);
                payload["paths"] = json!(source_paths);
            }
            let _ = window.emit_to("main", "desktop:file-drop", payload);
        }
    }
}

fn emit_hover(window: &Window, x: f64, y: f64) {
    let _ = window.emit_to("main", "desktop:file-drag-hover", json!({ "x": x, "y": y }));
}

fn drop_payload(paths: &[PathBuf], x: f64, y: f64) -> Option<Value> {
    if paths.is_empty() {
        return None;
    }
    if paths.len() > MAX_PATHS {
        return Some(
            json!({ "target": "rejected", "reason": "too-many-paths", "pathCount": paths.len(), "byteLength": 0 }),
        );
    }
    let paths: Vec<String> = paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    let bytes: usize = paths.iter().map(String::len).sum();
    if bytes > MAX_PATH_BYTES {
        return Some(
            json!({ "target": "rejected", "reason": "paths-too-large", "pathCount": paths.len(), "byteLength": bytes }),
        );
    }
    Some(json!({ "paths": paths, "x": x, "y": y }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounds_native_drop_payloads_without_disclosing_rejected_paths() {
        let paths = vec![PathBuf::from("private-path"); MAX_PATHS + 1];
        let rejected = drop_payload(&paths, 0.0, 0.0).unwrap();
        assert_eq!(rejected["reason"], "too-many-paths");
        assert!(!rejected.to_string().contains("private-path"));
        let huge = drop_payload(&[PathBuf::from("鲸".repeat(MAX_PATH_BYTES))], 0.0, 0.0).unwrap();
        assert_eq!(huge["reason"], "paths-too-large");
        assert!(drop_payload(&[], 0.0, 0.0).is_none());
        let accepted = drop_payload(&[PathBuf::from("fixture.md")], 42.0, 99.0).unwrap();
        assert_eq!(accepted["paths"][0], "fixture.md");
        assert_eq!(accepted["x"], 42.0);
    }
}
