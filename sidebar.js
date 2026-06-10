// Tree Tabs — Sidebar · by Raj Golawar
'use strict';

// ── State ──────────────────────────────────────────────────────────────────

let tabTree      = {};
let activeTabId  = null;
let winId        = null;
let dragTabId    = null;
let dragPos      = null;   // 'child' | 'before' | 'after'
let ctxTabId     = null;

const settings = { theme:'dark', indent:16, showFavicons:true, animate:true, autoCollapse:false, collapseGroups:false, language:'auto' };

// ── Cached DOM refs ────────────────────────────────────────────────────────

const $  = id => document.getElementById(id);
const $list     = () => $('tree-list');
const $empty    = () => $('empty-state');
const $search   = () => $('search-input');
const $ctxMenu  = () => $('ctx-menu');

// ── i18n ───────────────────────────────────────────────────────────────────

// Cache of loaded locale strings
let i18nStrings = {};

// Maps our locale codes to Chrome's _locales folder names
const LOCALE_MAP = {
  en: 'en', de: 'de', es: 'es', fr: 'fr', ja: 'ja',
  ko: 'ko', pt_BR: 'pt_BR', ru: 'ru', zh_CN: 'zh_CN', zh_TW: 'zh_TW'
};

async function loadLocale(lang) {
  // 'auto' = use Chrome's UI language, falling back to en
  const target = (!lang || lang === 'auto')
    ? (chrome.i18n.getUILanguage?.().replace('-','_') || 'en')
    : lang;

  // Find the best matching locale key (e.g. 'zh_CN' for 'zh-CN')
  const key = Object.keys(LOCALE_MAP).find(k =>
    k === target || k === target.replace('-','_') || target.startsWith(k.split('_')[0])
  ) || 'en';

  try {
    const url = chrome.runtime.getURL(`_locales/${key}/messages.json`);
    const resp = await fetch(url);
    const raw  = await resp.json();
    // Flatten to key → message string
    i18nStrings = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.message]));
  } catch {
    i18nStrings = {};
  }
}

// Translate a key, optionally substituting $count$
function t(key, subs = {}) {
  let msg = i18nStrings[key] || chrome.i18n.getMessage(key) || key;
  for (const [k, v] of Object.entries(subs)) msg = msg.replace(`$${k}$`, v);
  return msg;
}

// Walk the DOM and apply translations to all data-i18n* elements
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const [, win] = await Promise.all([loadSettings(), chrome.windows.getCurrent()]);
  winId = win.id;
  await loadLocale(settings.language);
  applyI18n();
  applySettings();

  const resp = await msg('GET_TREE', { windowId: winId });
  if (resp) { tabTree = resp.tree || {}; activeTabId = resp.activeTabId; }
  renderTree();

  chrome.runtime.onMessage.addListener(onBgMessage);
  bindUI();
  initPanelSide();
}

// ── Background messages ────────────────────────────────────────────────────

function onBgMessage({ type, tree, tabId, windowId }) {
  if (type === 'TREE_UPDATED') {
    tabTree = tree;
    renderTree();
  } else if (type === 'TAB_ACTIVATED' && windowId === winId) {
    activeTabId = tabId;
    // Fast path: just toggle class, no full re-render
    document.querySelectorAll('.tab-item').forEach(el =>
      el.classList.toggle('active', +el.dataset.tabId === tabId)
    );
  }
}

// ── Messaging helper ───────────────────────────────────────────────────────

const msg = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload });

// ── Rendering ──────────────────────────────────────────────────────────────

// Pre-built SVG strings (avoid re-creating on every row)
const SVG_ARROW = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_CLOSE = `<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const SVG_PAGE  = `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none" opacity=".4"/></svg>`;

function renderTree() {
  const query = $search().value.trim().toLowerCase();

  const roots = Object.entries(tabTree)
    .filter(([, n]) => n.windowId === winId && !n.parentId)
    .sort(([, a], [, b]) => (a.index || 0) - (b.index || 0))
    .map(([id]) => +id);

  if (!roots.length) {
    $list().innerHTML = '';
    $empty().classList.remove('hidden');
    updateBadge(0);
    return;
  }
  $empty().classList.add('hidden');

  const frag = document.createDocumentFragment();
  for (const id of roots) buildRow(id, 0, frag, query);

  $list().innerHTML = '';
  $list().appendChild(frag);
  updateBadge(Object.values(tabTree).filter(n => n.windowId === winId).length);
}

function buildRow(tabId, depth, container, query) {
  const node = tabTree[tabId];
  if (!node) return;

  const hasKids    = node.children?.length > 0;
  const isActive   = tabId === activeTabId;
  const isCollapsed = node.collapsed;

  // Wrapper
  const wrap = document.createElement('div');
  wrap.className = 'tab-wrapper';
  wrap.dataset.tabId = tabId;

  // Row
  const row = document.createElement('div');
  row.className = 'tab-item' + (isActive ? ' active' : '') + (isCollapsed ? ' collapsed' : '');
  row.dataset.tabId = tabId;
  row.draggable = true;
  row.style.paddingLeft = (4 + depth * settings.indent) + 'px';

  // Collapse arrow
  const arrow = document.createElement('div');
  arrow.className = 'collapse-btn' + (hasKids ? '' : ' no-children');
  arrow.innerHTML = SVG_ARROW;

  // Favicon
  const fav = makeFavicon(node);

  // Title
  const content = document.createElement('div');
  content.className = 'tab-content';
  const title = document.createElement('div');
  title.className = 'tab-title';
  const rawTitle = node.title || 'New Tab';
  title.innerHTML = query ? highlight(esc(rawTitle), query) : esc(rawTitle);
  content.appendChild(title);

  // Child count badge
  const badge = document.createElement('span');
  badge.className = 'children-count';
  if (hasKids) badge.textContent = countDesc(tabId);

  // Close button
  const close = document.createElement('div');
  close.className = 'tab-close';
  close.innerHTML = SVG_CLOSE;

  row.append(arrow, fav, content, badge, close);

  // Search filter
  if (query && !matchSearch(tabId, query)) row.classList.add('search-hidden');

  // Children subtree
  if (hasKids) {
    const sub = document.createElement('div');
    sub.className = 'tab-subtree' + (isCollapsed ? ' collapsed' : '');
    if (!isCollapsed) sub.style.maxHeight = '9999px';
    const sorted = [...node.children].sort((a, b) => (tabTree[a]?.index || 0) - (tabTree[b]?.index || 0));
    for (const cid of sorted) buildRow(cid, depth + 1, sub, query);
    wrap.appendChild(row);
    wrap.appendChild(sub);
  } else {
    wrap.appendChild(row);
  }

  container.appendChild(wrap);
}

function makeFavicon(node) {
  const url = node.favIconUrl;
  if (settings.showFavicons && url && !url.startsWith('chrome://')) {
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = url;
    img.onerror = () => img.replaceWith(pagePlaceholder());
    return img;
  }
  return pagePlaceholder();
}

function pagePlaceholder() {
  const el = document.createElement('div');
  el.className = 'tab-favicon-placeholder';
  el.innerHTML = SVG_PAGE;
  return el;
}

function updateBadge(count) {
  let badge = $('tab-count-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'tab-count-badge';
    $('logo-label').after(badge);
  }
  badge.textContent = count;
}

// ── Tree helpers ───────────────────────────────────────────────────────────

function countDesc(tabId) {
  const n = tabTree[tabId];
  if (!n?.children.length) return 0;
  return n.children.reduce((s, c) => s + 1 + countDesc(c), 0);
}

function matchSearch(tabId, q) {
  const n = tabTree[tabId];
  if (!n) return false;
  if ((n.title || '').toLowerCase().includes(q) || (n.url || '').toLowerCase().includes(q)) return true;
  return n.children.some(c => matchSearch(c, q));
}

function isAncestor(ancId, tabId) {
  let n = tabTree[tabId];
  while (n?.parentId) {
    if (n.parentId === ancId) return true;
    n = tabTree[n.parentId];
  }
  return false;
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlight(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text;
  return text.slice(0, i) + '<mark>' + text.slice(i, i + q.length) + '</mark>' + text.slice(i + q.length);
}

// ── Actions ────────────────────────────────────────────────────────────────

async function activateTab(tabId) {
  await msg('ACTIVATE_TAB', { tabId });
  activeTabId = tabId;
  document.querySelectorAll('.tab-item').forEach(el =>
    el.classList.toggle('active', +el.dataset.tabId === tabId)
  );
  document.querySelector(`.tab-item[data-tab-id="${tabId}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function closeTab(tabId) {
  const wrap = document.querySelector(`.tab-wrapper[data-tab-id="${tabId}"]`);
  if (wrap && settings.animate) {
    Object.assign(wrap.style, { transition: 'opacity .15s, max-height .15s', overflow: 'hidden', opacity: '0', maxHeight: '0' });
    await new Promise(r => setTimeout(r, 160));
  }
  await msg('CLOSE_TAB', { tabId });
}

async function toggleCollapse(tabId) {
  const node = tabTree[tabId];
  if (!node) return;
  node.collapsed = !node.collapsed;

  const row  = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
  const sub  = row?.closest('.tab-wrapper')?.querySelector('.tab-subtree');
  row?.classList.toggle('collapsed', node.collapsed);

  if (sub) {
    if (node.collapsed) {
      sub.style.maxHeight = sub.scrollHeight + 'px';
      requestAnimationFrame(() => { sub.classList.add('collapsed'); sub.style.maxHeight = '0'; });
    } else {
      sub.classList.remove('collapsed');
      sub.style.maxHeight = sub.scrollHeight + 'px';
      setTimeout(() => { sub.style.maxHeight = '9999px'; }, 220);
    }
  }
  await msg('TOGGLE_COLLAPSE', { tabId });
}

async function collapseAll() {
  const ids = Object.entries(tabTree)
    .filter(([, n]) => n.windowId === winId && !n.parentId && n.children.length && !n.collapsed)
    .map(([id]) => +id);
  await Promise.all(ids.map(id => msg('TOGGLE_COLLAPSE', { tabId: id })));
  const resp = await msg('GET_TREE', { windowId: winId });
  if (resp) { tabTree = resp.tree; renderTree(); }
}

async function expandAll() {
  const ids = Object.entries(tabTree)
    .filter(([, n]) => n.windowId === winId && n.collapsed)
    .map(([id]) => +id);
  await Promise.all(ids.map(id => msg('TOGGLE_COLLAPSE', { tabId: id })));
  const resp = await msg('GET_TREE', { windowId: winId });
  if (resp) { tabTree = resp.tree; renderTree(); }
}

// ── Drag & drop (event delegation on tree-list) ────────────────────────────

function getRow(e) { return e.target.closest('.tab-item'); }

function onDragStart(e) {
  const row = getRow(e);
  if (!row) return;
  dragTabId = +row.dataset.tabId;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => row.classList.add('drag-source'), 0);
}

function onDragOver(e) {
  const row = getRow(e);
  if (!row || !dragTabId) return;
  const id = +row.dataset.tabId;
  if (id === dragTabId) return;
  e.preventDefault();

  const { top, height } = row.getBoundingClientRect();
  const y = e.clientY - top;
  const pos = y < height / 3 ? 'before' : y > (height * 2 / 3) ? 'after' : 'child';

  if (dragPos !== pos) {
    dragPos = pos;
    row.style.boxShadow = pos === 'child'
      ? 'inset 2px 0 0 var(--accent), 0 0 0 1px var(--accent-dim)'
      : pos === 'before' ? 'inset 0 2px 0 var(--accent)' : 'inset 0 -2px 0 var(--accent)';
  }
}

function onDragLeave(e) {
  getRow(e)?.style.setProperty('box-shadow', '');
  dragPos = null;
}

async function onDrop(e) {
  e.preventDefault();
  clearDragStyles();
  const row = getRow(e);
  if (!row || !dragTabId) return;
  const targetId = +row.dataset.tabId;
  if (targetId === dragTabId || isAncestor(dragTabId, targetId)) { dragTabId = null; return; }

  const parentId = dragPos === 'child' ? targetId : (tabTree[targetId]?.parentId ?? null);
  await msg('SET_PARENT', { childId: dragTabId, parentId });
  dragTabId = null; dragPos = null;
  const resp = await msg('GET_TREE', { windowId: winId });
  if (resp) { tabTree = resp.tree; activeTabId = resp.activeTabId; renderTree(); }
}

function onDragEnd() { clearDragStyles(); dragTabId = null; dragPos = null; }

function clearDragStyles() {
  document.querySelectorAll('.drag-over,.drag-source').forEach(el => {
    el.classList.remove('drag-over', 'drag-source');
    el.style.boxShadow = '';
  });
}

// ── Context menu ───────────────────────────────────────────────────────────

function showCtx(x, y, tabId) {
  ctxTabId = tabId;
  const m = $ctxMenu();
  m.classList.remove('hidden');
  m.style.left = Math.min(x, window.innerWidth  - 175) + 'px';
  m.style.top  = Math.min(y, window.innerHeight - 210) + 'px';
}

function hideCtx() { $ctxMenu().classList.add('hidden'); ctxTabId = null; }

// ── Group by domain ────────────────────────────────────────────────────────

async function groupByDomain() {
  const btn = $('btn-group-by-domain');
  btn.classList.add('tb-btn-loading'); btn.disabled = true;
  try {
    const resp = await msg('GROUP_BY_DOMAIN', { windowId: winId, collapseGroups: settings.collapseGroups });
    if (resp?.ok) {
      showToast(t('toastGrouped', { count: resp.result.domains.length }));
      const r = await msg('GET_TREE', { windowId: winId });
      if (r) { tabTree = r.tree; activeTabId = r.activeTabId; renderTree(); }
    } else {
      showToast(t('toastGroupFailed'), true);
    }
  } catch (e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.classList.remove('tb-btn-loading'); btn.disabled = false;
  }
}

async function ungroupAll() {
  const btn = $('btn-ungroup');
  btn.classList.add('tb-btn-loading'); btn.disabled = true;
  try {
    const resp = await msg('UNGROUP_ALL', { windowId: winId });
    if (resp?.ok) {
      showToast(resp.result.groups > 0 ? t('toastUngrouped') : t('toastNothingToUngroup'),
                resp.result.groups === 0);
      const r = await msg('GET_TREE', { windowId: winId });
      if (r) { tabTree = r.tree; activeTabId = r.activeTabId; renderTree(); }
    }
  } catch (e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.classList.remove('tb-btn-loading'); btn.disabled = false;
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(text, isError = false) {
  $('tst-toast')?.remove();
  const t = document.createElement('div');
  t.id = 'tst-toast';
  t.className = 'toast' + (isError ? ' toast-error' : '');
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-visible'));
  setTimeout(() => { t.classList.remove('toast-visible'); setTimeout(() => t.remove(), 300); }, 2800);
}

// ── Panel side setting ─────────────────────────────────────────────────────

async function initPanelSide() {
  const { panelSide = 'right' } = await chrome.storage.local.get('panelSide');
  setSideActive(panelSide);
  $('btn-side-left') .addEventListener('click', () => onSideClick('left'));
  $('btn-side-right').addEventListener('click', () => onSideClick('right'));
}

function setSideActive(side) {
  $('btn-side-left') .classList.toggle('active', side === 'left');
  $('btn-side-right').classList.toggle('active', side === 'right');
}

function onSideClick(side) {
  chrome.storage.local.set({ panelSide: side });
  setSideActive(side);
  const note = $('panel-side-note');
  note.classList.remove('hidden');
  note.textContent = side === 'left' ? t('panelNoteLeft') : t('panelNoteRight');
}

// ── Settings ───────────────────────────────────────────────────────────────

async function loadSettings() {
  const { tstSettings } = await chrome.storage.local.get('tstSettings');
  if (tstSettings) try { Object.assign(settings, JSON.parse(tstSettings)); } catch {}
}

const saveSettings = () => chrome.storage.local.set({ tstSettings: JSON.stringify(settings) });

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--indent', settings.indent + 'px');
  $('setting-theme')          && ($('setting-theme').value           = settings.theme);
  $('setting-indent')         && ($('setting-indent').value          = settings.indent);
  $('setting-favicons')       && ($('setting-favicons').checked      = settings.showFavicons);
  $('setting-animate')        && ($('setting-animate').checked       = settings.animate);
  $('setting-auto-collapse')  && ($('setting-auto-collapse').checked = settings.autoCollapse);
  $('setting-collapse-groups')&& ($('setting-collapse-groups').checked = settings.collapseGroups);
  $('setting-language')       && ($('setting-language').value          = settings.language);
}

// ── UI bindings ────────────────────────────────────────────────────────────

function bindUI() {
  // Toolbar
  $('btn-new-tab')         .addEventListener('click', () => msg('NEW_TAB', { windowId: winId }));
  $('btn-popout')          .addEventListener('click', () => msg('OPEN_POPOUT', { windowId: winId }));
  $('btn-group-by-domain') .addEventListener('click', groupByDomain);
  $('btn-ungroup')         .addEventListener('click', ungroupAll);
  $('btn-collapse-all')    .addEventListener('click', collapseAll);
  $('btn-expand-all')      .addEventListener('click', expandAll);
  $('btn-settings')        .addEventListener('click', () => $('settings-panel').classList.toggle('hidden'));
  $('settings-close')      .addEventListener('click', () => $('settings-panel').classList.add('hidden'));

  // Search
  const si = $('search-input'), sc = $('search-clear');
  si.addEventListener('input', () => { sc.classList.toggle('hidden', !si.value); renderTree(); });
  sc.addEventListener('click', () => { si.value = ''; sc.classList.add('hidden'); renderTree(); si.focus(); });

  // Settings inputs
  $('setting-theme').addEventListener('change', e => {
    settings.theme = e.target.value; saveSettings(); applySettings();
  });
  $('setting-indent').addEventListener('change', e => {
    settings.indent = +e.target.value;
    document.documentElement.style.setProperty('--indent', settings.indent + 'px');
    saveSettings(); renderTree();
  });
  $('setting-favicons').addEventListener('change', e => {
    settings.showFavicons = e.target.checked; saveSettings(); renderTree();
  });
  $('setting-animate').addEventListener('change', e => {
    settings.animate = e.target.checked; saveSettings();
  });
  $('setting-auto-collapse').addEventListener('change', e => {
    settings.autoCollapse = e.target.checked; saveSettings();
  });
  $('setting-collapse-groups').addEventListener('change', e => {
    settings.collapseGroups = e.target.checked; saveSettings();
  });
  $('setting-language').addEventListener('change', async e => {
    settings.language = e.target.value;
    saveSettings();
    await loadLocale(settings.language);
    applyI18n();
  });

  // Tree: event delegation for clicks, drag, context menu
  const list = $('tree-list');
  list.addEventListener('click', e => {
    const row  = e.target.closest('.tab-item');
    if (!row) return;
    const id = +row.dataset.tabId;
    if (e.target.closest('.collapse-btn')) { toggleCollapse(id); return; }
    if (e.target.closest('.tab-close'))    { closeTab(id); return; }
    activateTab(id);
  });
  list.addEventListener('contextmenu', e => {
    const row = e.target.closest('.tab-item');
    if (!row) return;
    e.preventDefault();
    showCtx(e.clientX, e.clientY, +row.dataset.tabId);
  });
  list.addEventListener('dragstart',  onDragStart);
  list.addEventListener('dragover',   onDragOver);
  list.addEventListener('dragleave',  onDragLeave);
  list.addEventListener('drop',       onDrop);
  list.addEventListener('dragend',    onDragEnd);

  // Context menu
  $ctxMenu().addEventListener('click', async e => {
    const item = e.target.closest('.ctx-item');
    if (!item || !ctxTabId) return;
    const id = ctxTabId; hideCtx();
    switch (item.dataset.action) {
      case 'activate':      await activateTab(id); break;
      case 'new-child':     await msg('NEW_CHILD_TAB', { parentId: id, windowId: winId }); break;
      case 'duplicate':     await msg('DUPLICATE_TAB', { tabId: id }); break;
      case 'detach':        await msg('DETACH_TAB', { tabId: id });
                            const r = await msg('GET_TREE', { windowId: winId });
                            if (r) { tabTree = r.tree; renderTree(); } break;
      case 'collapse-tree': if (!tabTree[id]?.collapsed) await toggleCollapse(id); break;
      case 'close':         await closeTab(id); break;
      case 'close-tree':    await msg('CLOSE_TREE', { tabId: id }); break;
    }
  });
  document.addEventListener('click',   e => { if (!e.target.closest('#ctx-menu'))      hideCtx(); });
  document.addEventListener('click',   e => { if (!e.target.closest('#settings-panel,#btn-settings'))
                                                $('settings-panel').classList.add('hidden'); });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      hideCtx();
      $('settings-panel').classList.add('hidden');
      if (si.value) { si.value = ''; sc.classList.add('hidden'); renderTree(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); si.focus(); si.select(); }
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────

init();
