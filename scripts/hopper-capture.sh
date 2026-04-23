#!/bin/bash
#
# hopper-capture.sh — invoked by the Hyprland keybind to open the capture dialog.
#
# Relies on the single-instance plugin: if HyprHopper is already running (via
# autostart), this call routes the `capture` action to the existing process and
# exits immediately. If not running, HyprHopper will start up, open the capture
# window, and keep running in the background afterward.

set -eu

exec hyprhopper capture
