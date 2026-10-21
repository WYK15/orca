use serde::Deserialize;
use serde_json::Value;
use tauri::{
    menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu},
    AppHandle, Manager,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    id: String,
    label: Option<String>,
    role: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    enabled: bool,
    checked: bool,
    accelerator: Option<String>,
    submenu: Option<Vec<Item>>,
}

pub fn install(app: &AppHandle, value: &Value) -> Result<(), String> {
    let items: Vec<Item> = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
    let items = build_items(app, &items).map_err(|e| e.to_string())?;
    let references: Vec<&dyn IsMenuItem<_>> = items
        .iter()
        .map(|item| item as &dyn IsMenuItem<_>)
        .collect();
    let menu = Menu::with_items(app, &references).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("main") {
        window.hide_menu().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn build_items(app: &AppHandle, items: &[Item]) -> tauri::Result<Vec<MenuItemKind<tauri::Wry>>> {
    items
        .iter()
        .map(|item| {
            let label = item.label.as_deref();
            let kind = if let Some(children) = &item.submenu {
                let children = build_items(app, children)?;
                let references: Vec<&dyn IsMenuItem<_>> = children
                    .iter()
                    .map(|item| item as &dyn IsMenuItem<_>)
                    .collect();
                Submenu::with_id_and_items(
                    app,
                    &item.id,
                    label.unwrap_or(""),
                    item.enabled,
                    &references,
                )?
                .kind()
            } else if item.kind.as_deref() == Some("separator") {
                PredefinedMenuItem::separator(app)?.kind()
            } else if let Some(predefined) = predefined(app, item.role.as_deref(), label)? {
                predefined.kind()
            } else {
                let id = item
                    .role
                    .as_ref()
                    .map(|role| format!("desktop-role:{role}"))
                    .unwrap_or_else(|| item.id.clone());
                let fallback = match item.role.as_deref() {
                    Some("togglefullscreen") => "Toggle Full Screen",
                    Some("toggleDevTools") => "Developer Tools",
                    _ => "",
                };
                let enabled = item.enabled
                    && (item.role.as_deref() != Some("toggleDevTools") || cfg!(debug_assertions));
                if item.kind.as_deref() == Some("checkbox") {
                    CheckMenuItem::with_id(
                        app,
                        id,
                        label.unwrap_or(fallback),
                        enabled,
                        item.checked,
                        item.accelerator.as_deref(),
                    )?
                    .kind()
                } else {
                    MenuItem::with_id(
                        app,
                        id,
                        label.unwrap_or(fallback),
                        enabled,
                        item.accelerator.as_deref(),
                    )?
                    .kind()
                }
            };
            Ok(kind)
        })
        .collect()
}

fn predefined(
    app: &AppHandle,
    role: Option<&str>,
    label: Option<&str>,
) -> tauri::Result<Option<PredefinedMenuItem<tauri::Wry>>> {
    Ok(Some(match role {
        Some("undo") => PredefinedMenuItem::undo(app, label)?,
        Some("redo") => PredefinedMenuItem::redo(app, label)?,
        Some("cut") => PredefinedMenuItem::cut(app, label)?,
        Some("copy") => PredefinedMenuItem::copy(app, label)?,
        Some("selectAll") => PredefinedMenuItem::select_all(app, label)?,
        Some("about") => PredefinedMenuItem::about(app, label, None)?,
        Some("services") => PredefinedMenuItem::services(app, label)?,
        Some("hide") => PredefinedMenuItem::hide(app, label)?,
        Some("hideOthers") => PredefinedMenuItem::hide_others(app, label)?,
        Some("unhide") => PredefinedMenuItem::show_all(app, label)?,
        Some("quit") => PredefinedMenuItem::quit(app, label)?,
        Some("minimize") => PredefinedMenuItem::minimize(app, label)?,
        Some("zoom") => PredefinedMenuItem::maximize(app, label)?,
        _ => return Ok(None),
    }))
}

pub fn clicked(app: &AppHandle, id: &str) -> bool {
    match id {
        "desktop-role:togglefullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(fullscreen) = window.is_fullscreen() {
                    let _ = window.set_fullscreen(!fullscreen);
                }
            }
            true
        }
        "desktop-role:toggleDevTools" => {
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                if window.is_devtools_open() {
                    window.close_devtools();
                } else {
                    window.open_devtools();
                }
            }
            true
        }
        _ => false,
    }
}
