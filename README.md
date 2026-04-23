# HyprHopper

A local-first, Wayland-native capture inbox for Omarchy Linux.

One keybind drops anything — URLs, text snippets, images, files, notes — into a SQLite DB that lives in `~/.local/share/com.hyprhopper.app/`. A Waybar widget shows the unreviewed count. Click it to triage.

The UI mirrors whatever Omarchy theme is active and recolors live when you switch themes.

## Install

```bash
./install.sh
```

This builds the Tauri release binary and copies:

- `~/.local/bin/hyprhopper` — the app
- `~/.local/bin/hopper-capture` — convenience wrapper used by the keybind
- `~/.config/waybar/scripts/hopper-waybar.sh` — the Waybar custom-module script

It does **not** touch your Hyprland or Waybar configs. After the build, the installer prints the exact lines you need to paste into:

- `~/.config/hypr/hyprland.conf` — the `exec-once = hyprhopper` autostart
- `~/.config/hypr/keybindings.conf` — the capture hotkey
- `~/.config/waybar/config` — the custom module definition
- `~/.config/waybar/style.css` — styling for the module

Then:

```bash
omarchy-restart-waybar
hyprctl reload
```

## Usage

- **Capture** — the keybind you wired up (suggested: `SUPER + SHIFT + S`). Opens a small floating dialog pre-filled from the clipboard.
- **Feed** — click the Waybar widget, or run `hyprhopper feed`. Lists items with filter tabs (All / Important / I'll get to it / Reviewed), search, and per-item actions (Open, Preview, Edit, status change, Delete).

## Development

```bash
npm install
npm run tauri dev
```

The app compiles all Rust + webview assets on first run (~30 s). Subsequent dev builds are incremental.

Run the Rust tests:

```bash
cd src-tauri && cargo test
```

## Data

All captured items live in a single SQLite database at:

```
~/.local/share/com.hyprhopper.app/hopper.db
```

It's a plain SQLite file. Back it up however you back up the rest of `~/.local/share`. The Waybar script and the app read from the same file — no IPC is involved in the count display.

## Theming

HyprHopper reads `~/.config/omarchy/current/theme/colors.toml` at startup and on every theme change (it watches `~/.config/omarchy/current/theme.name` for modifications). It synthesizes semantic CSS custom properties (`--hh-surface`, `--hh-primary`, `--hh-important`, etc.) from Omarchy's flat 16-color + accent/foreground/background palette.

Switching themes with `omarchy-theme-set <name>` recolors the app instantly — no restart.

## Stack

- **Tauri v2** (Rust backend, WebView frontend)
- **React 19 + TypeScript + Vite 8**
- **Tailwind CSS v4** (CSS-first `@theme` with runtime-injected vars)
- **SQLite** via `rusqlite` (bundled)
- **lucide-react** for icons
