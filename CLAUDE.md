# CLAUDE.md — HyprHopper Project

## How to Work With Me on This Project

You are my pair programmer for building **HyprHopper** — a personal capture inbox deeply integrated
into my Omarchy Linux desktop. When you finish a phase, **present a summary of what was built and
the decisions made, then immediately start the next phase.** You do not need to wait for my approval
between phases.

You **do** still need to stop and wait at **in-phase decision points** — places where a phase's own
steps say "agree before writing code" or where multiple valid approaches exist. In those cases,
present the options with a short tradeoff summary and let me choose. Never silently pick one.

If you are unsure about any environment detail (file paths, installed tools, shell behavior),
**ask me first** rather than assuming.

When a phase is complete, say:

> ✅ Phase [N] complete. Here's what was built: [...]. Now starting Phase [N+1].

---

## Project Overview

**HyprHopper** is a local-first, Wayland-native personal capture inbox. Its job is to let me save
anything — URLs, images, text snippets, files, notes — with one keybind, tag and prioritize
the items, and surface the backlog count in my Waybar. When I click the Waybar widget, a feed
window opens showing all saved items as cards.

Everything must feel like it was built into Omarchy — never bolted on. The UI reads the currently
selected Omarchy theme's color tokens and stays in sync whenever I switch themes.

---

## My Environment

- **OS**: Omarchy Linux (Arch-based, Hyprland compositor, Wayland)
- **Shell**: bash (`$SHELL=/usr/bin/bash`)
- **Terminal**: Kitty
- **Bar**: Waybar
- **Editor**: Neovim (LazyVim)
- **Browser**: whatever `$BROWSER` is set to (if empty, fall back to `xdg-open`)
- **Image viewer**: `imv`
- **Theming**: Omarchy's built-in theme system
  - Active theme is symlinked at `~/.config/omarchy/current/theme/`
  - Canonical palette: `~/.config/omarchy/current/theme/colors.toml` (16 ANSI colors + `accent`, `foreground`, `background`, `cursor`, `selection_*`)
  - Active theme name: `~/.config/omarchy/current/theme.name`
  - System themes live at `~/.local/share/omarchy/themes/`
  - Theme change can be detected via file-watching `~/.config/omarchy/current/` (the symlink target swaps)
  - Detailed strategy for converting the flat palette into semantic design tokens is deferred to Phase 2.
- **Node**: `v25.9.0` via `mise`
- **Rust**: `1.95.0` (stable), `cargo` available at `~/.cargo/bin`
- **Package manager**: system `pacman`; user hasn't installed an AUR helper — ask before depending on one
- **Tauri CLI**: `cargo-tauri 2.10.1` (installed globally via `cargo install tauri-cli --version "^2.0"`)

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| App framework | Tauri v2 | Native Wayland window, filesystem access, file watching, my existing stack |
| Frontend | React + TypeScript (Vite) | My existing stack |
| Styling | Tailwind CSS + CSS variables derived from Omarchy `colors.toml` | Homogeneous with my current theme |
| Database | SQLite via Rust `rusqlite` | Local-first, zero infra |
| Capture dialog | Second lightweight Tauri window | Visual consistency with main feed |
| Waybar integration | `custom` module calling a shell script | Standard Omarchy pattern |
| Keybind | Hyprland `bind` in `~/.config/hypr/keybindings.conf` | Native compositor binding |
| File watching | Rust `notify` crate (or `tauri-plugin-fs`) | Hot-reload theme when Omarchy theme changes |
| Notifications | `notify-send` | Native desktop notifications |

---

## Project File Structure (Target)

```
HyprHopper/
├── CLAUDE.md                  ← this file
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── db.rs              ← SQLite setup, migrations, CRUD
│   │   ├── commands.rs        ← Tauri commands exposed to frontend
│   │   └── theme.rs           ← reads Omarchy colors.toml, watches for theme changes
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── windows/
│   │   ├── Feed.tsx           ← main feed window
│   │   └── Capture.tsx        ← capture dialog window
│   ├── components/
│   │   ├── ItemCard.tsx       ← renders one hopper item
│   │   ├── PriorityBadge.tsx
│   │   ├── TagChip.tsx
│   │   └── PreviewModal.tsx   ← image/text preview overlay
│   ├── hooks/
│   │   ├── useItems.ts
│   │   └── useTheme.ts        ← injects Omarchy-derived CSS into :root
│   ├── types/
│   │   └── item.ts            ← HopperItem type definition
│   └── styles/
│       └── globals.css        ← Tailwind base + CSS variable usage
├── scripts/
│   ├── hopper-capture.sh      ← called by Hyprland keybind
│   └── hopper-waybar.sh       ← polled by Waybar custom module
└── package.json
```

---

## Data Model

```typescript
type ItemStatus = 'backlog' | 'important' | 'reviewed';
type ItemType = 'url' | 'image' | 'text_snippet' | 'file' | 'note';

interface HopperItem {
  id: string;                   // uuid
  title: string;
  note?: string;                // "why I saved this"
  type: ItemType;
  content?: string;             // for url, text_snippet, note
  file_path?: string;           // for image, file
  tags: string[];               // free-form tags e.g. ["learning", "project", "personal"]
  status: ItemStatus;
  created_at: string;           // ISO timestamp
  reviewed_at?: string;
}
```

SQLite table mirrors this exactly. Tags stored as JSON array string, parsed on read.

---

## Theming Rules

**Non-negotiable**: HyprHopper must read the currently-selected Omarchy theme and apply it as CSS
variables. No hardcoded colors anywhere in the codebase. Not a single hex value.

**Input**: `~/.config/omarchy/current/theme/colors.toml` — a flat palette containing
`accent`, `cursor`, `foreground`, `background`, `selection_foreground`, `selection_background`,
and `color0` through `color15` (ANSI colors).

**Output**: a set of semantic CSS custom properties injected into `:root`. The exact token set
and the primitive → semantic mapping (e.g. which ANSI slot becomes "important/priority",
how "surface-container" is derived from `background`) is a design decision deferred to the
**start of Phase 2** — to be agreed with me before implementation.

**Reload**: the Rust backend watches `~/.config/omarchy/current/` (or the `theme.name` file)
so that switching Omarchy themes recolors the app live with no restart.

---

## Waybar Integration

The Waybar module is a `custom` type in `~/.config/waybar/config`:

```json
"custom/hopper": {
    "exec": "~/.config/waybar/scripts/hopper-waybar.sh",
    "interval": 30,
    "on-click": "hopper feed",
    "format": "󰳂 {}",
    "tooltip": true
}
```

`hopper-waybar.sh` queries the SQLite DB and outputs JSON:

```json
{ "text": "7", "tooltip": "3 Important · 4 I'll Get To", "class": "has-items" }
```

If backlog is 0, output `{ "text": "", "class": "empty" }` so it hides cleanly.

---

## Capture Dialog Behavior

Triggered by Hyprland keybind (e.g. `SUPER + SHIFT + S`).
Opens as a small Tauri window (not the full feed — a focused modal).

Fields:
1. **Title** (required, text input — auto-populated from clipboard if it contains a URL)
2. **Note** (optional, textarea — "why do I want to look at this?")
3. **Type selector** (auto-detected from clipboard, overridable): URL / Text Snippet / Note / File
4. **Content field** (shown when type is URL or text snippet — pre-filled from clipboard)
5. **File picker** (shown when type is Image or File)
6. **Tags** (multi-select from existing tags + ability to type new ones)
7. **Priority** (radio/toggle: I'll Get To / Important — default: I'll Get To)

On submit: writes to SQLite, triggers Waybar refresh via `pkill -SIGRTMIN+8 waybar` (or equiv),
closes the capture window, sends a `notify-send` confirmation.

On Escape or Cancel: closes without saving.

Clipboard detection logic (runs when dialog opens):
- If clipboard contains a string starting with `http://` or `https://` → set type to URL, pre-fill content
- If clipboard contains multiple lines of text → set type to Text Snippet, pre-fill content
- Otherwise → leave blank, type defaults to Note

---

## Feed Window Behavior

Opened when Waybar widget is clicked or via `hopper feed` CLI.
Full-featured item browser.

**Layout**:
- Top bar: app name, filter tabs (All / Important / I'll Get To / Reviewed), search input
- Item grid/list: cards sorted by created_at desc within each priority bucket, Important items
  always surfaced first within current filter
- Each card shows: title, type icon, tags, note preview (truncated), timestamp, action buttons

**Card actions by type**:
- URL: "Open" button → `xdg-open <url>`
- File / Text file: "Open" button → `xdg-open <file_path>`
- Image: "Preview" button → opens `imv <file_path>` OR inline modal preview
- Text Snippet / Note: inline expandable text

**Status actions on every card**:
- Move to Important / I'll Get To / Reviewed (contextual — shows the options that aren't current status)
- Delete (with confirmation prompt)
- Edit (opens capture dialog pre-filled with item data)

---

## Build Phases

Work through these phases **one at a time**. Do not begin the next phase until I approve.

---

### Phase 0 — Environment Check & Project Scaffold

**Goal**: Confirm the environment is ready and scaffold the bare Tauri v2 project.

Steps:
1. Check for Tauri CLI (`cargo tauri --version`). If missing, install with
   `cargo install tauri-cli --version "^2.0"`.
2. Check for `sqlite3` availability.
3. Scaffold a Vite + React + TypeScript frontend in-place, then run `cargo tauri init`
   with app name `HyprHopper`, identifier `com.hyprhopper.app`, frontend-dist `../dist`,
   dev-url `http://localhost:1420`.
4. Verify project structure matches the target layout above.
5. Confirm Omarchy theme path exists at `~/.config/omarchy/current/theme/colors.toml`.
6. Smoke test: `cargo check` in `src-tauri/` to confirm the Rust project compiles.
   (Full `tauri dev` window launch is a human-visible check — I'll run that.)

**Deliverable**: Boilerplate Tauri app that opens a blank window. Nothing else yet.

---

### Phase 1 — Database Layer

**Goal**: SQLite database with full schema, migrations, and Rust CRUD commands.

Steps:
1. Add `rusqlite` (or `tauri-plugin-sql`) to `Cargo.toml`.
2. Create `db.rs` with:
   - `initialize_db()` — creates the `items` table if not exists, runs migrations
   - Schema matches the `HopperItem` data model exactly
3. Create `commands.rs` with Tauri commands:
   - `get_items(filter: Option<ItemStatus>) -> Vec<HopperItem>`
   - `create_item(item: NewItem) -> HopperItem`
   - `update_item_status(id: String, status: ItemStatus) -> Result<()>`
   - `update_item(item: HopperItem) -> Result<()>`
   - `delete_item(id: String) -> Result<()>`
   - `get_backlog_count() -> BacklogCount` (returns total, important count, ill-get-to count)
4. Register all commands in `main.rs`.
5. Write a quick test: create a dummy item via command, read it back, delete it. Show me the output.

**Deliverable**: Working DB layer with all commands testable from the Tauri invoke bridge.

---

### Phase 2 — Theming Layer

**Goal**: Omarchy theme colors injected into the React app at runtime, hot-reloading on theme
change.

**Before writing code**, agree on the primitive → semantic token mapping. Present me with a
concrete proposal: which of `accent`, `foreground`, `background`, `color0…color15` becomes each
semantic role (surface, surface-container, on-surface, primary, outline, "important" priority
color, etc.). Do **not** start coding until I pick one.

Steps (after mapping is agreed):
1. Create `theme.rs` with:
   - `read_omarchy_colors() -> Result<Theme>` — parses `~/.config/omarchy/current/theme/colors.toml`
   - `render_theme_css(&Theme) -> String` — emits the agreed CSS custom properties
   - File watcher (e.g. `notify` crate) on `~/.config/omarchy/current/` that emits a
     `theme-changed` Tauri event when the symlink target changes.
2. Expose a `get_theme_css` Tauri command.
3. Create `src/hooks/useTheme.ts`:
   - On mount, calls `get_theme_css`, injects into `<style id="omarchy-theme">` on `:root`.
   - Listens for `theme-changed` Tauri event, re-injects when fired.
4. Create `src/styles/globals.css`:
   - Tailwind directives.
   - Base body styles using the agreed CSS variables.
   - No hardcoded colors anywhere.
5. Wrap `App.tsx` with `useTheme`. Render a test card showing primary, surface, and "important"
   colors with their variable names — just to visually confirm theming is working.

**Deliverable**: App window that visually matches my current Omarchy theme.
Running `omarchy-theme-next` (or whatever the theme-switch command is) should recolor the
app live without restart.

---

### Phase 3 — Capture Window

**Goal**: The capture dialog — small Tauri window, full form, clipboard detection, saves to DB.

Steps:
1. Configure a second Tauri window in `tauri.conf.json` named `capture`:
   - Small size: ~520px × 480px
   - Centered, no decorations (we style our own titlebar), always-on-top
2. Create `src/windows/Capture.tsx` with all fields from the capture dialog spec above.
3. Implement clipboard detection on dialog open using Tauri's clipboard plugin.
4. Implement tag input: shows existing tags from DB as suggestions, allows typing new ones.
5. On submit: calls `create_item` command, sends `notify-send "Hopper" "Saved: <title>"`,
   closes window.
6. On Escape: closes without saving.
7. Create `scripts/hopper-capture.sh`:
   ```sh
   #!/bin/bash
   hopper capture   # or however we invoke the Tauri window
   ```
8. Show me the Hyprland keybind line to add to my config — don't add it automatically.
   Let me decide where it goes.

**Deliverable**: Fully functional capture dialog. I can trigger it, fill it out, and see the item
appear in SQLite.

---

### Phase 4 — Feed Window

**Goal**: The main feed — item cards, filtering, search, all item actions.

Steps:
1. Create `src/windows/Feed.tsx` with layout described in Feed Window Behavior above.
2. Create `src/components/ItemCard.tsx`:
   - Type icon (use lucide-react icons — link, image, file-text, sticky-note, etc.)
   - Title, truncated note, tags as chips, relative timestamp
   - Action buttons appropriate to item type
   - Status change buttons
   - Delete with inline confirmation
3. Create `src/components/TagChip.tsx` — styled using surface-container + outline-variant tokens.
4. Create `src/components/PriorityBadge.tsx` — Important uses error-container, I'll Get To uses
   surface-container.
5. Create `src/components/PreviewModal.tsx` — for image preview, triggered from image cards.
6. Implement filter tabs (All / Important / I'll Get To / Reviewed).
7. Implement search (client-side filter on title + note + tags).
8. Hook up all card actions: `xdg-open` for URLs and files, `imv` for images, status updates,
   deletes, edit (opens capture window pre-filled).
9. Implement `src/hooks/useItems.ts` — fetches items, handles optimistic updates for status changes.

**Deliverable**: Full working feed. I can view, filter, search, act on all my saved items.

---

### Phase 5 — Waybar Integration

**Goal**: Live backlog count in Waybar, clicking opens the feed.

Steps:
1. Create `scripts/hopper-waybar.sh`:
   - Queries SQLite directly (no Tauri needed — raw `sqlite3` CLI query)
   - Outputs JSON in Waybar custom module format
   - Shows total unreviewed count as text
   - Tooltip: "X Important · Y I'll Get To"
   - `class: "empty"` when count is 0
2. Show me the exact JSON block to add to `~/.config/waybar/config` — do not edit the file.
   Let me add it.
3. Show me the CSS to add to `~/.config/waybar/style.css` for the Hopper module — do not edit.
4. Ensure `create_item` and status-change commands trigger a Waybar signal refresh
   (`pkill -SIGRTMIN+8 waybar` or the correct signal for my setup — ask me if unsure).

**Deliverable**: Waybar shows live Hopper count. Click opens feed. Saves from capture dialog
update the count immediately.

---

### Phase 6 — Installation & Polish

**Goal**: Make Hopper a proper part of my system, not just a dev project.

Steps:
1. Create an install script `install.sh` that:
   - Builds the Tauri app in release mode
   - Copies the binary to `~/.local/bin/hopper`
   - Copies waybar script to `~/.config/waybar/scripts/hopper-waybar.sh`
   - Copies capture script to `~/.local/bin/hopper-capture`
   - Sets correct permissions on all scripts
   - Does NOT modify any config files — prints instructions for manual additions instead
2. Create a `README.md` with:
   - What Hopper is
   - Manual config steps (keybind, Waybar module, Waybar CSS)
   - How to run in dev mode
   - DB location
3. Review the full app for any hardcoded colors. If any are found, replace with CSS variables.
4. Final pass: check all type icons are correct, all actions work end-to-end.
5. Optional enhancements to discuss (do not build unless I say so):
   - Syncthing integration for DB sync to Android
   - wl-clipboard watcher for passive URL detection
   - Bulk actions (mark all reviewed, delete all reviewed)
   - Import from browser bookmarks

**Deliverable**: Hopper is installed and running as a real system application.

---

## Constraints & Rules

1. **No hardcoded colors.** Ever. All colors come from the Omarchy-derived CSS variables.
2. **No cloud dependencies.** Everything runs locally. No external APIs, no sync services built in.
3. **Shell scripts are bash.** All scripts use `#!/bin/bash` explicitly.
4. **Don't auto-edit my config files.** Waybar config, Hyprland keybindings, Omarchy hooks —
   show me the exact lines to add, explain where they go, and let me add them.
5. **Ask before installing system packages.** If something needs `pacman -S <package>` (or an AUR
   helper), tell me and wait for confirmation.
6. **Prefer explicit over magic.** If there's a simpler, more readable way to do something vs.
   a clever way, take the simpler path.
7. **Auto-advance between phases** once a phase is complete. The one time to stop and wait is at
   explicit in-phase decision points (where a phase says "agree before writing code" or where
   multiple valid approaches exist).

---

## Starting Instruction

When I open this project in Claude Code, greet me with a brief summary of what Hopper is,
show me the phase list with their current status (all pending at start), and ask which phase
I want to begin with — defaulting to Phase 0.

Format the phase list like:

```
Phase 0 — Environment Check & Project Scaffold     [ PENDING ]
Phase 1 — Database Layer                           [ PENDING ]
Phase 2 — Theming Layer                            [ PENDING ]
Phase 3 — Capture Window                           [ PENDING ]
Phase 4 — Feed Window                              [ PENDING ]
Phase 5 — Waybar Integration                       [ PENDING ]
Phase 6 — Installation & Polish                    [ PENDING ]
```

Update statuses as we go: [ PENDING ] → [ IN PROGRESS ] → [ COMPLETE ]
