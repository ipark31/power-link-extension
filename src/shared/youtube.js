// Power Link — YouTube Data API v3 enrichment (ES module)
import { STORAGE, YT_CATEGORIES } from './constants.js';
import { seeded } from './util.js';

const API = 'https://www.googleapis.com/youtube/v3/';
const CH_TTL = 6 * 60 * 60 * 1000;

async function addQuota(units) {
  const today = new Date().toISOString().slice(0, 10);
  const { [STORAGE.quota]: q } = await chrome.storage.local.get(STORAGE.quota);
  const cur = q && q.date === today ? q : { date: today, units: 0 };
  cur.units += units;
  await chrome.storage.local.set({ [STORAGE.quota]: cur });
}

export async function getQuota() {
  const today = new Date().toISOString().slice(0, 10);
  const { [STORAGE.quota]: q } = await chrome.storage.local.get(STORAGE.quota);
  return q && q.date === today ? q.units : 0;
}

async function api(path, params, key) {
  const u = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set('key', key);
  const r = await fetch(u.toString());
  const j = await r.json().catch(() => ({}));
  await addQuota(1);
  if (!r.ok) {
    const reason = j.error?.errors?.[0]?.reason || '';
    const msg = j.error?.message || ('HTTP ' + r.status);
    const err = new Error(reason === 'quotaExceeded' ? '오늘 API 사용량을 모두 썼어요' : reason === 'keyInvalid' || r.status === 400 ? 'API 키가 올바르지 않아요' : msg);
    err.reason = reason;
    throw err;
  }
  return j;
}

export async function testKey(key) {
  if (!key) return { ok: false, message: 'API 키를 입력해 주세요' };
  try {
    await api('videos', { part: 'id', chart: 'mostPopular', regionCode: 'KR', maxResults: 1 }, key);
    return { ok: true, message: '연결됐어요' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

const chunk = (arr, n) => arr.reduce((a, x, i) => (i % n ? a[a.length - 1].push(x) : a.push([x]), a), []);

function parseDuration(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

// Placeholder "채널력" (0–10). Deterministic per channel so it doesn't change between refreshes.
// TODO: replace with a real formula (e.g. views/subscriber ratio, upload cadence, engagement, age).
export function computeChannelPower(ch) {
  return Math.round((1 + seeded(ch.channelId || ch.name || '') * 9) * 10) / 10;
}

async function loadCache() {
  const { [STORAGE.ytCache]: c } = await chrome.storage.local.get(STORAGE.ytCache);
  return c || {};
}
const saveCache = (c) => chrome.storage.local.set({ [STORAGE.ytCache]: c });

async function playlistTotal(playlistId, key) {
  try {
    const j = await api('playlistItems', { part: 'id', playlistId, maxResults: 1 }, key);
    return j.pageInfo?.totalResults ?? null;
  } catch (e) {
    return null; // playlist may not exist (e.g. channel without shorts)
  }
}

async function recentCount(uploadsId, key) {
  const since = Date.now() - 30 * 86400 * 1000;
  let count = 0, pageToken = '';
  for (let page = 0; page < 3; page++) {
    let j;
    try { j = await api('playlistItems', Object.assign({ part: 'contentDetails', playlistId: uploadsId, maxResults: 50 }, pageToken ? { pageToken } : {}), key); } catch (e) { return null; }
    const items = j.items || [];
    let stop = false;
    for (const it of items) {
      const t = new Date(it.contentDetails?.videoPublishedAt || 0).getTime();
      if (t >= since) count++; else stop = true;
    }
    if (stop || !j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return count;
}

async function channelInfo(ids, key) {
  const cache = await loadCache();
  const now = Date.now();
  const need = ids.filter((id) => !(cache[id] && now - cache[id].at < CH_TTL));
  for (const group of chunk(need, 50)) {
    const j = await api('channels', { part: 'snippet,statistics,contentDetails', id: group.join(','), maxResults: 50 }, key);
    for (const c of j.items || []) {
      const tail = c.id.slice(2);
      const total = +c.statistics?.videoCount || 0;
      const views = +c.statistics?.viewCount || 0;
      const [longCount, shortCount, recent30] = await Promise.all([
        playlistTotal('UULF' + tail, key),
        playlistTotal('UUSH' + tail, key),
        recentCount(c.contentDetails?.relatedPlaylists?.uploads || 'UU' + tail, key)
      ]);
      const info = {
        channelId: c.id,
        name: c.snippet?.title || '',
        handle: c.snippet?.customUrl || '',
        accountUrl: c.snippet?.customUrl ? 'https://www.youtube.com/' + c.snippet.customUrl : 'https://www.youtube.com/channel/' + c.id,
        avatar: c.snippet?.thumbnails?.default?.url || '',
        created: c.snippet?.publishedAt || '',
        followers: c.statistics?.hiddenSubscriberCount ? null : +c.statistics?.subscriberCount || 0,
        total, longCount, shortCount, recent30,
        avgViews: total ? Math.round(views / total) : null
      };
      info.power = computeChannelPower(info);
      cache[c.id] = { at: now, info };
    }
  }
  await saveCache(cache);
  const out = {};
  ids.forEach((id) => { if (cache[id]) out[id] = cache[id].info; });
  return out;
}

async function resolveHandle(handle, key) {
  const j = await api('channels', { part: 'id', forHandle: handle }, key);
  return j.items?.[0]?.id || null;
}

// items: link objects (any platform). Returns a new array; YouTube items get detail data.
export async function enrichYouTube(items, key) {
  const yt = items.filter((it) => it.platform === 'yt' && (it.kind === 'post' || it.kind === 'account'));
  if (!yt.length || !key) return items;

  const videoIds = [...new Set(yt.filter((it) => it.kind === 'post' && it.ids?.videoId).map((it) => it.ids.videoId))];
  const videos = {};
  for (const group of chunk(videoIds, 50)) {
    const j = await api('videos', { part: 'snippet,statistics,contentDetails', id: group.join(','), maxResults: 50 }, key);
    for (const v of j.items || []) videos[v.id] = v;
  }

  // account items → channel ids
  const accChannel = new Map();
  for (const it of yt.filter((x) => x.kind === 'account')) {
    let id = it.ids?.channelId || null;
    if (!id && it.ids?.handle) { try { id = await resolveHandle(it.ids.handle, key); } catch (e) { id = null; } }
    if (id) accChannel.set(it, id);
  }
  const channelIds = [...new Set(Object.values(videos).map((v) => v.snippet?.channelId).filter(Boolean).concat([...accChannel.values()]))];
  const channels = channelIds.length ? await channelInfo(channelIds, key) : {};

  return items.map((it) => {
    if (it.platform !== 'yt') return it;
    if (it.kind === 'post') {
      const v = videos[it.ids?.videoId];
      if (!v) return it;
      const dur = parseDuration(v.contentDetails?.duration);
      const ch = channels[v.snippet?.channelId] || null;
      const views = +v.statistics?.viewCount || 0;
      return Object.assign({}, it, {
        title: v.snippet?.title || it.title,
        thumb: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || it.thumb,
        category: YT_CATEGORIES[v.snippet?.categoryId] || it.category || '',
        detail: {
          views, likes: v.statistics?.likeCount != null ? +v.statistics.likeCount : null,
          comments: v.statistics?.commentCount != null ? +v.statistics.commentCount : null,
          uploadedAt: v.snippet?.publishedAt || '', duration: dur,
          isShort: !!it.ids?.isShort || (dur > 0 && dur <= 180),
          tags: (v.snippet?.tags || []).slice(0, 15)
        },
        account: ch,
        outlier: ch && ch.avgViews ? Math.round((views / ch.avgViews) * 10) / 10 : null,
        enrichedAt: new Date().toISOString()
      });
    }
    const ch = channels[accChannel.get(it)];
    if (!ch) return it;
    return Object.assign({}, it, { title: ch.name, thumb: ch.avatar || it.thumb, account: ch, enrichedAt: new Date().toISOString() });
  });
}

// Watchlist check for YouTube channels: returns { followers, newCount, latestAt }.
export async function checkChannel(channelId, sinceIso, key) {
  const j = await api('channels', { part: 'statistics,contentDetails', id: channelId }, key);
  const c = j.items?.[0];
  if (!c) return null;
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  let newCount = 0;
  if (uploads) {
    const p = await api('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: 20 }, key);
    const since = new Date(sinceIso || 0).getTime();
    newCount = (p.items || []).filter((x) => new Date(x.contentDetails?.videoPublishedAt || 0).getTime() > since).length;
  }
  return { followers: c.statistics?.hiddenSubscriberCount ? null : +c.statistics?.subscriberCount || 0, newCount };
}
