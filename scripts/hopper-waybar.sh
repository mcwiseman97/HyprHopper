#!/bin/bash
#
# hopper-waybar.sh — emits Waybar custom-module JSON with the HyprHopper backlog.
#
# Usage:
#   hopper-waybar.sh             # "active" backlog: Now + Queue counts
#   hopper-waybar.sh study       # Study (dig_deeper) count only
#
# Output classes:
#   active mode:
#     empty          - no unreviewed items
#     has-items      - 1+ Queue items, no Now items
#     has-important  - 1+ Now items
#   study mode:
#     empty          - no Study items
#     has-items      - 1+ Study items

set -eu

MODE="${1:-active}"
DB_PATH="${XDG_DATA_HOME:-$HOME/.local/share}/com.hyprhopper.app/hopper.db"

# No DB yet = empty. Covers first run before the app has ever launched.
if [[ ! -f "$DB_PATH" ]]; then
  printf '{"text":"","class":"empty"}\n'
  exit 0
fi

count_where() {
  sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM items WHERE $1;" 2>/dev/null || echo 0
}

case "$MODE" in
  study)
    STUDY=$(count_where "status = 'dig_deeper'")
    if [[ "$STUDY" -eq 0 ]]; then
      printf '{"text":"","class":"empty"}\n'
    else
      TOOLTIP="$STUDY to Study"
      printf '{"text":"%d","tooltip":"%s","class":"has-items"}\n' "$STUDY" "$TOOLTIP"
    fi
    ;;

  active|*)
    IMPORTANT=$(count_where "status = 'important'")
    BACKLOG=$(count_where "status = 'backlog'")
    TOTAL=$((IMPORTANT + BACKLOG))

    if [[ "$TOTAL" -eq 0 ]]; then
      printf '{"text":"","class":"empty"}\n'
      exit 0
    fi

    if [[ "$IMPORTANT" -gt 0 && "$BACKLOG" -gt 0 ]]; then
      TOOLTIP="$IMPORTANT Now · $BACKLOG Queued"
    elif [[ "$IMPORTANT" -gt 0 ]]; then
      TOOLTIP="$IMPORTANT Now"
    else
      TOOLTIP="$BACKLOG Queued"
    fi

    if [[ "$IMPORTANT" -gt 0 ]]; then
      CLASS="has-important"
    else
      CLASS="has-items"
    fi

    printf '{"text":"%d","tooltip":"%s","class":"%s"}\n' "$TOTAL" "$TOOLTIP" "$CLASS"
    ;;
esac
