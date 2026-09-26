// Power Link — storage layer (ES module)
import { DEFAULT_SETTINGS, STORAGE } from './constants.js';
import { uid } from './util.js';
import './classify.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

export async function getSettings() {
  const { [STORAGE.settings]: s } = await chrome.storage.sync.get(STORAGE.settings);
  const d = clone(DEFAULT_SETTINGS);
  if (!s) return d;
  return Object.assign(d, s, {
    popup: Object.assign(d.popup, s.popup || {}),
    sidepanel: Object.assign(d.sidepanel, s.sidepanel || {}),
    fieldsOff: s.fieldsOff || d.fieldsOff,
    rules: Array.isArray(s.rules) && s.rules.length ? s.rules : d.rules
  });
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = Object.assign(cur, patch);
  await chrome.storage.sync.set({ [STORAGE.settings]: next });
  return next;
}

export async function resetSettings() {
  await chrome.storage.sync.set({ [STORAGE.settings]: clone(DEFAULT_SETTINGS) });
}

export async function getLinks() {
  const { [STORAGE.links]: l } = await chrome.storage.local.get(STORAGE.links);
  return Array.isArray(l) ? l : [];
}

export async function setLinks(list) {
  await chrome.storage.local.set({ [STORAGE.links]: list });
}

// Adds items to the top of the list. Existing URLs are merged (new data wins, memo kept) and moved up.
// Returns the ids of the stored items (useful for undo).
export async function saveLinks(items) {
  const list = await getLinks();
  const byKey = new Map(list.map((l) => [globalThis.PLNormalize(l.url), l]));
  const now = new Date().toISOString();
  const ids = [];
  const fresh = [];
  for (const it of items) {
    const key = globalThis.PLNormalize(it.url);
    const prev = byKey.get(key);
    const merged = Object.assign({}, prev || {}, it, {
      id: prev ? prev.id : uid(),
      createdAt: prev ? prev.createdAt : now,
      updatedAt: now,
      memo: (prev && prev.memo) || it.memo || '',
      // keep the more descriptive title unless the new data came from an API
      title: prev && !it.enrichedAt && (prev.title || '').length > (it.title || '').length ? prev.title : it.title,
      thumb: it.thumb || (prev && prev.thumb) || '',
      category: it.category || (prev && prev.category) || ''
    });
    if (prev) byKey.delete(key);
    fresh.push(merged);
    ids.push(merged.id);
  }
  const rest = list.filter((l) => byKey.has(globalThis.PLNormalize(l.url)));
  await setLinks(fresh.concat(rest));
  return ids;
}

export async function updateLink(id, patch) {
  const list = await getLinks();
  const i = list.findIndex((l) => l.id === id);
  if (i < 0) return null;
  list[i] = Object.assign({}, list[i], patch, { updatedAt: new Date().toISOString() });
  await setLinks(list);
  return list[i];
}

export async function updateLinks(patches) {
  const list = await getLinks();
  const map = new Map(patches.map((p) => [p.id, p]));
  const next = list.map((l) => (map.has(l.id) ? Object.assign({}, l, map.get(l.id)) : l));
  await setLinks(next);
}

export async function removeLinks(ids) {
  const set = new Set(ids);
  const list = await getLinks();
  await setLinks(list.filter((l) => !set.has(l.id)));
}

export async function getApiKey() {
  const { [STORAGE.apiKey]: k } = await chrome.storage.local.get(STORAGE.apiKey);
  return k || '';
}
export const setApiKey = (k) => chrome.storage.local.set({ [STORAGE.apiKey]: (k || '').trim() });

export async function getWatch() {
  const { [STORAGE.watch]: w } = await chrome.storage.local.get(STORAGE.watch);
  return Array.isArray(w) ? w : [];
}
export const setWatch = (w) => chrome.storage.local.set({ [STORAGE.watch]: w });
