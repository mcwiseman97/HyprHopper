use std::fmt::Write as _;
use std::path::PathBuf;
use std::time::Duration;

use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebouncedEvent};
use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use thiserror::Error;

const OMARCHY_CURRENT_DIR: &str = ".config/omarchy/current";

#[derive(Debug, Error)]
pub enum ThemeError {
    #[error("no HOME env var")]
    NoHome,
    #[error("colors.toml not found at {0}")]
    MissingColorsToml(PathBuf),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("toml parse error: {0}")]
    Toml(#[from] toml::de::Error),
    #[error("invalid hex color: {0}")]
    InvalidHex(String),
}

pub type ThemeResult<T> = Result<T, ThemeError>;

// All fields are held even when not currently mapped to a semantic token, so
// future token additions can reach them without a schema change.
#[allow(dead_code)]
#[derive(Debug, Deserialize, Clone)]
pub struct OmarchyPalette {
    pub accent: String,
    pub cursor: String,
    pub foreground: String,
    pub background: String,
    pub selection_foreground: String,
    pub selection_background: String,
    pub color0: String,
    pub color1: String,
    pub color2: String,
    pub color3: String,
    pub color4: String,
    pub color5: String,
    pub color6: String,
    pub color7: String,
    pub color8: String,
    pub color9: String,
    pub color10: String,
    pub color11: String,
    pub color12: String,
    pub color13: String,
    pub color14: String,
    pub color15: String,
}

fn home_dir() -> ThemeResult<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or(ThemeError::NoHome)
}

pub fn omarchy_current_dir() -> ThemeResult<PathBuf> {
    Ok(home_dir()?.join(OMARCHY_CURRENT_DIR))
}

pub fn colors_toml_path() -> ThemeResult<PathBuf> {
    Ok(omarchy_current_dir()?.join("theme/colors.toml"))
}

pub fn theme_name_path() -> ThemeResult<PathBuf> {
    Ok(omarchy_current_dir()?.join("theme.name"))
}

pub fn read_theme_name() -> ThemeResult<String> {
    let p = theme_name_path()?;
    Ok(std::fs::read_to_string(p)?.trim().to_string())
}

pub fn load_palette() -> ThemeResult<OmarchyPalette> {
    let path = colors_toml_path()?;
    if !path.exists() {
        return Err(ThemeError::MissingColorsToml(path));
    }
    let raw = std::fs::read_to_string(&path)?;
    let palette: OmarchyPalette = toml::from_str(&raw)?;
    Ok(palette)
}

// --- color math ------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
struct Rgb {
    r: u8,
    g: u8,
    b: u8,
}

fn parse_hex(hex: &str) -> ThemeResult<Rgb> {
    let s = hex.trim_start_matches('#');
    if s.len() != 6 {
        return Err(ThemeError::InvalidHex(hex.to_string()));
    }
    let r = u8::from_str_radix(&s[0..2], 16).map_err(|_| ThemeError::InvalidHex(hex.to_string()))?;
    let g = u8::from_str_radix(&s[2..4], 16).map_err(|_| ThemeError::InvalidHex(hex.to_string()))?;
    let b = u8::from_str_radix(&s[4..6], 16).map_err(|_| ThemeError::InvalidHex(hex.to_string()))?;
    Ok(Rgb { r, g, b })
}

fn hex(rgb: Rgb) -> String {
    format!("#{:02x}{:02x}{:02x}", rgb.r, rgb.g, rgb.b)
}

/// Approximate relative luminance (ITU-R BT.709 weights).
fn luminance(c: Rgb) -> f32 {
    let norm = |v: u8| v as f32 / 255.0;
    0.2126 * norm(c.r) + 0.7152 * norm(c.g) + 0.0722 * norm(c.b)
}

fn lerp_channel(a: u8, b: u8, t: f32) -> u8 {
    let v = a as f32 + (b as f32 - a as f32) * t;
    v.round().clamp(0.0, 255.0) as u8
}

fn mix(a: Rgb, b: Rgb, t: f32) -> Rgb {
    Rgb {
        r: lerp_channel(a.r, b.r, t),
        g: lerp_channel(a.g, b.g, t),
        b: lerp_channel(a.b, b.b, t),
    }
}

/// Pick `#000000` or `#ffffff` based on which contrasts better with `bg`.
fn auto_on(bg: Rgb) -> &'static str {
    if luminance(bg) > 0.5 { "#000000" } else { "#ffffff" }
}

fn rgb_alpha(c: Rgb, alpha: f32) -> String {
    format!("rgb({} {} {} / {:.2})", c.r, c.g, c.b, alpha.clamp(0.0, 1.0))
}

// --- token rendering -------------------------------------------------------

/// Alpha for the main window surface — Hyprland blur shows through beneath.
const SURFACE_ALPHA: f32 = 0.85;
/// Alpha for cards/raised surfaces — near-opaque so text stays crisp over blur.
const CONTAINER_ALPHA: f32 = 0.94;

pub fn render_theme_css(palette: &OmarchyPalette) -> ThemeResult<String> {
    let bg = parse_hex(&palette.background)?;
    let fg = parse_hex(&palette.foreground)?;
    let accent = parse_hex(&palette.accent)?;
    let c1 = parse_hex(&palette.color1)?;
    let c8 = parse_hex(&palette.color8)?;

    // Shifts toward foreground: lighter if dark theme, darker if light theme.
    let surface_container = mix(bg, fg, 0.06);
    let surface_container_high = mix(bg, fg, 0.12);

    let mut out = String::new();
    writeln!(out, ":root {{").ok();
    // Surface tints are semi-transparent so Hyprland's blur can show through.
    writeln!(out, "  --hh-surface: {};", rgb_alpha(bg, SURFACE_ALPHA)).ok();
    writeln!(out, "  --hh-surface-container: {};", rgb_alpha(surface_container, CONTAINER_ALPHA)).ok();
    writeln!(out, "  --hh-surface-container-high: {};", hex(surface_container_high)).ok();
    writeln!(out, "  --hh-on-surface: {};", palette.foreground).ok();
    writeln!(out, "  --hh-on-surface-muted: {};", rgb_alpha(fg, 0.60)).ok();
    writeln!(out, "  --hh-primary: {};", palette.accent).ok();
    writeln!(out, "  --hh-on-primary: {};", auto_on(accent)).ok();
    writeln!(out, "  --hh-outline: {};", palette.color8).ok();
    writeln!(out, "  --hh-outline-variant: {};", rgb_alpha(c8, 0.40)).ok();
    writeln!(out, "  --hh-important: {};", palette.color1).ok();
    writeln!(out, "  --hh-on-important: {};", auto_on(c1)).ok();
    writeln!(out, "  --hh-destructive: {};", palette.color1).ok();
    writeln!(out, "  --hh-focus-ring: {};", rgb_alpha(accent, 0.40)).ok();
    writeln!(out, "}}").ok();
    Ok(out)
}

pub fn current_theme_css() -> ThemeResult<String> {
    let palette = load_palette()?;
    render_theme_css(&palette)
}

// --- file watcher ---------------------------------------------------------

/// Spawn a background thread that watches Omarchy's theme.name file and
/// emits a `theme-changed` event on each modification.
pub fn spawn_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let theme_name = match theme_name_path() {
            Ok(p) => p,
            Err(e) => {
                log::warn!("theme watcher: could not resolve theme.name path: {e}");
                return;
            }
        };
        let current_dir = match omarchy_current_dir() {
            Ok(p) => p,
            Err(_) => return,
        };

        // Channel for debounced events.
        let (tx, rx) = std::sync::mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(150), tx) {
            Ok(d) => d,
            Err(e) => {
                log::warn!("theme watcher: failed to create debouncer: {e}");
                return;
            }
        };

        // Watch the parent dir non-recursively — catches writes to theme.name
        // and survives the atomic theme/ dir swap.
        if let Err(e) = debouncer.watcher().watch(&current_dir, RecursiveMode::NonRecursive) {
            log::warn!("theme watcher: watch() failed on {}: {e}", current_dir.display());
            return;
        }

        log::info!("theme watcher: watching {}", current_dir.display());

        for result in rx {
            let events: Vec<DebouncedEvent> = match result {
                Ok(ev) => ev,
                Err(errs) => {
                    log::warn!("theme watcher error(s): {errs:?}");
                    continue;
                }
            };

            let changed = events.iter().any(|ev| ev.path == theme_name);
            if !changed {
                continue;
            }

            match current_theme_css() {
                Ok(css) => {
                    log::info!("theme changed; emitting theme-changed ({} bytes)", css.len());
                    if let Err(e) = app.emit("theme-changed", css) {
                        log::warn!("theme watcher: emit failed: {e}");
                    }
                }
                Err(e) => {
                    log::warn!("theme watcher: failed to render theme after change: {e}");
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn palette_matte_black() -> OmarchyPalette {
        OmarchyPalette {
            accent: "#e68e0d".into(),
            cursor: "#eaeaea".into(),
            foreground: "#bebebe".into(),
            background: "#121212".into(),
            selection_foreground: "#bebebe".into(),
            selection_background: "#333333".into(),
            color0: "#333333".into(),
            color1: "#D35F5F".into(),
            color2: "#FFC107".into(),
            color3: "#b91c1c".into(),
            color4: "#e68e0d".into(),
            color5: "#D35F5F".into(),
            color6: "#bebebe".into(),
            color7: "#bebebe".into(),
            color8: "#8a8a8d".into(),
            color9: "#B91C1C".into(),
            color10: "#FFC107".into(),
            color11: "#b90a0a".into(),
            color12: "#f59e0b".into(),
            color13: "#B91C1C".into(),
            color14: "#eaeaea".into(),
            color15: "#ffffff".into(),
        }
    }

    #[test]
    fn renders_core_tokens() {
        let css = render_theme_css(&palette_matte_black()).expect("render");
        // Surface is emitted with alpha for Hyprland blur passthrough.
        assert!(css.contains("--hh-surface: rgb(18 18 18 / 0.85)"));
        assert!(css.contains("--hh-on-surface: #bebebe"));
        assert!(css.contains("--hh-primary: #e68e0d"));
        assert!(css.contains("--hh-important: #D35F5F"));
        // Dark bg + amber accent -> on-primary should flip to black for contrast.
        assert!(css.contains("--hh-on-primary: #000000"));
    }

    #[test]
    fn container_shift_moves_toward_foreground() {
        let css = render_theme_css(&palette_matte_black()).expect("render");
        // bg=#121212 (very dark) shifted 6% toward fg=#bebebe -> a lighter dark gray.
        // The container token should reference that shifted value (not 18,18,18 = bg).
        let line = css
            .lines()
            .find(|l| l.contains("--hh-surface-container:"))
            .unwrap();
        assert!(
            !line.contains("18 18 18"),
            "expected shift away from bg, got {line}"
        );
    }

    #[test]
    fn parse_hex_rejects_bad_input() {
        assert!(parse_hex("#zzzzzz").is_err());
        assert!(parse_hex("#123").is_err());
        assert!(parse_hex("abcdef").is_ok()); // # is optional
    }
}
