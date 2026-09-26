// Power Link — service worker (ES module)
import '../shared/classify.js';
import { STORAGE } from '../shared/constants.js';
import { getSettings, getLinks, setLinks, saveLinks, updateLinks, getApiKey, getWatch, setWatch } from '../shared/storage.js';
import { enrichYouTube, testKey, checkChannel, getQuota } from '../shared/youtube.js';
import { buildCopy, applyCategoryRules } from '../shared/format.js';
import { cleanTitle, hostOf } from '../shared/util.js';

// ------------------------------------------------------------------ lifecycle
chrome.runtime.onInstalled.addListener(async (details) => {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }); } catch (e) { /* older Chrome */ }
  chrome.alarms.create('pl-watch', { periodInMinutes: 360 });
  chrome.alarms.create('pl-bridge', { periodInMinutes: 1 });
  if (details.reason === 'update' || details.reason === 'install') await migrateV1();
  // first install: open the hands-on guide (not on updates or reloads)
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') }).catch(() => {});
  seedRecent().catch(() => {});
});

// v1.x stored links under "savedLinks"; bring them into the v2 list once.
async function migrateV1() {
  const { savedLinks, pl_migrated_v1 } = await chrome.storage.local.get(['savedLinks', 'pl_migrated_v1']);
  if (pl_migrated_v1 || !Array.isArray(savedLinks) || !savedLinks.length) return;
  const items = savedLinks.filter((l) => l && l.url).map((l) => toItem({ url: l.url, title: l.title, thumb: l.thumbnail }, 'tab'));
  await saveLinks(items.reverse());
  await chrome.storage.local.set({ pl_migrated_v1: true });
}

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd === 'toggle-marks') {
    const { pl_showMarks } = await chrome.storage.local.get('pl_showMarks');
    await chrome.storage.local.set({ pl_showMarks: pl_showMarks === false });
    return;
  }
  if (cmd === 'open-sidepanel') {
    const win = tab?.windowId ?? (await chrome.windows.getCurrent()).id;
    try { await chrome.sidePanel.open({ windowId: win }); } catch (e) { /* needs user gesture */ }
  }
});

// ------------------------------------------------------------------ recent screens
// Every tab the user looks at (this Chrome profile, all windows) is recorded once per URL,
// newest first, up to settings.recentMax. The side panel lists them and jumps back to them.
const recentKey = (u) => { try { const x = new URL(u); x.hash = ''; return x.href; } catch (e) { return u; } };
let recentChain = Promise.resolve();
// recentMax is cached (settings live in storage.sync; reading them on every tab event is wasteful)
let recentMaxCache = 0;
async function recentMax() {
  if (!recentMaxCache) recentMaxCache = Math.max(10, Math.min(500, (await getSettings()).recentMax || 50));
  return recentMaxCache;
}
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && ch[STORAGE.settings]) recentMaxCache = 0; });
function recordRecent(tabs, { seed = false } = {}) {
  recentChain = recentChain.then(async () => {
    const list = (await chrome.storage.local.get(STORAGE.recent))[STORAGE.recent] || [];
    const max = await recentMax();
    const byKey = new Map(list.map((r) => [recentKey(r.url), r]));
    let changed = false;
    for (const t of tabs) {
      if (!t || !/^https?:/i.test(t.url || '') || t.incognito) continue;
      const k = recentKey(t.url);
      const prev = byKey.get(k);
      if (seed && prev) continue; // seeding never overrides real visits
      const at = seed ? (t.lastAccessed || Date.now()) : (t.seenAt || Date.now());
      const title = t.title || (prev && prev.title) || t.url, favIconUrl = t.favIconUrl || (prev && prev.favIconUrl) || '';
      // already the newest entry with the same details: nothing to write
      if (!seed && prev && prev === list[0] && prev.title === title && prev.favIconUrl === favIconUrl && prev.tabId === t.id) continue;
      const rec = Object.assign({}, prev || { firstAt: at }, {
        url: t.url, title, favIconUrl, tabId: t.id, windowId: t.windowId, at: prev && seed ? prev.at : at
      });
      byKey.set(k, rec);
      changed = true;
    }
    if (!changed) return;
    const next = [...byKey.values()].sort((a, b) => b.at - a.at).slice(0, max);
    await chrome.storage.local.set({ [STORAGE.recent]: next });
  }).catch(() => {});
  return recentChain;
}
async function seedRecent() { recordRecent(await chrome.tabs.query({}), { seed: true }); }
// One page load fires several tab events (loading, complete, title, favicon) and switching windows
// adds focus events: collect them for 300ms and write the list once. Each tab keeps the time it
// was actually seen, so the order stays exact.
const pendingRecent = new Map();
let pendingTimer = 0;
function queueRecent(tab) {
  if (!tab || !/^https?:/i.test(tab.url || '')) return;
  // keyed by address, so quick navigations inside one tab are all kept (as before batching)
  const k = recentKey(tab.url);
  pendingRecent.delete(k); // re-insert so the latest-seen page is written last
  pendingRecent.set(k, Object.assign({}, tab, { seenAt: Date.now() }));
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { const tabs = [...pendingRecent.values()]; pendingRecent.clear(); recordRecent(tabs); }, 300);
}
chrome.tabs.onActivated.addListener(async ({ tabId }) => { try { queueRecent(await chrome.tabs.get(tabId)); } catch (e) { /* closed */ } });
chrome.tabs.onUpdated.addListener((id, info, tab) => { if (tab.active && (info.status === 'complete' || info.title || info.favIconUrl)) queueRecent(tab); });
chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  try { const [t] = await chrome.tabs.query({ active: true, windowId: winId }); queueRecent(t); } catch (e) { /* noop */ }
});
chrome.runtime.onStartup.addListener(() => { seedRecent().catch(() => {}); });

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'pl-watch') checkWatchlist().catch(() => {});
  if (a.name === 'pl-bridge' && !bridgePort) bridgeConnect();
});

// ------------------------------------------------------------------ profile bridge
// Other Chrome profiles share their "recent screens" through a native messaging
// helper (see native-host/install.bat). The open port keeps this service worker
// alive; while the helper is missing we retry on every wake + the pl-bridge alarm.
const BRIDGE_HOST = 'com.powerlink.bridge';
const BRIDGE_ITEM_MAX = 300;
let bridgePort = null;
let bridgeRecentTimer = 0;

async function bridgeIdentity() {
  const got = await chrome.storage.local.get([STORAGE.profileId, STORAGE.profileName]);
  let id = got[STORAGE.profileId];
  if (!id) {
    id = 'p' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    await chrome.storage.local.set({ [STORAGE.profileId]: id });
  }
  return { id, name: got[STORAGE.profileName] || '' };
}

async function bridgeSendRecent() {
  if (!bridgePort) return;
  const { id, name } = await bridgeIdentity();
  const list = (await chrome.storage.local.get(STORAGE.recent))[STORAGE.recent] || [];
  const items = list.slice(0, BRIDGE_ITEM_MAX).map((r) => ({
    url: r.url, title: r.title || '', at: r.at || 0,
    favIconUrl: (r.favIconUrl || '').length <= 2048 ? r.favIconUrl || '' : ''
  }));
  try { bridgePort.postMessage({ type: 'recent', profileId: id, name, items }); } catch (e) { /* just disconnected */ }
}

function bridgeQueueRecent() {
  clearTimeout(bridgeRecentTimer);
  bridgeRecentTimer = setTimeout(() => { bridgeSendRecent().catch(() => {}); }, 1000);
}

// Commands another profile sent us: jump to (or reopen) a URL, or drop it from our list.
async function bridgeHandleCommand(cmd) {
  if (!cmd || !/^https?:/i.test(cmd.url || '')) return;
  const k = recentKey(cmd.url);
  if (cmd.type === 'activate') {
    const tab = (await chrome.tabs.query({})).find((t) => t.url && recentKey(t.url) === k);
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } else {
      const t = await chrome.tabs.create({ url: cmd.url, active: true });
      try { await chrome.windows.update(t.windowId, { focused: true }); } catch (e) { /* noop */ }
    }
  } else if (cmd.type === 'forget') {
    const list = (await chrome.storage.local.get(STORAGE.recent))[STORAGE.recent] || [];
    const next = list.filter((r) => recentKey(r.url) !== k);
    if (next.length !== list.length) await chrome.storage.local.set({ [STORAGE.recent]: next });
  } else if (cmd.type === 'close') {
    // another profile keeps this screen open ("중복 링크 닫기") — close ours; pinned tabs stay
    const ids = (await chrome.tabs.query({})).filter((t) => !t.pinned && t.url && recentKey(t.url) === k).map((t) => t.id);
    if (ids.length) await chrome.tabs.remove(ids);
  }
}

// write the connection state only when it changes (every write re-renders open side panels)
let bridgeState = null;
async function setBridgeState(connected) {
  if (bridgeState === null) bridgeState = !!((await chrome.storage.local.get(STORAGE.bridge))[STORAGE.bridge] || {}).connected;
  if (bridgeState === connected) return;
  bridgeState = connected;
  await chrome.storage.local.set({ [STORAGE.bridge]: { connected, at: Date.now() } });
}

function bridgeConnect() {
  if (bridgePort) return;
  try { bridgePort = chrome.runtime.connectNative(BRIDGE_HOST); } catch (e) { bridgePort = null; }
  if (!bridgePort) { setBridgeState(false); return; }
  const port = bridgePort;
  port.onMessage.addListener((m) => {
    if (!m) return;
    if (m.type === 'hello' && m.ok) { setBridgeState(true); chrome.alarms.create('pl-bridge', { periodInMinutes: 1 }); }
    else if (m.type === 'others') chrome.storage.local.set({ [STORAGE.recentOthers]: { at: Date.now(), profiles: Array.isArray(m.profiles) ? m.profiles : [] } });
    else if (m.type === 'command') bridgeHandleCommand(m.command).catch(() => {});
  });
  port.onDisconnect.addListener(() => {
    const why = (chrome.runtime.lastError && chrome.runtime.lastError.message) || '';
    if (bridgePort === port) bridgePort = null;
    setBridgeState(false);
    // helper not installed: stop the once-a-minute retry (it only wakes the worker for nothing);
    // Chrome start, the side panel's [다시 연결] and a new install try again
    if (/not found|forbidden/i.test(why)) chrome.alarms.clear('pl-bridge');
  });
  bridgeIdentity().then(({ id, name }) => {
    port.postMessage({ type: 'hello', profileId: id, name });
    return bridgeSendRecent();
  }).catch(() => {});
}

chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch[STORAGE.recent] || ch[STORAGE.profileName]) bridgeQueueRecent();
});

// ------------------------------------------------------------------ helpers
function toItem(raw, source, extra) {
  const c = globalThis.PLClassify(raw.url) || { platform: 'web', kind: 'post', host: hostOf(raw.url) };
  let thumb = raw.thumb || '';
  if (!thumb && c.platform === 'yt' && c.videoId) thumb = `https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`;
  return Object.assign({
    url: raw.url,
    title: cleanTitle(raw.title) || raw.url,
    thumb,
    platform: c.platform,
    kind: c.kind === 'other' ? 'post' : c.kind,
    ids: { videoId: c.videoId, channelId: c.channelId, handle: c.handle, isShort: c.isShort, postId: c.postId, postType: c.postType },
    domain: c.host || hostOf(raw.url),
    source
  }, extra || {});
}

async function ensureOffscreen() {
  const url = chrome.runtime.getURL('src/offscreen/offscreen.html');
  if (chrome.runtime.getContexts) {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
    if (ctx.length) return;
  }
  try {
    await chrome.offscreen.createDocument({ url: 'src/offscreen/offscreen.html', reasons: ['CLIPBOARD'], justification: '수집한 링크를 클립보드에 복사합니다.' });
  } catch (e) {
    if (!String(e.message).includes('single offscreen')) throw e;
  }
}

// Returns true when the offscreen document wrote the clipboard. Callers that run in a focused
// page (popup, side panel, content script) fall back to writing the clipboard themselves.
async function copyToClipboard(text, html) {
  try {
    await ensureOffscreen();
    const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text, html });
    return !!(r && r.ok);
  } catch (e) {
    return false;
  }
}

async function openTabs(urls, { newWindow = false, afterTab = null, background = true } = {}) {
  if (newWindow) {
    await chrome.windows.create({ url: urls, focused: true });
    return;
  }
  let index = afterTab ? afterTab.index + 1 : undefined;
  const windowId = afterTab ? afterTab.windowId : undefined;
  for (const url of urls) {
    await chrome.tabs.create({ url, active: !background && url === urls[0], windowId, index });
    if (index !== undefined) index++;
  }
}

async function enrichIfNeeded(items, mode) {
  let note = '';
  let out = items;
  const todo = items.filter((i) => i.platform === 'yt' && !i.enrichedAt);
  if (mode === 'detail' && todo.length) {
    const key = await getApiKey();
    if (!key) note = 'API 키가 없어 유튜브 상세 정보는 건너뛰었어요';
    else {
      try {
        const got = new Map((await enrichYouTube(todo, key)).map((o) => [o.url, o]));
        out = items.map((i) => got.get(i.url) || i);
      } catch (e) { note = '유튜브 정보: ' + e.message; }
    }
  }
  return { items: out, note };
}

// ------------------------------------------------------------------ auto enrichment
// YouTube details are fetched automatically in the background after links are stored:
// the UI updates first, details fill in as each batch arrives. Links that already have
// details (enrichedAt) or failed recently (enrichTriedAt < 24h) are never requested again.
const ENRICH_FIELDS = ['title', 'thumb', 'category', 'detail', 'account', 'outlier', 'enrichedAt'];
const DETAIL_CACHE = 'pl_detailCache'; // storage.session: details of links removed this session
const RETRY_MS = 24 * 3600 * 1000;
const inFlight = new Set();
const needsEnrich = (l) => l && l.platform === 'yt' && !l.enrichedAt && !inFlight.has(l.id)
  && (!l.enrichTriedAt || Date.now() - Date.parse(l.enrichTriedAt) > RETRY_MS)
  && ((l.kind === 'post' && l.ids?.videoId) || (l.kind === 'account' && (l.ids?.channelId || l.ids?.handle)));

async function enrichInBackground(ids) {
  const key = await getApiKey();
  if (!key || !ids?.length) return 0;
  const all = await getLinks();
  const byId = new Map(all.map((l) => [l.id, l]));
  const queue = ids.map((id) => byId.get(id)).filter(needsEnrich);
  if (!queue.length) return 0;
  queue.forEach((l) => inFlight.add(l.id));
  (async () => {
    const settings = await getSettings();
    for (let i = 0; i < queue.length; i += 20) {
      const batch = queue.slice(i, i + 20);
      let out = batch;
      try { out = applyCategoryRules(await enrichYouTube(batch, key), settings); } catch (e) { /* quota / network: mark tried */ }
      const tried = new Date().toISOString();
      // patch only enrichment fields so memo/category edits made meanwhile survive
      await updateLinks(out.map((o) => {
        const patch = { id: o.id, enrichTriedAt: tried };
        if (o.enrichedAt) for (const f of ENRICH_FIELDS) if (o[f] !== undefined) patch[f] = o[f];
        return patch;
      }));
      batch.forEach((l) => inFlight.delete(l.id));
    }
  })();
  return queue.length;
}

// Undo snapshots live in session storage so they survive a service-worker restart.
async function remember(snapshot) {
  const token = 'u' + Date.now().toString(36);
  await chrome.storage.session.set({ ['pl_undo_' + token]: snapshot });
  return token;
}

// ------------------------------------------------------------------ core action
// YouTube thumbnail links often arrive without a title (only "8:02").
// Fill them from YouTube's public oEmbed endpoint (no API key, no quota).
const WEAK_TITLE = /^(?:[\d:.\s]+|live|shorts?|쇼츠)?$/i;
async function fillMissingTitles(items) {
  const todo = items.filter((i) => i.platform === 'yt' && (!i.title || i.title === i.url || WEAK_TITLE.test(i.title.trim())) && (i.ids?.videoId || /[?&]v=|\/shorts\//.test(i.url))).slice(0, 50);
  await Promise.all(todo.map(async (it) => {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(it.url), { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return;
      const j = await r.json();
      if (j.title) it.title = j.title;
    } catch (e) { /* offline or blocked: keep what we have */ }
  }));
}

async function runAction({ action, links, sourceTab, source, modeOverride, viaPage = false }) {
  const settings = await getSettings();
  const mode = modeOverride || settings.collect;
  let items = links.map((l) => toItem(l, source));
  // reuse details already fetched for these URLs — never ask the API twice (also for links that
  // were deselected on the page earlier this session, see pl:removeUrls)
  const stored = new Map(Object.entries((await chrome.storage.session.get(DETAIL_CACHE))[DETAIL_CACHE] || {}));
  for (const l of await getLinks()) stored.set(globalThis.PLNormalize(l.url), l);
  items = items.map((it) => {
    const prev = stored.get(globalThis.PLNormalize(it.url));
    if (!prev || !prev.enrichedAt) return it;
    const keep = {};
    for (const f of ENRICH_FIELDS) if (prev[f] !== undefined) keep[f] = prev[f];
    return Object.assign({}, it, keep);
  });
  if (mode !== 'link') await fillMissingTitles(items.filter((i) => !i.enrichedAt));
  // a detail-mode copy needs the numbers now; everything else fills in afterwards
  const en = action === 'copy' ? await enrichIfNeeded(items, mode) : { items, note: '' };
  items = applyCategoryRules(en.items, settings);
  let undoToken = null;
  let message = '';
  let copyPayload = null;

  if (action === 'save' || settings.alsoSave) {
    const before = await getLinks();
    const ids = await saveLinks(items);
    undoToken = await remember(before);
    enrichInBackground(ids).catch(() => {});
  }
  if (action === 'copy') {
    const { text, html } = buildCopy(items, settings, mode);
    const done = viaPage ? false : await copyToClipboard(text, html);
    if (!done) copyPayload = { text, html };
    message = `링크 ${items.length}개를 복사했어요`;
  } else if (action === 'tabs') {
    await openTabs(items.map((i) => i.url), { afterTab: sourceTab, background: settings.bgTabs !== false });
    message = `새 탭 ${items.length}개를 열었어요`;
  } else if (action === 'window') {
    await openTabs(items.map((i) => i.url), { newWindow: true });
    message = `새 창에 링크 ${items.length}개를 열었어요`;
  } else if (action === 'save') {
    message = `링크 ${items.length}개를 목록에 저장했어요`;
  }
  await chrome.storage.local.set({ [STORAGE.lastGrab]: { at: Date.now(), count: items.length, action } });
  return { ok: true, message, note: en.note, undoToken, count: items.length, copyPayload, titles: items.map((i) => i.title || i.url) };
}

// ------------------------------------------------------------------ window extraction (popup)
function pageCollector() {
  const out = [];
  const seen = new Set();
  const text = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  for (const a of document.querySelectorAll('a[href]')) {
    const url = a.href;
    if (!/^https?:/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const img = a.querySelector('img');
    const title = text(a.getAttribute('aria-label')) || text(a.getAttribute('title')) || text(a.innerText) || text(img && img.alt);
    const thumb = img && /^https?:/.test(img.currentSrc || img.src) ? img.currentSrc || img.src : '';
    out.push({ url, title: title.slice(0, 300), thumb });
  }
  const og = (p) => document.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.content || '';
  return { links: out, page: { url: location.href, title: og('og:title') || document.title, thumb: og('og:image') } };
}

async function targetTabs(scope) {
  if (scope === 'current') return chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (scope === 'window') return chrome.tabs.query({ lastFocusedWindow: true });
  return chrome.tabs.query({});
}

async function collectFromTabs({ scope, plats, kinds }) {
  const tabs = (await targetTabs(scope)).filter((t) => t.url && /^https?:/.test(t.url));
  const wantPlat = (p) => plats.includes('all') || plats.includes(p);
  const wantKind = (k) => kinds.includes('all') || kinds.includes(k);
  const all = [];
  const seen = new Set();
  const push = (raw) => {
    const key = globalThis.PLNormalize(raw.url);
    if (seen.has(key)) return;
    const c = globalThis.PLClassify(raw.url);
    if (!c) return;
    const kind = c.kind === 'other' ? 'other' : c.kind;
    const allKinds = kinds.includes('all');
    if (!allKinds && (kind === 'other' || !wantKind(kind))) return;
    if (!plats.includes('all') && !wantPlat(c.platform)) return;
    seen.add(key);
    all.push(raw);
  };
  await Promise.all(tabs.map(async (tab) => {
    push({ url: tab.url, title: tab.title, thumb: '' });
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageCollector });
      const data = res && res.result;
      if (data) {
        if (data.page) {
          const key = globalThis.PLNormalize(data.page.url);
          const hit = all.find((x) => globalThis.PLNormalize(x.url) === key);
          if (hit) { hit.title = data.page.title || hit.title; hit.thumb = hit.thumb || data.page.thumb; }
        }
        data.links.forEach(push);
      }
    } catch (e) { /* restricted page: keep tab url only */ }
  }));
  return { links: all, tabs };
}

async function manageTabs(tabs, after, sort) {
  const ids = tabs.filter((t) => !t.pinned).map((t) => t.id);
  if (after === 'close' && ids.length) {
    await chrome.tabs.remove(ids);
  } else if (after === 'move' && ids.length) {
    const win = await chrome.windows.create({ focused: true });
    const blank = win.tabs && win.tabs[0];
    await chrome.tabs.move(ids, { windowId: win.id, index: -1 });
    if (blank) await chrome.tabs.remove(blank.id);
  }
  if (sort === 'domain' || sort === 'one') await sortTabs(sort);
}

async function sortTabs(mode) {
  const tabs = (await chrome.tabs.query({})).filter((t) => !t.pinned && t.url);
  const key = (t) => hostOf(t.url);
  tabs.sort((a, b) => key(a).localeCompare(key(b)) || (a.title || '').localeCompare(b.title || ''));
  if (mode === 'one') {
    const win = await chrome.windows.create({ focused: true });
    const blank = win.tabs && win.tabs[0];
    await chrome.tabs.move(tabs.map((t) => t.id), { windowId: win.id, index: -1 });
    if (blank) await chrome.tabs.remove(blank.id);
    return;
  }
  const groups = new Map();
  tabs.forEach((t) => { const k = key(t); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t.id); });
  for (const ids of groups.values()) {
    const win = await chrome.windows.create({ focused: false });
    const blank = win.tabs && win.tabs[0];
    await chrome.tabs.move(ids, { windowId: win.id, index: -1 });
    if (blank) await chrome.tabs.remove(blank.id);
  }
}

// ------------------------------------------------------------------ watchlist
async function addToWatch(ids) {
  const links = await getLinks();
  const watch = await getWatch();
  let added = 0;
  for (const l of links.filter((x) => ids.includes(x.id))) {
    const acc = l.account || {};
    const url = acc.accountUrl || (l.kind === 'account' ? l.url : '');
    if (!url && !acc.channelId) continue;
    const key = acc.channelId || globalThis.PLNormalize(url);
    if (watch.some((w) => w.key === key)) continue;
    watch.push({ key, platform: l.platform, name: acc.name || l.title, url, channelId: acc.channelId || l.ids?.channelId || null, avatar: acc.avatar || (l.kind === 'account' ? l.thumb : ''), followers: acc.followers ?? null, prevFollowers: acc.followers ?? null, lastCheck: new Date().toISOString(), fresh: 0 });
    added++;
  }
  await setWatch(watch);
  return added;
}

async function checkWatchlist() {
  const key = await getApiKey();
  const watch = await getWatch();
  for (const w of watch) {
    if (w.platform !== 'yt' || !w.channelId || !key) continue;
    try {
      const r = await checkChannel(w.channelId, w.lastCheck, key);
      if (!r) continue;
      w.prevFollowers = w.followers;
      w.followers = r.followers;
      w.fresh = (w.fresh || 0) + r.newCount;
      w.lastCheck = new Date().toISOString();
    } catch (e) { w.error = e.message; }
  }
  await setWatch(watch);
  await chrome.storage.local.set({ pl_watchCheckedAt: new Date().toISOString() });
  return watch;
}

// ------------------------------------------------------------------ downloads
// ------------------------------------------------------------------ message router
const handlers = {
  'pl:grab': async (msg, sender) => runAction({ action: msg.action, links: msg.links || [], sourceTab: sender.tab, source: 'grab' }),

  'pl:collectTabs': async (msg) => {
    const { links, tabs } = await collectFromTabs(msg);
    if (!links.length) return { ok: false, message: '조건에 맞는 링크가 없어요' };
    const res = await runAction({ action: msg.action, links, source: 'tab', modeOverride: msg.mode, viaPage: true });
    await manageTabs(tabs, msg.after, msg.sort);
    return res;
  },

  'pl:undo': async (msg) => {
    const k = 'pl_undo_' + msg.token;
    const { [k]: snap } = await chrome.storage.session.get(k);
    if (!snap) return { ok: false, message: '되돌릴 수 없어요' };
    await setLinks(snap);
    await chrome.storage.session.remove(k);
    return { ok: true, message: '되돌렸어요' };
  },

  'pl:copyItems': async (msg) => {
    const settings = await getSettings();
    const all = await getLinks();
    const items = msg.ids.map((id) => all.find((l) => l.id === id)).filter(Boolean);
    const { text, html } = buildCopy(items, settings, msg.mode || settings.collect);
    return { ok: true, message: `링크 ${items.length}개를 복사했어요`, copyPayload: { text, html } };
  },

  // src/core/loader.js asks for the drag engine the first time it is about to be used on a page
  'pl:loadEngine': async (msg, sender) => {
    if (!sender.tab) return { ok: false };
    await chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] }, files: ['src/shared/classify.js', 'src/core/content.js'] });
    return { ok: true };
  },

  // page drag deselected already-outlined links → take them out of the side-panel list
  'pl:removeUrls': async (msg) => {
    const keys = new Set((msg.urls || []).map((u) => globalThis.PLNormalize(u)));
    const before = await getLinks();
    const next = before.filter((l) => !keys.has(globalThis.PLNormalize(l.url)));
    const count = before.length - next.length;
    if (!count) return { ok: true, count: 0 };
    const undoToken = await remember(before);
    await setLinks(next);
    // keep the fetched YouTube details of what was removed, so selecting it again costs no API quota
    const cache = (await chrome.storage.session.get(DETAIL_CACHE))[DETAIL_CACHE] || {};
    for (const l of before) {
      const k = globalThis.PLNormalize(l.url);
      if (!keys.has(k) || !l.enrichedAt) continue;
      const keep = {};
      for (const f of ENRICH_FIELDS) if (l[f] !== undefined) keep[f] = l[f];
      delete cache[k]; cache[k] = keep;
    }
    const ks = Object.keys(cache);
    for (const k of ks.slice(0, Math.max(0, ks.length - 500))) delete cache[k]; // newest 500 only
    await chrome.storage.session.set({ [DETAIL_CACHE]: cache });
    return { ok: true, count, undoToken };
  },

  'pl:openUrls': async (msg) => {
    const settings = await getSettings();
    await openTabs(msg.urls, { newWindow: !!msg.newWindow, background: settings.bgTabs !== false });
    return { ok: true };
  },

  'pl:recentSeed': async () => { await seedRecent(); await recentChain; return { ok: true }; },

  'pl:recentAdd': async (msg) => {
    const links = (msg.items || []).filter((i) => /^https?:/i.test(i.url)).map((i) => ({ url: i.url, title: i.title, thumb: '' }));
    if (!links.length) return { ok: false, message: '추가할 링크가 없어요' };
    const res = await runAction({ action: 'save', links, source: 'recent', viaPage: true });
    return Object.assign(res, { message: `수집 링크에 ${links.length}개를 추가했어요` });
  },

  'pl:enrichAuto': async (msg) => ({ ok: true, queued: await enrichInBackground(msg.ids || []) }),

  'pl:enrich': async (msg) => {
    const key = await getApiKey();
    if (!key) return { ok: false, message: '설정에서 YouTube API 키를 먼저 넣어 주세요' };
    const all = await getLinks();
    const target = all.filter((l) => msg.ids.includes(l.id));
    const settings = await getSettings();
    const out = applyCategoryRules(await enrichYouTube(target, key), settings);
    await updateLinks(out.map((o) => Object.assign({}, o)));
    const n = out.filter((o) => o.enrichedAt).length;
    return { ok: true, message: n ? `유튜브 정보 ${n}개를 업데이트했어요` : '업데이트할 유튜브 링크가 없어요' };
  },


  'pl:watchAdd': async (msg) => {
    const n = await addToWatch(msg.ids);
    return { ok: true, message: n ? `워치리스트에 ${n}개를 추가했어요` : '추가할 채널·계정이 없어요 (이미 있거나 정보가 부족해요)' };
  },
  'pl:watchCheck': async () => { await checkWatchlist(); return { ok: true, message: '워치리스트를 확인했어요' }; },

  'pl:sortTabs': async (msg) => { await sortTabs(msg.mode); return { ok: true }; },
  'pl:testKey': async (msg) => testKey(msg.key),
  'pl:quota': async () => ({ ok: true, units: await getQuota() }),

  'pl:openSidePanel': async (msg, sender) => {
    const windowId = sender.tab?.windowId ?? msg.windowId;
    try { await chrome.sidePanel.open({ windowId }); return { ok: true }; } catch (e) { return { ok: false, message: e.message }; }
  },

  'pl:bridgeSend': async (msg) => {
    if (!bridgePort) return { ok: false, offline: true, message: '다른 프로필 도우미가 연결되지 않았어요' };
    try {
      bridgePort.postMessage({ type: 'command', target: msg.target, command: msg.command });
      return { ok: true };
    } catch (e) { return { ok: false, offline: true, message: '다른 프로필 도우미가 연결되지 않았어요' }; }
  },
  'pl:bridgeReconnect': async () => { bridgeConnect(); return { ok: true }; }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;
  const h = handlers[msg.type];
  if (!h) return false;
  h(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, message: e.message || String(e) }));
  return true;
});

// module init runs on every service-worker start — reconnect to the helper right away
bridgeConnect();

