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
  if (details.reason === 'update' || details.reason === 'install') await migrateV1();
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
  if (cmd === 'open-sidepanel') {
    const win = tab?.windowId ?? (await chrome.windows.getCurrent()).id;
    try { await chrome.sidePanel.open({ windowId: win }); } catch (e) { /* needs user gesture */ }
  }
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'pl-watch') checkWatchlist().catch(() => {}); });

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
  // reuse details already fetched for these URLs — never ask the API twice
  const stored = new Map((await getLinks()).map((l) => [globalThis.PLNormalize(l.url), l]));
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

  'pl:openUrls': async (msg) => {
    const settings = await getSettings();
    await openTabs(msg.urls, { newWindow: !!msg.newWindow, background: settings.bgTabs !== false });
    return { ok: true };
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
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;
  const h = handlers[msg.type];
  if (!h) return false;
  h(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, message: e.message || String(e) }));
  return true;
});

