#!/bin/bash
#
# install.sh — installs HyprHopper into $HOME.
#
# By default, downloads the latest pre-built release binary from GitHub (~5 s).
# Pass --build to compile from source instead (~10 min, requires full toolchain).
#
# Does NOT touch any of your config files. The final output prints the exact
# lines you need to add to ~/.config/hypr/* and ~/.config/waybar/*.
#
# Idempotent: re-running just re-copies the latest binary and scripts.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

LOG="/tmp/hyprhopper-install.log"
exec > >(tee -a "$LOG") 2>&1

REPO="mcwiseman97/HyprHopper"
BIN_DIR="$HOME/.local/bin"
WAYBAR_SCRIPTS_DIR="$HOME/.config/waybar/scripts"
BUILD_FROM_SOURCE=false

for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FROM_SOURCE=true ;;
    *) echo "Unknown argument: $arg. Valid flags: --build"; exit 1 ;;
  esac
done

cyan()   { printf '\033[0;36m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }

cyan "▸ HyprHopper install log → $LOG"
cyan "▸ $(date)"

# ── Download pre-built release (default) ─────────────────────────────────────

if [[ "$BUILD_FROM_SOURCE" != "true" ]]; then
  cyan "▸ Fetching latest release from github.com/$REPO…"

  if ! command -v curl >/dev/null 2>&1; then
    red "curl is required for the download path."
    red "Install it (sudo pacman -S curl) or re-run with --build to compile from source."
    exit 1
  fi

  RELEASE_API="https://api.github.com/repos/$REPO/releases/latest"
  DOWNLOAD_URL=$(
    curl -sf "$RELEASE_API" \
      | sed -n 's/.*"browser_download_url": *"\([^"]*\/hyprhopper\)".*/\1/p' \
      | head -1
  )

  if [[ -z "$DOWNLOAD_URL" ]]; then
    yellow "No pre-built release found yet — falling back to building from source."
    BUILD_FROM_SOURCE=true
  else
    mkdir -p "$BIN_DIR"
    cyan "▸ Downloading $DOWNLOAD_URL"
    curl -L --progress-bar "$DOWNLOAD_URL" -o "$BIN_DIR/hyprhopper"
    chmod +x "$BIN_DIR/hyprhopper"
    green "✓ Downloaded: $BIN_DIR/hyprhopper"
  fi
fi

# ── Build from source (--build flag or download fallback) ────────────────────

if [[ "$BUILD_FROM_SOURCE" == "true" ]]; then
  PREFLIGHT_OK=true

  check_cmd() {
    local cmd="$1" hint="$2"
    if ! command -v "$cmd" >/dev/null 2>&1; then
      red "  ✗ '$cmd' not found — $hint"
      PREFLIGHT_OK=false
    else
      green "  ✓ $cmd ($(command -v "$cmd"))"
    fi
  }

  check_pkg() {
    local pkg="$1"
    if ! pacman -Q "$pkg" >/dev/null 2>&1; then
      red "  ✗ pacman package '$pkg' is not installed"
      red "      Fix: sudo pacman -S $pkg"
      PREFLIGHT_OK=false
    else
      green "  ✓ $pkg ($(pacman -Q "$pkg" | awk '{print $2}'))"
    fi
  }

  cyan "▸ Checking build tools…"
  check_cmd node       "install Node.js via mise: mise install node@lts"
  check_cmd npm        "install Node.js via mise: mise install node@lts"
  check_cmd cargo      "install Rust via: curl https://sh.rustup.rs -sSf | sh"
  check_cmd cargo-tauri "install via: cargo install tauri-cli --version '^2.0'"

  cyan "▸ Checking system packages (Arch)…"
  check_pkg webkit2gtk-4.1
  check_pkg gtk3
  check_pkg librsvg
  check_pkg openssl
  check_pkg sqlite

  if ! pacman -Q wl-clipboard >/dev/null 2>&1; then
    yellow "  ⚠  wl-clipboard not installed — clipboard capture will not work"
    yellow "      Fix: sudo pacman -S wl-clipboard"
  fi

  if [[ "$PREFLIGHT_OK" != "true" ]]; then
    red ""
    red "Preflight failed. Install the missing tools above, then re-run install.sh."
    red "Full log: $LOG"
    exit 1
  fi

  cyan "▸ Building HyprHopper (release)…"
  npm install
  cargo tauri build --no-bundle

  RELEASE_BIN="src-tauri/target/release/hyprhopper"
  if [[ ! -x "$RELEASE_BIN" ]]; then
    red "error: expected binary at $RELEASE_BIN not found after build"
    exit 1
  fi

  mkdir -p "$BIN_DIR"
  install -m 0755 "$RELEASE_BIN" "$BIN_DIR/hyprhopper"
  green "✓ Built and installed: $BIN_DIR/hyprhopper"
fi

# ── Install scripts ───────────────────────────────────────────────────────────

cyan "▸ Installing scripts…"
mkdir -p "$WAYBAR_SCRIPTS_DIR"
install -m 0755 "scripts/hopper-capture.sh" "$BIN_DIR/hopper-capture"
install -m 0755 "scripts/hopper-waybar.sh"  "$WAYBAR_SCRIPTS_DIR/hopper-waybar.sh"

green "✓ Installed:"
echo "    $BIN_DIR/hyprhopper"
echo "    $BIN_DIR/hopper-capture"
echo "    $WAYBAR_SCRIPTS_DIR/hopper-waybar.sh"

if ! command -v hyprhopper >/dev/null 2>&1; then
  yellow ""
  yellow "⚠  $BIN_DIR is not on your PATH."
  yellow "    Add this to ~/.bashrc:"
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
         "format": "🗒 {}",
         "tooltip": true
     }

   Then add "custom/hopper" to one of the modules-* arrays.

4. Waybar style for the module
   Add to ~/.config/waybar/style.css:

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

5. Reload Waybar and Hyprland:

     omarchy-restart-waybar
     hyprctl reload

────────────────────────────────────────────────────────────────────────
DB location:  ~/.local/share/com.hyprhopper.app/hopper.db
────────────────────────────────────────────────────────────────────────
EOF
