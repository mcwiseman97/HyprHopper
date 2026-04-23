#!/bin/bash
#
# install.sh — builds HyprHopper and copies artifacts into $HOME.
#
# Does NOT touch any of your config files. The final output prints the exact
# lines you need to add to ~/.config/hypr/* and ~/.config/waybar/* — you add
# them yourself.
#
# Idempotent: re-running just re-copies the latest binary and scripts.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

BIN_DIR="$HOME/.local/bin"
WAYBAR_SCRIPTS_DIR="$HOME/.config/waybar/scripts"

cyan()   { printf '\033[0;36m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }

cyan "▸ Building HyprHopper (release)…"
npm install --silent
cargo tauri build --no-bundle

RELEASE_BIN="src-tauri/target/release/hyprhopper"
if [[ ! -x "$RELEASE_BIN" ]]; then
  echo "error: expected binary at $RELEASE_BIN not found after build" >&2
  exit 1
fi

cyan "▸ Installing binary and scripts…"
mkdir -p "$BIN_DIR" "$WAYBAR_SCRIPTS_DIR"

install -m 0755 "$RELEASE_BIN"              "$BIN_DIR/hyprhopper"
install -m 0755 "scripts/hopper-capture.sh" "$BIN_DIR/hopper-capture"
install -m 0755 "scripts/hopper-waybar.sh"  "$WAYBAR_SCRIPTS_DIR/hopper-waybar.sh"

green "✓ Installed:"
echo "    $BIN_DIR/hyprhopper"
echo "    $BIN_DIR/hopper-capture"
echo "    $WAYBAR_SCRIPTS_DIR/hopper-waybar.sh"

if ! command -v hyprhopper >/dev/null 2>&1; then
  yellow ""
  yellow "⚠  $BIN_DIR is not on your PATH."
  yellow "    Add this to your shell profile (bash: ~/.bashrc):"
  echo  '      export PATH="$HOME/.local/bin:$PATH"'
fi

cat <<'EOF'

────────────────────────────────────────────────────────────────────────
NEXT STEPS — things you add by hand (install.sh never edits your configs)
────────────────────────────────────────────────────────────────────────

1. Autostart HyprHopper in background at login
   Add to ~/.config/hypr/hyprland.conf (or your autostart.conf):

     exec-once = hyprhopper

2. Capture keybind
   Add to ~/.config/hypr/keybindings.conf (or your bindings file):

     bind = SUPER SHIFT, S, exec, hyprhopper capture

3. Waybar custom module
   Add to ~/.config/waybar/config (or config.jsonc):

     "custom/hopper": {
         "exec": "~/.config/waybar/scripts/hopper-waybar.sh",
         "return-type": "json",
         "interval": 60,
         "signal": 11,
         "on-click": "hyprhopper feed",
         "format": "󰋳 {}",
         "tooltip": true
     }

   Then add "custom/hopper" to one of the modules-* arrays.

4. Waybar style for the module
   Add to ~/.config/waybar/style.css:

     #custom-hopper {
         padding: 0 10px;
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

5. Reload Waybar and Hyprland:

     omarchy-restart-waybar
     hyprctl reload

────────────────────────────────────────────────────────────────────────
DB location:  ~/.local/share/com.hyprhopper.app/hopper.db
────────────────────────────────────────────────────────────────────────
EOF
