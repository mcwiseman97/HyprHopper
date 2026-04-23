#!/bin/bash
#
# hopper-waybar.sh — emits Waybar custom-module JSON with the HyprHopper backlog.
#
# Queries the same SQLite DB HyprHopper writes to, directly. Waybar polls this
# script (on interval + on signal) so the bar stays in sync even if the app
# isn't actively running.
#
# Output classes:
#   empty           - no unreviewed items
#   has-items       - one or more "I'll get to it" items, no Important
#   has-important   - at least one Important item

set -eu

DB_PATH="${XDG_DATA_HOME:-$HOME/.local/share}/com.hyprhopper.app/hopper.db"

# If the DB doesn't exist yet (first run, app never launched), emit empty.
if [[ ! -f "$DB_PATH" ]]; then
  printf '{"text":"","class":"empty"}\n'
  exit 0
fi

IMPORTANT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM items WHERE status = 'important';" 2>/dev/null || echo 0)
BACKLOG=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM items WHERE status = 'backlog';" 2>/dev/null || echo 0)
TOTAL=$((IMPORTANT + BACKLOG))

if [[ "$TOTAL" -eq 0 ]]; then
  printf '{"text":"","class":"empty"}\n'
  exit 0
fi

if [[ "$IMPORTANT" -gt 0 && "$BACKLOG" -gt 0 ]]; then
  TOOLTIP="$IMPORTANT Important · $BACKLOG I'll Get To"
elif [[ "$IMPORTANT" -gt 0 ]]; then
  TOOLTIP="$IMPORTANT Important"
else
  TOOLTIP="$BACKLOG I'll Get To"
fi

if [[ "$IMPORTANT" -gt 0 ]]; then
  CLASS="has-important"
else
  CLASS="has-items"
fi

# printf handles escaping: TOOLTIP has an apostrophe in "I'll" which is JSON-safe,
# and none of our other values contain quotes or backslashes.
printf '{"text":"%d","tooltip":"%s","class":"%s"}\n' "$TOTAL" "$TOOLTIP" "$CLASS"
