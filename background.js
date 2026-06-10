// Tree Tabs — Background Service Worker
// Author: Raj Golawar
'use strict';

// ── State ──────────────────────────────────────────────────────────────────

let tabTree = {};

// ── Persistence ────────────────────────────────────────────────────────────

const saveTree = () => chrome.storage.local.set({ tabTree: JSON.stringify(tabTree) });

async function loadTree() {
  const { tabTree: saved } = await chrome.storage.local.get('tabTree');
  if (saved) try { tabTree = JSON.parse(saved); } catch {}
}

// ── Tree helpers ───────────────────────────────────────────────────────────

function setParent(childId, parentId) {
  const child = tabTree[childId];
  if (!child) return;
  // Detach from old parent
  const oldParent = tabTree[child.parentId];
  if (oldParent) oldParent.children = oldParent.children.filter(id => id !== childId);
  // Attach to new parent
  child.parentId = parentId || null;
  const newParent = tabTree[parentId];
  if (newParent && !newParent.children.includes(childId)) newParent.children.push(childId);
}

function removeNode(tabId) {
  const node = tabTree[tabId];
  if (!node) return;
  // Re-parent children up to this node's parent
  const { parentId, children } = node;
  for (const cid of children) {
    if (tabTree[cid]) {
      tabTree[cid].parentId = parentId || null;
      if (parentId && tabTree[parentId] && !tabTree[parentId].children.includes(cid))
        tabTree[parentId].children.push(cid);
    }
  }
  if (parentId && tabTree[parentId])
    tabTree[parentId].children = tabTree[parentId].children.filter(id => id !== tabId);
  delete tabTree[tabId];
}

function allDescendants(tabId) {
  const node = tabTree[tabId];
  if (!node) return [];
  return node.children.flatMap(cid => [cid, ...allDescendants(cid)]);
}

function nodeFromTab(tab) {
  return {
    parentId: null,
    children: [],
    collapsed: false,
    title: tab.title || 'New Tab',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl || '',
    windowId: tab.windowId,
    index: tab.index
  };
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function broadcastTree() {
  broadcast({ type: 'TREE_UPDATED', tree: tabTree });
}

// ── Sync on startup ────────────────────────────────────────────────────────

async function syncAllTabs() {
  await loadTree();
  const tabs = await chrome.tabs.query({});
  const liveIds = new Set(tabs.map(t => t.id));

  for (const tab of tabs) {
    if (!tabTree[tab.id]) {
      tabTree[tab.id] = nodeFromTab(tab);
      if (tab.openerTabId && tabTree[tab.openerTabId]) setParent(tab.id, tab.openerTabId);
    }
  }
  // Prune dead entries
  for (const id of Object.keys(tabTree))
    if (!liveIds.has(+id)) removeNode(+id);

  await saveTree();
  broadcastTree();
}

// ── Tab listeners ──────────────────────────────────────────────────────────

chrome.tabs.onCreated.addListener(async tab => {
  tabTree[tab.id] = nodeFromTab(tab);
  if (tab.openerTabId && tabTree[tab.openerTabId]) setParent(tab.id, tab.openerTabId);
  await saveTree();
  broadcastTree();
});

chrome.tabs.onRemoved.addListener(async tabId => {
  removeNode(tabId);
  await saveTree();
  broadcastTree();
});

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (!tabTree[tabId]) tabTree[tabId] = nodeFromTab(tab);
  const n = tabTree[tabId];
  if (change.title     !== undefined) n.title      = change.title;
  if (change.url       !== undefined) n.url        = change.url;
  if (change.favIconUrl!== undefined) n.favIconUrl = change.favIconUrl;
  // Prefer full tab object values (more complete)
  if (tab.title)      n.title      = tab.title;
  if (tab.url)        n.url        = tab.url;
  if (tab.favIconUrl) n.favIconUrl = tab.favIconUrl;
  await saveTree();
  broadcastTree();
});

chrome.tabs.onMoved.addListener(async (tabId, { toIndex }) => {
  if (tabTree[tabId]) { tabTree[tabId].index = toIndex; await saveTree(); broadcastTree(); }
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  broadcast({ type: 'TAB_ACTIVATED', tabId, windowId });
});

// ── Side panel ─────────────────────────────────────────────────────────────

function setupSidePanel() {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

// ── Domain grouping ────────────────────────────────────────────────────────

const GROUP_COLORS = ['blue','cyan','green','grey','orange','pink','purple','red','yellow'];

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

async function groupByDomain(windowId, collapseGroups = false) {
  const SKIP = ['chrome://', 'chrome-extension://', 'about:'];
  const tabs = await chrome.tabs.query({ windowId });
  const navTabs = tabs.filter(t => t.url && !SKIP.some(p => t.url.startsWith(p)));

  // Build domain → tabIds map
  const domainMap = {};
  for (const tab of navTabs) {
    const d = extractDomain(tab.url);
    if (d) (domainMap[d] ??= []).push(tab.id);
  }
  const domains = Object.keys(domainMap).sort();

  // Clear existing groups
  const existing = await chrome.tabGroups.query({ windowId });
  await Promise.all(existing.map(async g => {
    const gt = await chrome.tabs.query({ groupId: g.id });
    if (gt.length) await chrome.tabs.ungroup(gt.map(t => t.id)).catch(() => {});
  }));

  // Move + group tabs by domain alphabetically
  let idx = 0;
  const groupIds = {};
  for (const domain of domains) {
    const ids = domainMap[domain];
    await chrome.tabs.move(ids, { windowId, index: idx }).catch(() => {});
    idx += ids.length;
    groupIds[domain] = await chrome.tabs.group({ tabIds: ids, createProperties: { windowId } });
  }

  // Name and color each group; optionally collapse
  let ci = 0;
  for (const domain of domains) {
    const gid = groupIds[domain];
    if (gid == null) continue;
    const count = domainMap[domain].length;
    await chrome.tabGroups.update(gid, {
      title: count > 1 ? `${domain} (${count})` : domain,
      color: GROUP_COLORS[ci++ % GROUP_COLORS.length],
      collapsed: collapseGroups
    }).catch(() => {});
  }

  // Rebuild tree: first tab per domain = root, rest = children
  for (const domain of domains) {
    const [rootId, ...childIds] = domainMap[domain];
    if (tabTree[rootId]) { setParent(rootId, null); tabTree[rootId].collapsed = collapseGroups; }
    for (const cid of childIds) if (tabTree[cid]) setParent(cid, rootId);
  }

  await saveTree();
  broadcastTree();
  return { domains, counts: Object.fromEntries(domains.map(d => [d, domainMap[d].length])) };
}

async function ungroupAll(windowId) {
  // Remove every Chrome tab group in the window, returning tabs to flat state
  const existing = await chrome.tabGroups.query({ windowId });
  let ungrouped = 0;
  await Promise.all(existing.map(async g => {
    const gt = await chrome.tabs.query({ groupId: g.id });
    if (gt.length) {
      await chrome.tabs.ungroup(gt.map(t => t.id)).catch(() => {});
      ungrouped += gt.length;
    }
  }));

  // Flatten the tree: every tab in this window becomes a root again
  for (const [id, node] of Object.entries(tabTree)) {
    if (node.windowId === windowId) {
      setParent(+id, null);
      node.collapsed = false;
    }
  }

  await saveTree();
  broadcastTree();
  return { groups: existing.length, tabs: ungrouped };
}

// ── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  handleMessage(msg).then(reply).catch(err => reply({ error: err.message }));
  return true; // keep channel open for async
});

async function handleMessage({ type, ...p }) {
  switch (type) {
    case 'GET_TREE': {
      const tabs = await chrome.tabs.query({ windowId: p.windowId });
      const active = tabs.find(t => t.active);
      return { tree: tabTree, activeTabId: active?.id ?? null };
    }
    case 'ACTIVATE_TAB':
      await chrome.tabs.update(p.tabId, { active: true }).catch(() => {});
      return { ok: true };
    case 'CLOSE_TAB':
      await chrome.tabs.remove(p.tabId).catch(() => {});
      return { ok: true };
    case 'CLOSE_TREE':
      await chrome.tabs.remove([p.tabId, ...allDescendants(p.tabId)]).catch(() => {});
      return { ok: true };
    case 'TOGGLE_COLLAPSE':
      if (tabTree[p.tabId]) {
        tabTree[p.tabId].collapsed = !tabTree[p.tabId].collapsed;
        await saveTree(); broadcastTree();
      }
      return { ok: true };
    case 'SET_PARENT':
      if (tabTree[p.childId]) { setParent(p.childId, p.parentId); await saveTree(); broadcastTree(); }
      return { ok: true };
    case 'DETACH_TAB':
      if (tabTree[p.tabId]) { setParent(p.tabId, null); await saveTree(); broadcastTree(); }
      return { ok: true };
    case 'NEW_TAB': {
      const tab = await chrome.tabs.create({ windowId: p.windowId });
      return { tabId: tab.id };
    }
    case 'NEW_CHILD_TAB': {
      const tab = await chrome.tabs.create({ openerTabId: p.parentId, windowId: p.windowId });
      return { tabId: tab.id };
    }
    case 'DUPLICATE_TAB':
      await chrome.tabs.duplicate(p.tabId).catch(() => {});
      return { ok: true };
    case 'GROUP_BY_DOMAIN': {
      const result = await groupByDomain(p.windowId, p.collapseGroups ?? false);
      return { ok: true, result };
    }
    case 'UNGROUP_ALL': {
      const result = await ungroupAll(p.windowId);
      return { ok: true, result };
    }
    default:
      return { error: `Unknown message: ${type}` };
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => { setupSidePanel(); syncAllTabs(); });
chrome.runtime.onStartup.addListener(() => { setupSidePanel(); syncAllTabs(); });
syncAllTabs();

// ── Pop-out window ─────────────────────────────────────────────────────────

let popoutWindowId = null;

async function openPopout(sourceWindowId) {
  // If already open, focus it instead of opening another
  if (popoutWindowId) {
    try {
      await chrome.windows.update(popoutWindowId, { focused: true });
      return;
    } catch {
      popoutWindowId = null; // window was closed externally
    }
  }

  const url = chrome.runtime.getURL(`popout.html?winId=${sourceWindowId}`);
  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: 320,
    height: 600,
    focused: true
  });
  popoutWindowId = win.id;
}

// Clean up when popout is manually closed
chrome.windows.onRemoved.addListener(windowId => {
  if (windowId === popoutWindowId) popoutWindowId = null;
});

// Handle message from sidebar button
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'OPEN_POPOUT') {
    openPopout(msg.windowId).then(() => reply({ ok: true })).catch(e => reply({ error: e.message }));
    return true;
  }
});

// Handle keyboard shortcut Alt+P
chrome.commands.onCommand.addListener(async command => {
  if (command === 'popout-panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await openPopout(tab.windowId);
  }
});
