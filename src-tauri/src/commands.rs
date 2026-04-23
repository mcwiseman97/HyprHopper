use tauri::{AppHandle, Emitter, State};
use tauri_plugin_notification::NotificationExt;

use crate::db::{self, Db};
use crate::models::{BacklogCount, HopperItem, ItemStatus, NewItem};
use crate::theme;
use crate::windows;

const ITEMS_CHANGED: &str = "items-changed";

fn emit_items_changed(app: &AppHandle) {
    if let Err(e) = app.emit(ITEMS_CHANGED, ()) {
        log::warn!("emit items-changed: {e}");
    }
    refresh_waybar();
}

/// Poke Waybar's custom/hopper module to re-run its exec script.
/// Waybar re-polls any module with matching `"signal": N` on SIGRTMIN+N.
/// Using 11 because Omarchy's default bar already uses 7 (update), 8
/// (screenrecording), 9 (idle), 10 (notification-silencing). User's
/// waybar config must match this number.
/// Silently ignored if waybar isn't running.
fn refresh_waybar() {
    use std::process::{Command, Stdio};
    let _ = Command::new("pkill")
        .args(["-RTMIN+11", "waybar"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

// Tauri commands marshal types through serde and want `Result<T, String>` for error display.
// We keep the DB layer typed via `DbError` and stringify only at this boundary.

#[tauri::command]
pub fn create_item(
    app: AppHandle,
    db: State<'_, Db>,
    item: NewItem,
) -> Result<HopperItem, String> {
    let created = db::create_item(&db, item).map_err(|e| e.to_string())?;
    emit_items_changed(&app);
    Ok(created)
}

#[tauri::command]
pub fn get_items(
    db: State<'_, Db>,
    filter: Option<ItemStatus>,
) -> Result<Vec<HopperItem>, String> {
    db::get_items(&db, filter).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_item_status(
    app: AppHandle,
    db: State<'_, Db>,
    id: String,
    status: ItemStatus,
) -> Result<(), String> {
    db::update_item_status(&db, &id, status).map_err(|e| e.to_string())?;
    emit_items_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn update_item(
    app: AppHandle,
    db: State<'_, Db>,
    item: HopperItem,
) -> Result<(), String> {
    db::update_item(&db, &item).map_err(|e| e.to_string())?;
    emit_items_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn delete_item(app: AppHandle, db: State<'_, Db>, id: String) -> Result<(), String> {
    db::delete_item(&db, &id).map_err(|e| e.to_string())?;
    emit_items_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn get_backlog_count(db: State<'_, Db>) -> Result<BacklogCount, String> {
    db::get_backlog_count(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_theme_css() -> Result<String, String> {
    theme::current_theme_css().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_theme_name() -> Result<String, String> {
    theme::read_theme_name().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_tags(db: State<'_, Db>) -> Result<Vec<String>, String> {
    db::get_all_tags(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_feed_window(app: AppHandle) -> Result<(), String> {
    windows::show_feed(&app)
}

#[tauri::command]
pub fn show_capture_window(app: AppHandle) -> Result<(), String> {
    windows::show_capture(&app)
}

#[tauri::command]
pub fn show_edit_window(app: AppHandle, id: String) -> Result<(), String> {
    windows::show_edit(&app, &id)
}

#[tauri::command]
pub fn get_item(db: State<'_, Db>, id: String) -> Result<Option<HopperItem>, String> {
    db::get_item(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_external(target: String) -> Result<(), String> {
    spawn_detached("xdg-open", &[target.as_str()])
}

fn spawn_detached(program: &str, args: &[&str]) -> Result<(), String> {
    use std::process::{Command, Stdio};
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn {program}: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn close_capture_window(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window(windows::CAPTURE_LABEL) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn notify_saved(app: AppHandle, title: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title("HyprHopper")
        .body(format!("Saved: {title}"))
        .show()
        .map_err(|e| e.to_string())
}
