# HyprHopper

A local-first, Wayland-native capture inbox for Omarchy Linux.

One keybind saves anything — URLs, text snippets, images, files, notes — into a SQLite DB. A Waybar widget shows the unreviewed count. Click it to triage.

The UI mirrors your active Omarchy theme and recolors live when you switch themes.

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/mcwiseman97/HyprHopper/main/install.sh | bash
```

No repo to clone, no compiler needed. Downloads the pre-built binary and scripts directly.

**Runtime requirements** — most Omarchy setups already have these:

```bash
sudo pacman -S webkit2gtk-4.1 wl-clipboard
```

(`webkit2gtk-4.1` is required for the app to launch. `wl-clipboard` is required for clipboard capture.)

After install, the script prints the exact lines to add to your Hyprland and Waybar configs. It never edits your config files — you add the lines yourself.

---

## After install

**1. Autostart** — add to `~/.config/hypr/hyprland.conf`:
```
exec-once = hyprhopper
```

**2. Capture keybind** — add to `~/.config/hypr/keybindings.conf`:
```
bind = SUPER SHIFT, S, exec, hyprhopper capture
```

**3. Waybar module** — add to `~/.config/waybar/config`:
```json
"custom/hopper": {
    "exec": "~/.config/waybar/scripts/hopper-waybar.sh",
    "return-type": "json",
    "interval": 60,
    "signal": 11,
    "on-click": "hyprhopper feed",
    "format": "🗒 {}",
    "tooltip": true
}
```
Then add `"custom/hopper"` to one of the `modules-*` arrays.

**4. Waybar style** — add to `~/.config/waybar/style.css`:
```css
#custom-hopper {
    padding: 0 10px;
    padding-top: 5px;
    margin: 0 4px;
    border-radius: 4px;
    color: @foreground;
    transition: background-color 0.15s ease, color 0.15s ease;
}
#custom-hopper.empty {
    padding: 0; margin: 0; min-width: 0; color: transparent;
}
#custom-hopper.has-important {
    font-weight: 700;
    background-color: rgba(255, 255, 255, 0.08);
}
```

**5. Reload:**
```bash
omarchy-restart-waybar
hyprctl reload
```

---

## Usage

- **Capture** (`SUPER + SHIFT + S`) — small floating dialog, pre-filled from clipboard. Saves URLs, text, notes, images, or files with optional tags and priority.
- **Feed** — click the Waybar widget or run `hyprhopper feed`. Filter tabs (All / Important / I'll get to it / Reviewed), search, and per-item actions (Open, Preview, Edit, Delete, status change).

---

## Data

All items live in:
```
~/.local/share/com.hyprhopper.app/hopper.db
```

Plain SQLite — back it up however you handle `~/.local/share`.

---

## Development

Clone the repo, then:

```bash
npm install
npm run tauri dev
```

To build a release binary locally:

```bash
./install.sh --build
```

This compiles from source and requires the full toolchain:

```bash
# System packages
sudo pacman -S webkit2gtk-4.1 gtk3 librsvg openssl sqlite wl-clipboard base-devel

# Rust
curl https://sh.rustup.rs -sSf | sh

# Tauri CLI
cargo install tauri-cli --version '^2.0'

# Node.js (via mise)
mise install node@lts && mise use --global node@lts
```

Run the Rust tests:

```bash
cd src-tauri && cargo test
```

---

## Stack

- **Tauri v2** · **React 19 + TypeScript + Vite** · **Tailwind CSS v4** · **SQLite** (rusqlite, bundled) · **lucide-react**
