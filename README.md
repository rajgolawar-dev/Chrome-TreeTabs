<div align="center">

# 🌿 Tree Tabs

**Organize your Chrome tabs as a visual, collapsible tree — right in the side panel.**

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4f8ef7)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Chrome](https://img.shields.io/badge/Chrome-114%2B-4f8ef7?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://github.com/rajgolawar-dev/Chrome-TreeTabs/blob/init/LICENSE.md)
[![Languages](https://img.shields.io/badge/i18n-10%20languages-orange)](#-languages)
[![Version](https://img.shields.io/badge/version-1.0.3-blue)](#)

Bringing the beloved Firefox tree-style tab experience to Chrome.

</div>

---

## ✨ Features

| | |
|---|---|
| 🌿 **Tree structure** | Tabs opened from a link automatically become children of the tab that opened them — your browsing branches into a readable map. |
| 📁 **Collapse & expand** | Fold entire branches with one click. A badge shows how many tabs are hidden inside. |
| 🖱️ **Drag & drop** | Drag any tab onto another to reparent it, or before/after to reorder. |
| 🌐 **Group by domain** | One click alphabetically groups all tabs by domain and creates matching Chrome Tab Groups — `reddit.com (4)`, `github.com (2)`. |
| ↩️ **Ungroup** | Instantly revert grouping back to a flat list. |
| 🔍 **Live search** | Filter tabs in real time with highlighted matches. |
| ↗️ **Pop-out window** | Detach the tree into a floating window you can place anywhere. |
| 🎨 **Three themes** | Dark, Light, and AMOLED — switch instantly, no reload. |
| 🌍 **10 languages** | Auto-detects your Chrome UI language. |
| 💾 **Persistent** | Tree structure, collapse states, and settings survive restarts. |

---

## 📦 Installation

### From the Chrome Web Store
> *Coming soon — pending review.*

### From source (developer mode)

```bash
git clone https://github.com/rajgolawar/tree-tabs.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the cloned `tree-tabs` folder
5. Click the Tree Tabs icon in the toolbar — or press <kbd>Alt</kbd>+<kbd>T</kbd>

> **Requires Chrome 114+** (for the Side Panel API).

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Alt</kbd> + <kbd>T</kbd> | Toggle the side panel |
| <kbd>Alt</kbd> + <kbd>P</kbd> | Pop out the tree as a floating window |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Focus the search bar |

---

## 🖱️ Usage

- **Click** a tab to switch to it.
- **Click the arrow** beside a tab to collapse/expand its branch.
- **Right-click** any tab for: Switch To, Open Child Tab, Duplicate, Detach from Tree, Collapse Branch, Close Tab, Close Branch.
- **Drag** a tab onto another to nest it; drop before/after to reorder.
- Use the toolbar buttons to **add a tab**, **group by domain**, **ungroup**, **collapse/expand all**, **pop out**, and open **settings**.

---

## ⚙️ Settings

- **Theme** — Dark / Light / AMOLED
- **Indent size** — Compact / Normal / Spacious
- **Show favicons** — on/off
- **Animations** — on/off
- **Auto-collapse siblings** — fold neighbouring branches automatically
- **Collapse groups after grouping** — auto-fold Chrome Tab Groups after a domain group
- **Language** — pick from 10, or auto-detect

---

## 🌍 Languages

English (US) · Deutsch · Español · Français · 日本語 · 한국어 · Português (Brasil) · Русский · 简体中文 · 繁體中文

---

## 🏗️ Project Structure

```
tree-tabs/
├── manifest.json        # MV3 manifest
├── background.js        # Service worker — tree state, tab events, grouping
├── sidebar.html/js/css  # Main side-panel UI
├── popout.js            # Pop-out window logic (shares sidebar.css)
├── popout.html          # Pop-out window markup
├── _locales/            # 10 language packs (chrome.i18n)
│   ├── en/ de/ es/ fr/ ja/
│   └── ko/ pt_BR/ ru/ zh_CN/ zh_TW/
└── icons/               # 16 / 32 / 48 / 128 px
```

### How it works

The **service worker** (`background.js`) maintains the tab tree as an in-memory map of `tabId → { parentId, children, collapsed, … }`, persisted to `chrome.storage.local`. It listens to `chrome.tabs` events (created, removed, updated, moved, activated) and rebuilds parent–child relationships from each tab's `openerTabId`. The **side panel** and **pop-out** are thin rendering layers that request the tree, render it, and send action messages back.

---

## 🔒 Privacy

Tree Tabs collects **no data**. Everything — your tab tree and settings — is stored locally via `chrome.storage.local` and never leaves your device. No analytics, no tracking, no external servers. See the [privacy policy](#) for details.

**Permissions used:** `tabs`, `storage`, `sidePanel`, `tabGroups`, `contextMenus` — each scoped to a specific feature.

---

## 🛠️ Tech

- **Manifest V3** service worker architecture
- Vanilla JavaScript — no frameworks, no build step
- Chrome [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) and [Tab Groups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups)
- Native `chrome.i18n` for localization

---

## 🤝 Contributing

Contributions, bug reports, and feature ideas are welcome. Open an issue or submit a pull request.

Adding a translation: copy `_locales/en/messages.json` into a new locale folder (e.g. `_locales/it/`), translate each `message` value, and open a PR.

---

## 📄 License

Released under the [MIT License](LICENSE.md). © 2026 Raj Golawar.

---

<div align="center">

Built by **Raj Golawar**

</div>
