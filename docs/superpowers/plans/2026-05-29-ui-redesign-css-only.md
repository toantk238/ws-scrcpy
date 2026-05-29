# UI Redesign — CSS-Only Lift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat monospace device list with a modern card-based layout (light + dark, auto) by rewriting two CSS files with zero TypeScript changes.

**Architecture:** Update CSS custom-property tokens in `app.css` and fully rewrite `devicelist.css` to apply card styling to the existing `.device` div and modern button styles to action links/buttons. The HTML structure is unchanged.

**Tech Stack:** Plain CSS, `prefers-color-scheme` media query, existing webpack CSS build pipeline (`css-loader`, `mini-css-extract-plugin`).

---

## Real HTML Structure (read-only reference)

Before touching any CSS, understand exactly what the browser renders. The relevant DOM looks like this — **do not change it**:

```html
<!-- #devices > .table-wrapper > .device-list -->
<div class="device-list" id="goog_device_list">

  <!-- server section label — shown once per ADB server -->
  <div class="tracker-name">hostname</div>

  <!-- one .device div per connected device -->
  <div class="device active">                         <!-- or "not-active" -->
    <div class="device-header">
      <div class="device-name">Google Pixel 7 Pro</div>   <!-- manufacturer + model -->
      <div class="device-serial">R58HA0DQNM</div>
      <div class="device-version">
        <div class="release-version">14</div>
        <div class="sdk-version">34</div>
      </div>
      <div class="device-state" title="State: device"></div>   <!-- visual dot only -->
      <div class="device-wifi-ipaddr">192.168.1.5</div>
    </div>
    <div class="services" id="device_services_...">
      <!-- each tool injects one desc-block div -->
      <div class="desc-block shell">
        <a href="...">shell</a>
      </div>
      <div class="desc-block devtools">         <!-- may vary by registered Tool -->
        <a href="...">devtools</a>
      </div>
      <div class="desc-block file-listing">
        <a href="...">list files</a>
      </div>
      <!-- stream entry: only present when stream daemon is running (hasPid) -->
      <div class="desc-block stream">
        <button class="action-button active">Configure stream</button>
      </div>
      <!-- net interface selector -->
      <div class="desc-block net_interface">
        <select>...</select>
      </div>
      <!-- server PID / kill-start button (SVG icon only) -->
      <div class="desc-block server_pid">
        <button class="action-button active kill-server-button">
          <svg>...</svg>
        </button>
      </div>
    </div>
  </div>

</div>
```

**Important corrections vs. spec:** The spec lists `.device-model` but that class does not exist — manufacturer and model are both inside `.device-name`. Do not add a `.device-model` rule; it simply won't match anything.

---

## Files to Change

| File | Change |
|---|---|
| `src/style/app.css` | Add 16 new CSS custom properties (card tokens, font tokens). Keep all existing tokens untouched. |
| `src/style/devicelist.css` | Full rewrite. Remove zebra stripes, add card layout, style action links as buttons. |

No other files change.

---

## Task 1 — Add new CSS tokens to `app.css`

**Files:**
- Modify: `src/style/app.css`

The existing tokens (e.g. `--main-bg-color`, `--button-text-color`) must be **preserved** because they are used by other CSS files (`devtools.css`, `dialog.css`, etc.). Add the new tokens alongside the existing ones.

- [ ] **Step 1: Add new tokens to the light-mode `:root` block in `src/style/app.css`**

Open `src/style/app.css`. Find the closing `}` of the `:root { ... }` block (currently ends around line 24). Insert the following lines **before** that closing brace:

```css
    /* ── Card / UI redesign tokens ── */
    --bg: #f1f5f9;
    --card-bg: #ffffff;
    --card-border: #e2e8f0;
    --card-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
    --card-shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.05);
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --text-muted: #94a3b8;
    --accent: #2563eb;
    --accent-hover: #1d4ed8;
    --btn-secondary-bg: #f1f5f9;
    --btn-secondary-text: #475569;
    --btn-secondary-hover: #e2e8f0;
    --status-online: #22c55e;
    --status-offline: #ef4444;
    --section-label: #94a3b8;
    --section-border: #e2e8f0;
    --font-ui: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono: 'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace;
```

- [ ] **Step 2: Add dark-mode overrides for the new tokens inside the existing `@media (prefers-color-scheme: dark)` block**

Find the existing `@media (prefers-color-scheme: dark) { :root { ... } }` block (currently ends around line 52). Insert before the inner closing `}`:

```css
        /* ── Card / UI redesign tokens (dark) ── */
        --bg: #0f172a;
        --card-bg: #1e293b;
        --card-border: #334155;
        --card-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        --card-shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.4);
        --text-primary: #e2e8f0;
        --text-secondary: #94a3b8;
        --text-muted: #64748b;
        --accent: #3b82f6;
        --accent-hover: #2563eb;
        --btn-secondary-bg: #0f2338;
        --btn-secondary-text: #94a3b8;
        --btn-secondary-hover: #1e3a5c;
        --section-label: #64748b;
        --section-border: #1e293b;
```

`--font-ui` and `--font-mono` are the same in both themes, so no dark override needed for them.

- [ ] **Step 3: Build and verify no compile errors**

```bash
npm run dist:dev 2>&1 | grep -E "ERROR|error|Warning" | head -20
```

Expected: no CSS errors. If webpack prints errors, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/style/app.css
git commit -m "style: add card/UI redesign CSS tokens to app.css"
```

---

## Task 2 — Rewrite `devicelist.css`

**Files:**
- Modify: `src/style/devicelist.css`

This is a full replacement of the file contents. The existing file has:
- Zebra-stripe alternating backgrounds (`.device:nth-child(2n)`) — **remove**
- Monospace font on `.device-list` — **replace with system font**
- Flat row padding on `.device` — **replace with card styling**
- Transparent action buttons — **replace with styled buttons**
- Plain `.tracker-name` — **replace with section header**

- [ ] **Step 1: Replace the entire contents of `src/style/devicelist.css`**

The new file is a complete replacement. Write exactly this content:

```css
/* ─────────────────────────────────────────────────────────────────────────────
   devicelist.css  —  card-based device list redesign (CSS-only, no HTML changes)
   ───────────────────────────────────────────────────────────────────────────── */

/* ── Body overrides for list mode ── */

body.list {
    height: auto;
    width: auto;
    overflow: auto;
    background-color: var(--bg);
}

/* ── Outer scroll container ── */

#devices {
    padding: 20px 24px;
    width: 100%;
    height: calc(100% - 40px);
    overflow-y: auto;
}

/* When device list is shown as an overlay on top of a stream */
body.stream #devices {
    background-color: var(--card-bg);
    opacity: 0.9;
    position: absolute;
    top: 0;
    left: 0;
    z-index: 3;
}

/* ── Device-list menu button (hidden in list mode) ── */

body.list #device_list_menu {
    display: none;
}

#device_list_menu {
    display: block;
    position: absolute;
    bottom: 0;
    left: 0;
    z-index: 4;
}

/* ── Device list container ── */

#devices .device-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-family: var(--font-ui);
    font-size: var(--font-size);
}

/* ── Section header: one per ADB server (tracker-name element) ── */

#devices .tracker-name {
    font-size: 11px;
    font-weight: 700;
    color: var(--section-label);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0 2px 8px;
    margin-top: 20px;
    margin-bottom: 2px;
    border-bottom: 1px solid var(--section-border);
}

#devices .tracker-name:first-child {
    margin-top: 0;
}

/* ── Device card ── */

#devices .device-list div.device {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    padding: 14px 16px;
    box-shadow: var(--card-shadow);
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

#devices .device-list div.device:hover {
    box-shadow: var(--card-shadow-hover);
    border-color: var(--accent);
}

/* ── Device header row (name / serial / version / dot / IP) ── */

#devices .device-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0;
    margin-bottom: 10px;
}

#devices .device-header div {
    display: inline-flex;
    align-items: center;
}

/* Device name: manufacturer + model */
#devices .device-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    font-family: var(--font-ui);
}

/* Serial / UDID — keep monospace, push to far right */
#devices .device-serial {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    margin-left: auto;
}

/* Android version */
#devices .device-version {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-ui);
    align-items: baseline;
    gap: 3px;
}

#devices .device-version .sdk-version {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-muted);
}

/* Status dot */
#devices .device-state {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--status-offline);
    flex-shrink: 0;
    margin-left: 0;
}

#devices .device.active .device-state {
    background-color: var(--status-online);
}

/* Wi-Fi IP — monospace, muted */
#devices .device-wifi-ipaddr {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-muted);
}

/* ── Offline/disconnected device — fade entire card ── */

#devices .device-list .device.not-active {
    opacity: 0.5;
    pointer-events: none;
    color: var(--text-muted);
}

#devices .device-list .device.not-active a,
#devices .device-list .device.not-active a:visited {
    color: var(--text-muted);
}

/* ── Services row (action buttons) ── */

#devices .device-list div.device .services {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
}

/* Each tool injects a .desc-block wrapper div */
#devices .device-list div.desc-block {
    display: inline-flex;
    margin: 0;
}

#devices .device-list div.desc-block.hidden {
    display: none;
}

/* ── Secondary action links (shell, devtools, files, etc.) ── */
/* Tools inject <a> links — style them as buttons */

#devices .device-list div.desc-block a {
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 500;
    color: var(--btn-secondary-text);
    background: var(--btn-secondary-bg);
    border-radius: 6px;
    padding: 5px 12px;
    text-decoration: none;
    transition: background 0.12s ease, color 0.12s ease;
    white-space: nowrap;
    display: inline-block;
}

#devices .device-list div.desc-block a:hover {
    background: var(--btn-secondary-hover);
    color: var(--text-primary);
    text-decoration: none;
}

#devices .device-list div.desc-block a:visited {
    color: var(--btn-secondary-text);
}

/* ── Stream button (primary accent — configure/status stream) ── */
/* The stream desc-block contains a <button> not an <a> */

#devices .device-list div.desc-block.stream button.action-button {
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    background: var(--accent);
    border: none;
    border-radius: 6px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.12s ease;
    white-space: nowrap;
}

#devices .device-list div.desc-block.stream button.action-button:hover {
    background: var(--accent-hover);
}

/* ── Server PID button (icon-only: kill / start server) ── */
/* Stays minimal — SVG icon, no label */

#devices .device-list div.desc-block.server_pid button.action-button {
    font-family: var(--font-ui);
    font-size: 12px;
    border: none;
    border-radius: 6px;
    padding: 5px 8px;
    cursor: pointer;
    color: var(--btn-secondary-text);
    background: var(--btn-secondary-bg);
    transition: background 0.12s ease, color 0.12s ease;
    display: inline-flex;
    align-items: center;
}

#devices .device-list div.desc-block.server_pid button.action-button:hover {
    background: var(--btn-secondary-hover);
    color: var(--text-primary);
}

#devices .device-list div.desc-block button > svg {
    width: var(--font-size);
    height: var(--font-size);
    vertical-align: middle;
}

#devices .device-list div.desc-block button > svg > path {
    fill: var(--btn-secondary-text);
}

#devices .device-list .device.active div.desc-block.server_pid button.action-button:hover > svg > path {
    fill: var(--kill-button-hover-color);
}

/* ── Net interface selector ── */

#devices .device-list div.device select {
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--text-secondary);
    background: var(--btn-secondary-bg);
    border: 1px solid var(--card-border);
    border-radius: 6px;
    padding: 4px 8px;
    cursor: pointer;
}

#devices .device-list div.device:hover select {
    background: var(--btn-secondary-hover);
}

/* Net interface / stream desc-blocks: remove old border treatment,
   handled now by the shared button/link styles above */
#devices .device-list div.desc-block.stream,
#devices .device-list div.desc-block.server_pid,
#devices .device-list div.desc-block.net_interface {
    border: none;
    border-radius: 0;
    overflow: visible;
    white-space: normal;
}

/* Update-interfaces refresh button */
#devices .device-list div.device div.desc-block .action-button.update-interfaces-button {
    margin-right: 0;
}

/* Active cursor for clickable action buttons */
#devices .device-list div.device div.desc-block .action-button.active {
    cursor: pointer;
}
```

- [ ] **Step 2: Build and verify no compile errors**

```bash
npm run dist:dev 2>&1 | grep -E "ERROR|error" | head -20
```

Expected: no CSS errors. The build should complete with exit code 0.

- [ ] **Step 3: Open the app in a browser and visually verify**

```bash
node /Users/mbhealth/Workspace/ws-scrcpy-dev/dist/index.js
```

Open `http://localhost:8000` (or whichever port the server prints). Check:
1. Device cards have white background, rounded corners, subtle shadow
2. Hovering a card shows blue border highlight
3. Stream/Shell/DevTools/Files buttons all visible and styled (blue for stream, gray for others)
4. Tracker-name appears as a small uppercase section header
5. Toggle OS dark mode — cards switch to dark slate background, buttons adapt
6. Offline devices appear faded (50% opacity)
7. Serial numbers and IP addresses are in monospace, device names in system font

- [ ] **Step 4: Commit**

```bash
git add src/style/devicelist.css
git commit -m "style: rewrite devicelist.css for card-based UI (CSS-only)"
```

---

## Verification Checklist

After both tasks are complete, run through this before declaring done:

- [ ] `npm run dist:dev` exits with code 0
- [ ] `npm run lint` passes (CSS files are not linted by the ESLint config, so this is a no-op check on the changed files — run it anyway to confirm no regressions)
- [ ] Device list shows cards in light mode
- [ ] Device list shows dark cards when OS dark mode is enabled
- [ ] All action buttons are visible per active device (Stream, Shell, DevTools/whichever tools are registered, Files)
- [ ] Offline devices are visually dimmed and non-interactive
- [ ] Multiple ADB servers each show their own section header
- [ ] Clicking action links/buttons still works (no JS broken)
- [ ] Net interface selector still works
- [ ] Kill/start server SVG icon button still visible and clickable
