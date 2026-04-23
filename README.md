# HyprHopper

A local-first, Wayland-native capture inbox for Omarchy Linux.

One keybind drops anything — URLs, text snippets, images, files, notes — into a SQLite DB that lives in `~/.local/share/com.hyprhopper.app/`. A Waybar widget shows the unreviewed count. Click it to triage.

The UI mirrors whatever Omarchy theme is active and recolors live when you switch themes.

## Prerequisites

These must be present on the machine before running `install.sh`.

**System packages (Arch / Omarchy):**

```bash
sudo pacman -S webkit2gtk-4.1 gtk3 librsvg openssl sqlite wl-clipboard base-devel
```

**Rust toolchain:**

```bash
curl https://sh.rustup.rs -sSf | sh
# then start a new shell, or: source "$HOME/.cargo/env"
```

**Tauri CLI:**

```bash
cargo install tauri-cli --version '^2.0'
# takes a few minutes on first install
```

**Node.js — via mise (Omarchy's default):**

```bash
# If mise is installed but Node isn't yet:
mise install node@lts
mise use --global node@lts
```

Or use any other Node ≥ 20 install (nvm, n, system package).

---

## Install

```bash
./install.sh
```

By default this downloads the latest pre-built binary from GitHub Releases (~5 s, only needs `curl`).
If no release exists yet, or if you pass `--build`, it compiles from source instead (~10 min — requires the full toolchain from the Prerequisites section above).

```bash
./install.sh --build   # force compile from source
```

If the terminal closes before you can read the output, the full log is always at `/tmp/hyprhopper-install.log`.

This installs:

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
