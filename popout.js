// Tree Tabs — Pop-out Window · by Raj Golawar
'use strict';

// ── State ──────────────────────────────────────────────────────────────────

let tabTree    = {};
let activeTabId = null;
let winId      = null;   // the SOURCE window we're tracking (passed via URL param)
let dragTabId  = null;
let dragPos    = null;
let ctxTabId   = null;

const settings = { theme:'dark', indent:16, showFavicons:true, animate:true, autoCollapse:false, collapseGroups:false, language:'auto' };

const $ = id => document.getElementById(id);

// ── i18n (shared logic, no external dep) ───────────────────────────────────

let i18nStrings = {};
const LOCALE_MAP = { en:'en', de:'de', es:'es', fr:'fr', ja:'ja', ko:'ko', pt_BR:'pt_BR', ru:'ru', zh_CN:'zh_CN', zh_TW:'zh_TW' };

async function loadLocale(lang) {
  const target = (!lang || lang === 'auto') ? (chrome.i18n.getUILanguage?.().replace('-','_') || 'en') : lang;
  const key = Object.keys(LOCALE_MAP).find(k => k === target || k === target.replace('-','_') || target.startsWith(k.split('_')[0])) || 'en';
  try {
    const raw = await (await fetch(chrome.runtime.getURL(`_locales/${key}/messages.json`))).json();
    i18nStrings = Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, v.message]));
  } catch { i18nStrings = {}; }
}

function t(key, subs = {}) {
  let msg = i18nStrings[key] || chrome.i18n.getMessage(key) || key;
  for (const [k,v] of Object.entries(subs)) msg = msg.replace(`$${k}$`, v);
  return msg;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-title]').forEach(el => el.title = t(el.dataset.i18nTitle));
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = t(el.dataset.i18nPlaceholder));
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  // Resolve which browser window this popout tracks:
  // URL param ?winId=123 is set by background when opening the popout.
  const params = new URLSearchParams(location.search);
  const paramWinId = +params.get('winId');

  const [, win] = await Promise.all([loadSettings(), chrome.windows.getCurrent()]);
  // If we have a param, track that source window; otherwise track the popout's own window
  winId = paramWinId || win.id;

  await loadLocale(settings.language);
  applyI18n();
  applyTheme();

  const resp = await msg('GET_TREE', { windowId: winId });
  if (resp) { tabTree = resp.tree || {}; activeTabId = resp.activeTabId; }
  renderTree();

  chrome.runtime.onMessage.addListener(onBgMessage);
  bindUI();
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--indent', settings.indent + 'px');
}

// ── Background messages ────────────────────────────────────────────────────

function onBgMessage({ type, tree, tabId, windowId }) {
  if (type === 'TREE_UPDATED') { tabTree = tree; renderTree(); }
  else if (type === 'TAB_ACTIVATED' && windowId === winId) {
    activeTabId = tabId;
    document.querySelectorAll('.tab-item').forEach(el =>
      el.classList.toggle('active', +el.dataset.tabId === tabId)
    );
  }
}

const msg = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload });

// ── Rendering (identical logic to sidebar.js) ──────────────────────────────

const SVG_ARROW = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_CLOSE = `<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const SVG_PAGE  = `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none" opacity=".4"/></svg>`;

function renderTree() {
  const query = $('search-input').value.trim().toLowerCase();
  const roots = Object.entries(tabTree)
    .filter(([,n]) => n.windowId === winId && !n.parentId)
    .sort(([,a],[,b]) => (a.index||0)-(b.index||0))
    .map(([id]) => +id);

  const list = $('tree-list');
  if (!roots.length) {
    list.innerHTML = '';
    $('empty-state').classList.remove('hidden');
    updateBadge(0);
    return;
  }
  $('empty-state').classList.add('hidden');
  const frag = document.createDocumentFragment();
  for (const id of roots) buildRow(id, 0, frag, query);
  list.innerHTML = '';
  list.appendChild(frag);
  updateBadge(Object.values(tabTree).filter(n => n.windowId === winId).length);
}

function buildRow(tabId, depth, container, query) {
  const node = tabTree[tabId];
  if (!node) return;
  const hasKids = node.children?.length > 0;
  const isActive = tabId === activeTabId;

  const wrap = document.createElement('div');
  wrap.className = 'tab-wrapper';
  wrap.dataset.tabId = tabId;

  const row = document.createElement('div');
  row.className = 'tab-item' + (isActive ? ' active' : '') + (node.collapsed ? ' collapsed' : '');
  row.dataset.tabId = tabId;
  row.draggable = true;
  row.style.paddingLeft = (4 + depth * settings.indent) + 'px';

  const arrow = document.createElement('div');
  arrow.className = 'collapse-btn' + (hasKids ? '' : ' no-children');
  arrow.innerHTML = SVG_ARROW;

  const fav = makeFavicon(node);

  const content = document.createElement('div');
  content.className = 'tab-content';
  const title = document.createElement('div');
  title.className = 'tab-title';
  const rawTitle = node.title || 'New Tab';
  title.innerHTML = query ? highlight(esc(rawTitle), query) : esc(rawTitle);
  content.appendChild(title);

  const badge = document.createElement('span');
  badge.className = 'children-count';
  if (hasKids) badge.textContent = countDesc(tabId);

  const close = document.createElement('div');
  close.className = 'tab-close';
  close.innerHTML = SVG_CLOSE;

  row.append(arrow, fav, content, badge, close);
  if (query && !matchSearch(tabId, query)) row.classList.add('search-hidden');

  if (hasKids) {
    const sub = document.createElement('div');
    sub.className = 'tab-subtree' + (node.collapsed ? ' collapsed' : '');
    if (!node.collapsed) sub.style.maxHeight = '9999px';
    [...node.children].sort((a,b) => (tabTree[a]?.index||0)-(tabTree[b]?.index||0))
      .forEach(cid => buildRow(cid, depth+1, sub, query));
    wrap.append(row, sub);
  } else {
    wrap.appendChild(row);
  }
  container.appendChild(wrap);
}

function makeFavicon(node) {
  const url = node.favIconUrl;
  if (settings.showFavicons && url && !url.startsWith('chrome://')) {
    const img = document.createElement('img');
    img.className = 'tab-favicon'; img.src = url;
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
  let b = $('tab-count-badge');
  if (!b) { b = document.createElement('span'); b.id = 'tab-count-badge'; $('logo-label').after(b); }
  b.textContent = count;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function countDesc(id) {
  const n = tabTree[id];
  return n?.children.reduce((s,c) => s + 1 + countDesc(c), 0) || 0;
}
function matchSearch(id, q) {
  const n = tabTree[id];
  if (!n) return false;
  if ((n.title||'').toLowerCase().includes(q) || (n.url||'').toLowerCase().includes(q)) return true;
  return n.children.some(c => matchSearch(c, q));
}
function isAncestor(ancId, id) {
  let n = tabTree[id];
  while (n?.parentId) { if (n.parentId === ancId) return true; n = tabTree[n.parentId]; }
  return false;
}
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function highlight(text, q) {
  const i = text.toLowerCase().indexOf(q);
  return i === -1 ? text : text.slice(0,i) + '<mark>' + text.slice(i, i+q.length) + '</mark>' + text.slice(i+q.length);
}

// ── Actions ────────────────────────────────────────────────────────────────

async function activateTab(tabId) {
  await msg('ACTIVATE_TAB', { tabId });
  activeTabId = tabId;
  document.querySelectorAll('.tab-item').forEach(el =>
    el.classList.toggle('active', +el.dataset.tabId === tabId)
  );
  document.querySelector(`.tab-item[data-tab-id="${tabId}"]`)?.scrollIntoView({ block:'nearest', behavior:'smooth' });
}

async function closeTab(tabId) {
  const wrap = document.querySelector(`.tab-wrapper[data-tab-id="${tabId}"]`);
  if (wrap && settings.animate) {
    Object.assign(wrap.style, { transition:'opacity .15s, max-height .15s', overflow:'hidden', opacity:'0', maxHeight:'0' });
    await new Promise(r => setTimeout(r, 160));
  }
  await msg('CLOSE_TAB', { tabId });
}

async function toggleCollapse(tabId) {
  const node = tabTree[tabId];
  if (!node) return;
  node.collapsed = !node.collapsed;
  const row = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
  const sub = row?.closest('.tab-wrapper')?.querySelector('.tab-subtree');
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
    .filter(([,n]) => n.windowId===winId && !n.parentId && n.children.length && !n.collapsed)
    .map(([id]) => +id);
  await Promise.all(ids.map(id => msg('TOGGLE_COLLAPSE', { tabId: id })));
  const r = await msg('GET_TREE', { windowId: winId });
  if (r) { tabTree = r.tree; renderTree(); }
}

async function expandAll() {
  const ids = Object.entries(tabTree)
    .filter(([,n]) => n.windowId===winId && n.collapsed)
    .map(([id]) => +id);
  await Promise.all(ids.map(id => msg('TOGGLE_COLLAPSE', { tabId: id })));
  const r = await msg('GET_TREE', { windowId: winId });
  if (r) { tabTree = r.tree; renderTree(); }
}

async function groupByDomain() {
  const btn = $('btn-group-by-domain');
  btn.classList.add('tb-btn-loading'); btn.disabled = true;
  try {
    const resp = await msg('GROUP_BY_DOMAIN', { windowId: winId, collapseGroups: settings.collapseGroups });
    if (resp?.ok) {
      showToast(t('toastGrouped', { count: resp.result.domains.length }));
      const r = await msg('GET_TREE', { windowId: winId });
      if (r) { tabTree = r.tree; activeTabId = r.activeTabId; renderTree(); }
    } else showToast(t('toastGroupFailed'), true);
  } catch(e) { showToast('Error: ' + e.message, true); }
  finally { btn.classList.remove('tb-btn-loading'); btn.disabled = false; }
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
  } catch(e) { showToast('Error: ' + e.message, true); }
  finally { btn.classList.remove('tb-btn-loading'); btn.disabled = false; }
}

// ── Drag & drop ────────────────────────────────────────────────────────────

function getRow(e) { return e.target.closest('.tab-item'); }

function onDragStart(e) {
  const row = getRow(e); if (!row) return;
  dragTabId = +row.dataset.tabId;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => row.classList.add('drag-source'), 0);
}

function onDragOver(e) {
  const row = getRow(e); if (!row || !dragTabId) return;
  const id = +row.dataset.tabId; if (id === dragTabId) return;
  e.preventDefault();
  const { top, height } = row.getBoundingClientRect();
  const y = e.clientY - top;
  const pos = y < height/3 ? 'before' : y > height*2/3 ? 'after' : 'child';
  if (dragPos !== pos) {
    dragPos = pos;
    row.style.boxShadow = pos === 'child'
      ? 'inset 2px 0 0 var(--accent), 0 0 0 1px var(--accent-dim)'
      : pos === 'before' ? 'inset 0 2px 0 var(--accent)' : 'inset 0 -2px 0 var(--accent)';
  }
}

function onDragLeave(e) { getRow(e)?.style.setProperty('box-shadow',''); dragPos = null; }

async function onDrop(e) {
  e.preventDefault();
  clearDragStyles();
  const row = getRow(e); if (!row || !dragTabId) return;
  const targetId = +row.dataset.tabId;
  if (targetId === dragTabId || isAncestor(dragTabId, targetId)) { dragTabId = null; return; }
  const parentId = dragPos === 'child' ? targetId : (tabTree[targetId]?.parentId ?? null);
  await msg('SET_PARENT', { childId: dragTabId, parentId });
  dragTabId = null; dragPos = null;
  const r = await msg('GET_TREE', { windowId: winId });
  if (r) { tabTree = r.tree; activeTabId = r.activeTabId; renderTree(); }
}

function onDragEnd() { clearDragStyles(); dragTabId = null; dragPos = null; }
function clearDragStyles() {
  document.querySelectorAll('.drag-over,.drag-source').forEach(el => {
    el.classList.remove('drag-over','drag-source'); el.style.boxShadow = '';
  });
}

// ── Context menu ───────────────────────────────────────────────────────────

function showCtx(x, y, tabId) {
  ctxTabId = tabId;
  const m = $('ctx-menu');
  m.classList.remove('hidden');
  m.style.left = Math.min(x, window.innerWidth  - 175) + 'px';
  m.style.top  = Math.min(y, window.innerHeight - 210) + 'px';
}
function hideCtx() { $('ctx-menu').classList.add('hidden'); ctxTabId = null; }

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(text, isError = false) {
  $('tst-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'tst-toast';
  el.className = 'toast' + (isError ? ' toast-error' : '');
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-visible'));
  setTimeout(() => { el.classList.remove('toast-visible'); setTimeout(() => el.remove(), 300); }, 2800);
}

// ── Settings ───────────────────────────────────────────────────────────────

async function loadSettings() {
  const { tstSettings } = await chrome.storage.local.get('tstSettings');
  if (tstSettings) try { Object.assign(settings, JSON.parse(tstSettings)); } catch {}
}

// ── UI bindings ────────────────────────────────────────────────────────────

function bindUI() {
  $('btn-new-tab')        .addEventListener('click', () => msg('NEW_TAB', { windowId: winId }));
  $('btn-group-by-domain').addEventListener('click', groupByDomain);
  $('btn-ungroup').addEventListener('click', ungroupAll);
  $('btn-collapse-all')   .addEventListener('click', collapseAll);
  $('btn-expand-all')     .addEventListener('click', expandAll);

  const si = $('search-input'), sc = $('search-clear');
  si.addEventListener('input', () => { sc.classList.toggle('hidden', !si.value); renderTree(); });
  sc.addEventListener('click', () => { si.value = ''; sc.classList.add('hidden'); renderTree(); si.focus(); });

  const list = $('tree-list');
  list.addEventListener('click', e => {
    const row = e.target.closest('.tab-item'); if (!row) return;
    const id = +row.dataset.tabId;
    if (e.target.closest('.collapse-btn')) { toggleCollapse(id); return; }
    if (e.target.closest('.tab-close'))    { closeTab(id); return; }
    activateTab(id);
  });
  list.addEventListener('contextmenu', e => {
    const row = e.target.closest('.tab-item'); if (!row) return;
    e.preventDefault(); showCtx(e.clientX, e.clientY, +row.dataset.tabId);
  });
  list.addEventListener('dragstart', onDragStart);
  list.addEventListener('dragover',  onDragOver);
  list.addEventListener('dragleave', onDragLeave);
  list.addEventListener('drop',      onDrop);
  list.addEventListener('dragend',   onDragEnd);

  $('ctx-menu').addEventListener('click', async e => {
    const item = e.target.closest('.ctx-item'); if (!item || !ctxTabId) return;
    const id = ctxTabId; hideCtx();
    switch (item.dataset.action) {
      case 'activate':      await activateTab(id); break;
      case 'new-child':     await msg('NEW_CHILD_TAB', { parentId: id, windowId: winId }); break;
      case 'duplicate':     await msg('DUPLICATE_TAB', { tabId: id }); break;
      case 'detach':
        await msg('DETACH_TAB', { tabId: id });
        const r = await msg('GET_TREE', { windowId: winId });
        if (r) { tabTree = r.tree; renderTree(); } break;
      case 'collapse-tree': if (!tabTree[id]?.collapsed) await toggleCollapse(id); break;
      case 'close':         await closeTab(id); break;
      case 'close-tree':    await msg('CLOSE_TREE', { tabId: id }); break;
    }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#ctx-menu')) hideCtx(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideCtx(); if (si.value) { si.value = ''; sc.classList.add('hidden'); renderTree(); } }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); si.focus(); si.select(); }
  });
}

init();
