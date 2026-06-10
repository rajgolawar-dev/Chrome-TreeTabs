# Contributing to Tree Tabs

Thanks for your interest in improving Tree Tabs! Bug reports, feature ideas, translations, and pull requests are all welcome.

---

## Ways to Contribute

- 🐛 **Report a bug** — open an issue describing what happened and how to reproduce it
- 💡 **Suggest a feature** — open an issue describing the idea and why it would help
- 🌍 **Add a translation** — see [Adding a Language](#adding-a-language) below
- 🔧 **Fix or build something** — open a pull request

---

## Getting Started

This is a vanilla JavaScript extension with **no build step** — what you see is what ships.

```bash
# 1. Fork the repo, then clone your fork
git clone https://github.com/YOUR_USERNAME/tree-tabs.git
cd tree-tabs

# 2. Load it in Chrome
#    - open chrome://extensions
#    - enable "Developer mode"
#    - click "Load unpacked" and select the tree-tabs folder

# 3. After editing, click the refresh icon on the extension card to reload
```

> **Requires Chrome 114+** for the Side Panel API.

There are no dependencies to install and nothing to compile.

---

## Project Structure

```
tree-tabs/
├── manifest.json        # MV3 manifest — permissions, commands, entry points
├── background.js        # Service worker — tree state, tab events, grouping logic
├── sidebar.html         # Main side-panel markup
├── sidebar.js           # Side-panel rendering + interactions
├── sidebar.css          # Shared styles (used by sidebar AND popout)
├── popout.html          # Pop-out window markup
├── popout.js            # Pop-out window logic
├── _locales/            # 10 language packs (chrome.i18n)
└── icons/               # 16 / 32 / 48 / 128 px
```

### How the pieces fit together

- **`background.js`** owns the source of truth: an in-memory map of `tabId → { parentId, children, collapsed, title, url, … }`, persisted to `chrome.storage.local`. It listens to `chrome.tabs` events and rebuilds parent–child links from each tab's `openerTabId`. All tab actions (close, group, reparent) are handled here via a message router.
- **`sidebar.js`** and **`popout.js`** are rendering layers. They request the tree, draw it, and send action messages back to the service worker. They share `sidebar.css`.
- Keep business logic in the service worker; keep the UI layers thin.

---

## Coding Guidelines

- **Vanilla JS only** — no frameworks, no build tooling, no npm dependencies
- **Match the existing style** — 2-space indent, single quotes, concise helpers
- **Keep it lean** — prefer small, readable functions over cleverness
- **Never use `innerHTML` with unescaped user data** — tab titles/URLs must pass through the existing `esc()` helper. Only static SVG constants may be assigned directly.
- **Externalize all user-facing strings** — never hardcode display text. Add a key to every `_locales/*/messages.json` and reference it with a `data-i18n` attribute or the `t()` helper (see below)
- **Test in both the sidebar and the pop-out** — most features need to work in both
- **Respect minimal permissions** — if a change needs a new permission, call it out clearly in the PR and explain why

---

## Adding a Language

Localization uses Chrome's native `chrome.i18n` system. To add a language:

1. Copy the English pack as a starting point:
   ```bash
   cp -r _locales/en _locales/<locale-code>
   ```
   Use Chrome's locale codes — e.g. `it` (Italian), `nl` (Dutch), `pt_PT` (European Portuguese).

2. Open `_locales/<locale-code>/messages.json` and translate **only** the `"message"` values. Leave the keys unchanged.

3. Keep placeholders intact — e.g. `$count$` in `toastGrouped` must remain in the translated string.

4. Add your language to the picker in **both** `sidebar.html` and `popout.html` (the `#setting-language` `<select>`), and to the `LOCALE_MAP` in `sidebar.js` and `popout.js`.

5. Reload the extension, switch to your language in Settings, and verify every screen.

6. Open a PR titled `i18n: add <Language>`.

---

## Submitting a Pull Request

1. Create a branch: `git checkout -b my-feature`
2. Make your change and test it in Chrome (both sidebar and pop-out)
3. Commit with a clear message: `git commit -m "Add X"`
4. Push and open a PR against `main`
5. In the PR description, include:
   - **What** the change does
   - **Why** it's useful
   - **How** you tested it (and screenshots/GIFs for UI changes)

Keep PRs focused — one feature or fix per PR is easier to review and merge.

---

## Reporting Bugs

Open an issue with:

- **What you expected** vs **what happened**
- **Steps to reproduce**
- Your **Chrome version** and **OS**
- Console errors if any (open the side panel, right-click → Inspect → Console)

---

## Code of Conduct

Be kind and constructive. Assume good intent, give helpful feedback, and keep discussions focused on the work. Harassment or disrespectful behavior won't be tolerated.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers this project.

---

Thanks for helping make Tree Tabs better! 🌿
