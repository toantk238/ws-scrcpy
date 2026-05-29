# UI Redesign — CSS-Only Lift

**Date:** 2026-05-29
**Branch:** feature/multi_servers
**Approach:** CSS-only — no TypeScript changes

---

## Goal

Replace the current monospace/flat-list developer-tool aesthetic with a modern card-based layout that is visually polished, readable, and pleasant to use. Existing HTML structure and TypeScript code are unchanged.

---

## Decisions

| Question | Decision |
|---|---|
| Layout per device | Card (border, shadow, rounded corners) |
| Theme | Light + Dark, auto via `prefers-color-scheme` |
| Multi-server grouping | Styled section header above each server's device list (`.tracker-name`) |
| Action buttons | All 4 visible as labeled buttons: Stream (primary), Shell / DevTools / Files (secondary) |
| Implementation | CSS-only — rewrite `devicelist.css` and update `app.css` variables |

---

## Color System

### Light Mode (default)
| Token | Value | Usage |
|---|---|---|
| `--bg` | `#f1f5f9` | Page background |
| `--card-bg` | `#ffffff` | Device card background |
| `--card-border` | `#e2e8f0` | Card border |
| `--card-shadow` | `0 1px 3px rgba(0,0,0,0.06)` | Resting card shadow |
| `--card-shadow-hover` | `0 4px 12px rgba(0,0,0,0.08)` | Hover card shadow |
| `--text-primary` | `#1e293b` | Device name |
| `--text-secondary` | `#64748b` | Model, version |
| `--text-muted` | `#94a3b8` | Serial, IP, section labels |
| `--accent` | `#2563eb` | Stream button background |
| `--accent-hover` | `#1d4ed8` | Stream button hover |
| `--btn-secondary-bg` | `#f1f5f9` | Shell/DevTools/Files background |
| `--btn-secondary-text` | `#475569` | Shell/DevTools/Files text |
| `--btn-secondary-hover` | `#e2e8f0` | Shell/DevTools/Files hover |
| `--status-online` | `#22c55e` | Green status dot |
| `--status-offline` | `#ef4444` | Red status dot |
| `--section-label` | `#94a3b8` | Tracker-name text |
| `--section-border` | `#e2e8f0` | Tracker-name bottom border |

### Dark Mode (`prefers-color-scheme: dark`)
| Token | Value |
|---|---|
| `--bg` | `#0f172a` |
| `--card-bg` | `#1e293b` |
| `--card-border` | `#334155` |
| `--card-shadow` | `0 1px 3px rgba(0,0,0,0.3)` |
| `--card-shadow-hover` | `0 4px 12px rgba(0,0,0,0.4)` |
| `--text-primary` | `#e2e8f0` |
| `--text-secondary` | `#94a3b8` |
| `--text-muted` | `#64748b` |
| `--accent` | `#3b82f6` |
| `--accent-hover` | `#2563eb` |
| `--btn-secondary-bg` | `#0f2338` |
| `--btn-secondary-text` | `#94a3b8` |
| `--btn-secondary-hover` | `#1e3a5c` |
| `--section-label` | `#64748b` |
| `--section-border` | `#1e293b` |

### Typography
- **UI font:** `system-ui, -apple-system, sans-serif` — used for device names, model, version, buttons
- **Mono font:** `'SF Mono', 'Fira Code', monospace` — kept for serial numbers and IP addresses (data that benefits from fixed-width)
- **Base font size:** remains `14px`

---

## Element Styles

### Page / Body (`.list` mode)
No structural changes. Background becomes `var(--bg)`.

### Section Header (`.tracker-name`)
Transforms from plain bold text into a clean section divider:
- `font-size: 11px`
- `font-weight: 700`
- `text-transform: uppercase`
- `letter-spacing: 0.08em`
- `color: var(--section-label)`
- `border-bottom: 1px solid var(--section-border)`
- `padding-bottom: 8px`
- `margin-bottom: 10px`

### Device List (`.device-list`)
- `display: flex; flex-direction: column; gap: 8px` — replaces the implicit block stacking
- Removes zebra-stripe alternating backgrounds

### Device Card (`.device`)
- `background: var(--card-bg)`
- `border: 1px solid var(--card-border)`
- `border-radius: 10px`
- `padding: 14px 16px`
- `box-shadow: var(--card-shadow)`
- Hover: `box-shadow: var(--card-shadow-hover); border-color: var(--accent)`
- Transition: `box-shadow 0.15s ease, border-color 0.15s ease`

### Device Header Row (`.device-header`)
- `display: flex; align-items: center; gap: 8px`
- `margin-bottom: 10px`

### Status Dot (`.device-state`)
- `width: 8px; height: 8px` (larger than current 1em × 1em)
- `border-radius: 50%`
- Active (`.device.active .device-state`): `background: var(--status-online)`
- Inactive: `background: var(--status-offline)`

### Device Name / Model / Version
- `.device-name`: `font-size: 14px; font-weight: 600; color: var(--text-primary)` — drops monospace
- `.device-model`: `font-size: 12px; color: var(--text-secondary)` — drops monospace
- `.device-version`: `font-size: 11px; color: var(--text-secondary)` — drops monospace
- `.device-serial`: `font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); margin-left: auto`
- `.device-wifi-ipaddr`: `font-size: 10px; font-family: var(--font-mono); color: var(--text-muted)`

### Offline / Disconnected (`.device.not-active`)
- `opacity: 0.5`
- No action buttons shown (already the case in existing logic)

### Action Buttons Row (`.services` / `.desc-block`)
- `display: flex; align-items: center; gap: 6px; flex-wrap: wrap`

### Action Buttons (`.action-button`)
All action buttons get consistent button styling:
- `font-family: var(--font-ui)`
- `font-size: 12px; font-weight: 500`
- `border: none; border-radius: 6px`
- `padding: 5px 12px`
- `cursor: pointer`
- `background: var(--btn-secondary-bg); color: var(--btn-secondary-text)`
- Hover: `background: var(--btn-secondary-hover)`
- Transition: `background 0.12s ease`

### Stream Button (`.stream-button` or first `.action-button` in `.services`)
Stream gets the primary accent color. Since we cannot add a class via CSS-only, this is achieved by targeting the first action button or using the existing link styling. Implementation detail: the Stream entry uses an `<a>` link while others use `<button>` — we can target `a.action-button` for the primary style.
- `background: var(--accent); color: #fff; font-weight: 600`
- Hover: `background: var(--accent-hover)`

---

## Files to Change

| File | What changes |
|---|---|
| `src/style/app.css` | Update CSS custom properties (`:root` and dark mode block) to new color tokens; add `--font-ui` and `--font-mono` variables |
| `src/style/devicelist.css` | Full rewrite — card layout, section headers, action buttons, status dots, typography |

All other CSS files (`devtools.css`, `filelisting.css`, `morebox.css`, `dialog.css`) are unchanged in this pass.

---

## Out of Scope

- iOS device tracker UI (same patterns apply but not in scope for this pass)
- Stream view UI (control buttons, video overlay)
- Dialog/modal styling
- Adding HTML elements or new CSS classes
- Changing TypeScript/behavior

---

## Success Criteria

- Device list looks like a card-based layout (shadows, rounded corners, white/dark cards)
- Light and dark modes both work correctly via OS preference
- All existing action buttons (Stream, Shell, DevTools, Files) visible and clearly distinguishable
- No functional regressions — all existing click handlers and dynamic class changes continue to work
- Build passes: `npm run dist:dev` produces no errors
