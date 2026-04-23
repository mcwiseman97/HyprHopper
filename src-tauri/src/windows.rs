//! Window management — reveal/hide the main feed and create-on-demand capture.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN_LABEL: &str = "main";
pub const CAPTURE_LABEL: &str = "capture";

pub fn show_feed(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(MAIN_LABEL) {
        w.show().map_err(|e| e.to_string())?;
        w.unminimize().ok();
        w.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("main window missing".into())
    }
}

pub fn show_capture(app: &AppHandle) -> Result<(), String> {
    open_capture_window(app, None)
}

pub fn show_edit(app: &AppHandle, id: &str) -> Result<(), String> {
    open_capture_window(app, Some(id))
}

fn open_capture_window(app: &AppHandle, edit_id: Option<&str>) -> Result<(), String> {
    // If already open, just focus — edit-id isn't honored on re-focus to avoid
    // clobbering in-flight edits. User must close then re-open to switch items.
    if let Some(existing) = app.get_webview_window(CAPTURE_LABEL) {
        existing.show().ok();
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let path = match edit_id {
        Some(id) => format!("index.html?edit={}", urlencoding_minimal(id)),
        None => "index.html".to_string(),
    };
    let url = WebviewUrl::App(path.into());

    let title = if edit_id.is_some() {
        "HyprHopper — Edit"
    } else {
        "HyprHopper — Capture"
    };

    // Height is sized to fit the tallest form state (Note / Text Snippet, which has
    // a 4-row content textarea). Shorter variants leave a little trailing space —
    // acceptable trade-off for never having to scroll.
    WebviewWindowBuilder::new(app, CAPTURE_LABEL, url)
        .title(title)
        .inner_size(520.0, 640.0)
        .min_inner_size(480.0, 560.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .center()
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// UUID-safe minimal percent-encoding — we only need to survive `?edit=` parameterization.
/// UUIDs are alphanumeric + hyphens, so this is effectively identity, but it's here to
/// make the intent explicit and to avoid pulling in a url-encoding crate for one use.
fn urlencoding_minimal(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

/// Dispatch on a parsed CLI action. Accepts forms invoked as:
///   hyprhopper              (no action — stay in background)
///   hyprhopper capture
///   hyprhopper feed
pub fn dispatch(app: &AppHandle, action: Option<&str>) {
    match action {
        Some("capture") => {
            if let Err(e) = show_capture(app) {
                log::warn!("show_capture failed: {e}");
            }
        }
        Some("feed") => {
            if let Err(e) = show_feed(app) {
                log::warn!("show_feed failed: {e}");
            }
        }
        Some(other) => {
            log::warn!("unknown action: {other}");
        }
        None => {
            // No action — background mode only.
        }
    }
}
