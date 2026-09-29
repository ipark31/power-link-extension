// Power Link — in-page link grabbing engine (box / lasso).
// Classic content script. Requires src/shared/classify.js to be loaded first (globalThis.PLClassify).
// When globalThis.PL_DEMO is true (options page practice area) nothing is sent; results are only shown.
(() => {
  if (globalThis.__PL_ENGINE__) return;
  globalThis.__PL_ENGINE__ = true;

  const DEMO = !!globalThis.PL_DEMO;
  const DRAG_START = 8;          // px before a press becomes a drag
  const EDGE = 40;               // px from viewport edge that triggers autoscroll
  const ACTION_LABEL = { copy: '복사', tabs: '새 탭으로 열기', window: '새 창으로 열기', save: '목록에 저장', download: '영상 다운로드' };
  // 다운로더 서버가 받을 수 있는 게시물 링크 (계정/채널·블로그·X 제외)
  const DL_HOSTS = /(^|\.)(youtube\.com|youtu\.be|tiktok\.com|vimeo\.com|bilibili\.com|instagram\.com)$/i;
  const dlOk = (l) => l && l.kind !== 'account' && DL_HOSTS.test((l.domain || '').replace(/^(www|m)\./, ''));
  const SHAPE_LABEL = { box: '박스', lasso: '선 긋기' };
  const MOD_LABEL = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', none: '' };
  const IS_WIN = /Win/i.test(navigator.platform || navigator.userAgent);

  let settings = {
    rules: [
      { id: 'r1', enabled: true, mod: 'ctrl', button: 'right', shape: 'box', action: 'copy', color: '#2F6BFF' },
      { id: 'r2', enabled: true, mod: 'shift', button: 'right', shape: 'box', action: 'tabs', color: '#E8590C' },
      { id: 'r3', enabled: true, mod: 'alt', button: 'right', shape: 'lasso', action: 'save', color: '#0E9384' },
      { id: 'r4', enabled: true, mod: 'none', button: 'right', shape: 'box', action: 'download', color: '#C83F55' }
    ],
    dedupe: true, highlight: true, autoscroll: true, sameSite: false, confirmOver: 20, notify: true, collect: 'title'
  };

  function loadSettings() {
    try {
      chrome.storage.sync.get('pl_settings', (r) => {
        if (chrome.runtime.lastError) return;
        if (r && r.pl_settings) settings = Object.assign({}, settings, r.pl_settings);
      });
      chrome.storage.onChanged.addListener((ch, area) => {
        if (area === 'sync' && ch.pl_settings && ch.pl_settings.newValue) settings = Object.assign({}, settings, ch.pl_settings.newValue);
      });
    } catch (e) { /* extension context invalidated */ }
  }
  loadSettings();

  // ---------------------------------------------------------------- overlay (shadow DOM)
  let host = null, root = null, layer = null, svg = null, pathEl = null, boxEl = null, pill = null, hlLayer = null, toastWrap = null;
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Roboto, 'Noto Sans KR', 'Malgun Gothic', Arial, sans-serif; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
    svg.draw { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
    .box { position: absolute; border: 2px dashed var(--tone); border-radius: 6px; background: color-mix(in srgb, var(--tone) 7%, transparent); display: none; }
    svg.draw path { fill: none; stroke: var(--tone); stroke-width: 3; stroke-opacity: .85; stroke-linejoin: round; stroke-linecap: round; }
    .marks { position: absolute; inset: 0; overflow: hidden; }
    .marks-doc { position: absolute; left: 0; top: 0; will-change: transform; }
    .mark { position: absolute; border-radius: 4px; box-shadow: 0 0 0 2px var(--tone); background: color-mix(in srgb, var(--tone) 6%, transparent); }
    .hl { position: absolute; border-radius: 4px; box-shadow: 0 0 0 2px var(--tone); background: color-mix(in srgb, var(--tone) 8%, transparent); }
    .pill { position: absolute; display: none; align-items: center; gap: 10px; padding: 8px 12px 8px 8px; background: #0F0F0F; color: #F1F1F1; border: 1px solid #303030; border-radius: 12px; box-shadow: 0 12px 28px -10px rgba(0,0,0,.45); white-space: nowrap; }
    .pill b { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 8px; background: #272727; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
    .pill .t { font-size: 13px; font-weight: 500; }
    .pill .s { font-size: 11px; color: #AAAAAA; }
    .toasts { position: fixed; right: 24px; bottom: 24px; display: flex; flex-direction: column; gap: 10px; pointer-events: none; z-index: 2147483647; }
    .toast { pointer-events: auto; width: 360px; padding: 14px; border-radius: 12px; background: #0F0F0F; color: #F1F1F1; border: 1px solid #303030; box-shadow: 0 12px 28px -10px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 10px; animation: in .22s cubic-bezier(.2,.8,.2,1); }
    .toast.out { animation: out .18s ease forwards; }
    .head { display: flex; gap: 10px; align-items: flex-start; }
    .ic { width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; background: #16A34A; display: grid; place-items: center; flex-shrink: 0; }
    .toast.err .ic { background: #DC2626; }
    .ic svg { width: 13px; height: 13px; fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .tt { font-size: 13px; font-weight: 500; line-height: 1.45; }
    .ts { font-size: 12px; color: #AAAAAA; margin-top: 2px; }
    .list { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-radius: 8px; background: #1F1F1F; }
    .list span { font-size: 12px; color: #D0D0D0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .acts { display: flex; gap: 8px; justify-content: flex-end; }
    button { height: 30px; padding: 0 14px; border-radius: 15px; font-size: 12px; font-weight: 500; cursor: pointer; border: 0; background: #272727; color: #F1F1F1; }
    button.pri { background: #F1F1F1; color: #0F0F0F; }
    .modal { position: fixed; inset: 0; z-index: 2147483647; pointer-events: auto; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.45); }
    .modal-card { width: 100%; max-width: 340px; padding: 20px; border-radius: 14px; background: #0F0F0F; color: #F1F1F1; border: 1px solid #303030; box-shadow: 0 12px 28px -10px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 8px; animation: in .15s ease; }
    .mt { font-size: 15px; font-weight: 500; }
    .md { font-size: 13px; line-height: 1.55; color: #D0D0D0; }
    .modal .acts { margin-top: 8px; }
    /* 다운로드 목록창 (우클릭 드래그 → 영상 고르기 → 다운로드) */
    .dlp { position: fixed; right: 24px; bottom: 24px; width: 400px; max-height: min(70vh, 640px); z-index: 2147483647; pointer-events: auto; display: flex; flex-direction: column;
           border-radius: 14px; background: #0F0F0F; color: #F1F1F1; border: 1px solid #303030; box-shadow: 0 16px 36px -12px rgba(0,0,0,.6); animation: in .18s ease; overflow: hidden; }
    .dlp.out { animation: out .18s ease forwards; }
    .dlp-h { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px 14px; border-bottom: 1px solid #262626; }
    .dlp-h .ic { background: var(--tone, #C83F55); }
    .dlp-h .tt { flex: 1; }
    .dlp-h .x { width: 28px; height: 28px; padding: 0; border-radius: 50%; background: none; color: #AAAAAA; display: grid; place-items: center; }
    .dlp-h .x:hover { background: #272727; color: #F1F1F1; }
    .dlp-h .x svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
    .dlp-list { flex: 1; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
    .dlp-row { display: grid; grid-template-columns: 18px 56px 1fr; gap: 10px; align-items: center; padding: 6px; border-radius: 8px; cursor: pointer; }
    .dlp-row:hover { background: #1A1A1A; }
    .dlp-row input { width: 16px; height: 16px; margin: 0; accent-color: var(--tone, #C83F55); cursor: pointer; }
    .dlp-th { width: 56px; height: 32px; border-radius: 6px; background: #272727 center/cover no-repeat; flex-shrink: 0; }
    .dlp-t { font-size: 12px; line-height: 1.35; max-height: 2.7em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .dlp-m { font-size: 11px; color: #AAAAAA; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dlp-m.ok { color: #4ADE80; } .dlp-m.err { color: #F87171; } .dlp-m.run { color: #F1F1F1; }
    .dlp-f { padding: 10px 12px 12px; border-top: 1px solid #262626; display: flex; flex-direction: column; gap: 8px; }
    .dlp-where { font-size: 11px; color: #AAAAAA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dlp-bar { height: 4px; border-radius: 2px; background: #272727; overflow: hidden; display: none; }
    .dlp-bar span { display: block; height: 100%; width: 0; background: var(--tone, #C83F55); transition: width .4s ease; }
    .dlp-bar.on { display: block; }
    .dlp-acts { display: flex; gap: 8px; align-items: center; }
    .dlp-acts .n { font-size: 12px; color: #AAAAAA; flex: 1; }
    button.pri:disabled { opacity: .45; cursor: default; }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes out { to { opacity: 0; transform: translateY(6px); } }`;

  function ensureOverlay() {
    if (host && host.isConnected) return;
    host = document.createElement('power-link-overlay');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS}</style><div class="layer"><div class="marks"><div class="marks-doc"></div></div><div class="hls"></div><svg class="draw"><path d=""></path></svg><div class="box"></div><div class="pill"><b>0</b><div><div class="t"></div><div class="s"></div></div></div></div><div class="toasts"></div>`;
    layer = root.querySelector('.layer');
    hlLayer = root.querySelector('.hls');
    svg = root.querySelector('svg.draw');
    pathEl = root.querySelector('svg.draw path');
    boxEl = root.querySelector('.box');
    pill = root.querySelector('.pill');
    toastWrap = root.querySelector('.toasts');
    (document.documentElement || document.body).appendChild(host);
    applyShowMarks();
  }

  // ---------------------------------------------------------------- rule matching
  function modOf(e) {
    if (e.ctrlKey || e.metaKey) return 'ctrl';
    if (e.shiftKey) return 'shift';
    if (e.altKey) return 'alt';
    return 'none';
  }
  function findRule(e) {
    const button = e.button === 2 ? 'right' : e.button === 0 ? 'left' : null;
    if (!button) return null;
    const mod = modOf(e);
    if (mod === 'none' && button === 'left') return null; // never hijack plain left drags
    return (settings.rules || []).find((r) => r.enabled !== false && r.button === button && r.mod === mod) || null;
  }

  // ---------------------------------------------------------------- state
  let press = null;       // { rule, cx, cy, px, py }
  let drag = null;        // { rule, points:[{x,y}] (page coords), cur:{cx,cy}, cands, hits:Set }
  let suppressMenuUntil = 0, suppressClickUntil = 0, raf = 0, scrollRaf = 0;

  function collectCandidates() {
    const out = [];
    const sx = scrollX, sy = scrollY;
    const anchors = document.querySelectorAll('a[href]');
    for (const a of anchors) {
      if (host && host.contains(a)) continue;
      const href = a.href;
      if (!/^https?:/i.test(href)) continue;
      const rects = a.getClientRects();
      if (!rects.length) continue;
      const r = a.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // checkVisibility (Chrome 121+) avoids a style read per link on pages with thousands of links
      if (a.checkVisibility) { if (!a.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue; }
      else { const cs = getComputedStyle(a); if (cs.visibility === 'hidden' || cs.opacity === '0') continue; }
      out.push({ a, x: r.left + sx, y: r.top + sy, w: r.width, h: r.height });
    }
    const pc = playerCandidate();
    if (pc) out.push(pc);
    return out;
  }
  // The YouTube video player has no link on it: dragging over any part of it selects the video
  // being watched (a detached <a> carries the URL and title, el is the element on screen).
  function currentVideoUrl() {
    try {
      const u = new URL(location.href);
      if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
      if (u.pathname === '/watch' && u.searchParams.get('v')) return 'https://www.youtube.com/watch?v=' + u.searchParams.get('v');
      const m = u.pathname.match(/^\/shorts\/([\w-]{6,})/);
      return m ? 'https://www.youtube.com/shorts/' + m[1] : null;
    } catch (e) { return null; }
  }
  function playerEl() {
    for (const el of document.querySelectorAll('#shorts-player, #movie_player, video')) {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight) return el;
    }
    return null;
  }
  function playerCandidate() {
    const url = currentVideoUrl();
    const el = url && playerEl();
    if (!el) return null;
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('title', text(document.title).replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, ''));
    const r = el.getBoundingClientRect();
    return { a, el, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }
  function refreshRects() {
    if (!drag) return;
    const sx = scrollX, sy = scrollY;
    for (const c of drag.cands) {
      const r = (c.el || c.a).getBoundingClientRect();
      c.x = r.left + sx; c.y = r.top + sy; c.w = r.width; c.h = r.height;
    }
  }

  const pageOf = (cx, cy) => ({ x: cx + scrollX, y: cy + scrollY });

  function boxRect() {
    const a = drag.points[0], b = pageOf(drag.cur.cx, drag.cur.cy);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }
  // "선 긋기" (shape id 'lasso'): the mouse draws an open line; every link the line crosses is
  // selected. Segment vs. link box (grown by LINE_TOL px) — Liang–Barsky clipping.
  const LINE_TOL = 3;
  function segHitsRect(a, b, c) {
    const x1 = c.x - LINE_TOL, y1 = c.y - LINE_TOL, x2 = c.x + c.w + LINE_TOL, y2 = c.y + c.h + LINE_TOL;
    const dx = b.x - a.x, dy = b.y - a.y;
    const p = [-dx, dx, -dy, dy], q = [a.x - x1, x2 - a.x, a.y - y1, y2 - a.y];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return true;
  }
  function computeHits() {
    const hits = new Set();
    if (drag.rule.shape === 'lasso') {
      // the line only grows: test just the segments added since the last frame, keep earlier hits
      const pts = drag.points;
      if (!drag.lineHits) { drag.lineHits = new Set(); drag.segDone = 1; }
      for (let i = drag.segDone; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const minX = Math.min(a.x, b.x) - LINE_TOL, maxX = Math.max(a.x, b.x) + LINE_TOL, minY = Math.min(a.y, b.y) - LINE_TOL, maxY = Math.max(a.y, b.y) + LINE_TOL;
        for (const c of drag.cands) {
          if (drag.lineHits.has(c) || c.x > maxX || c.x + c.w < minX || c.y > maxY || c.y + c.h < minY) continue;
          if (segHitsRect(a, b, c)) drag.lineHits.add(c);
        }
      }
      drag.segDone = Math.max(1, pts.length);
      for (const c of drag.lineHits) hits.add(c);
    } else {
      const b = boxRect();
      for (const c of drag.cands) if (c.x < b.x + b.w && c.x + c.w > b.x && c.y < b.y + b.h && c.y + c.h > b.y) hits.add(c);
    }
    return hits;
  }

  // ---------------------------------------------------------------- link info
  const text = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  // ---------------------------------------------------------------- titles
  // Thumbnail links (YouTube, blogs, shops) carry only a duration or badge ("8:02", "SHORTS").
  // For those, borrow the title from the card the link sits in, or from another link to the same URL.
  const WEAK = /^(?:[\d:.\s]+|live|shorts?|쇼츠|지금 재생 중|now playing|재생목록|playlist|ad|광고|new|새 동영상|\d+\s*(?:분|초|시간|개|views?|회)?)$/i;
  function isWeakTitle(t) {
    t = text(t);
    return t.length < 2 || WEAK.test(t) || /^(?:[\d:]+\s*)+(?:지금 재생 중|now playing)?$/i.test(t);
  }
  function cleanTitle(t) {
    // "8:02 지금 재생 중 Real title" → "Real title"; drop trailing duration badges.
    t = text(t).replace(/^(?:\d{1,2}:)?\d{1,2}:\d{2}\s*(?:지금 재생 중|now playing)?\s*/i, '').replace(/\s*(?:\d{1,2}:)?\d{1,2}:\d{2}$/, '');
    return text(t);
  }
  const CARD = [
    'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer', 'ytd-compact-video-renderer', 'ytd-playlist-video-renderer',
    'ytd-reel-item-renderer', 'ytd-playlist-panel-video-renderer', 'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
    'yt-lockup-view-model', 'ytd-rich-grid-media', 'ytd-endscreen-element-renderer', 'article', 'li'
  ].join(',');
  const YT_TITLE = '#video-title, #video-title-link, a#video-title, .yt-lockup-metadata-view-model__title, .shortsLockupViewModelHostMetadataTitle, .yt-core-attributed-string[role="text"], h3';
  function titleFromEl(el) {
    if (!el) return '';
    return cleanTitle(text(el.getAttribute && el.getAttribute('title')) || text(el.textContent) || text(el.getAttribute && el.getAttribute('aria-label')));
  }
  let sameUrlIndex = null, sameUrlAt = 0;
  function sameUrlTitle(url) {
    const norm = globalThis.PLNormalize || ((u) => u);
    if (!sameUrlIndex || Date.now() - sameUrlAt > 3000) {
      sameUrlIndex = new Map(); sameUrlAt = Date.now();
      for (const x of document.querySelectorAll('a[href]')) {
        if (host && host.contains(x)) continue;
        const t = titleFromEl(x);
        if (isWeakTitle(t)) continue;
        const k = norm(x.href);
        const prev = sameUrlIndex.get(k);
        if (!prev || (t.length > prev.length && t.length < 200)) sameUrlIndex.set(k, t);
      }
    }
    return sameUrlIndex.get(norm(url)) || '';
  }
  function betterTitle(a, url) {
    // 1) the card this link belongs to
    let card = a.closest(CARD);
    if (card) {
      // skip containers that hold several different links (menus, long lists)
      const norm = globalThis.PLNormalize || ((u) => u);
      const hrefs = new Set([...card.querySelectorAll('a[href]')].slice(0, 30).map((x) => norm(x.href)));
      if (hrefs.size > 3) card = null;
    }
    if (card) {
      for (const el of card.querySelectorAll(YT_TITLE)) { const t = titleFromEl(el); if (!isWeakTitle(t)) return t; }
      const img = card.querySelector('img[alt]');
      if (img && !isWeakTitle(img.alt)) return cleanTitle(img.alt);
    }
    // 2) any other link on the page pointing at the same URL
    const t = sameUrlTitle(url);
    if (t) return t;
    // 3) the page itself, when the link points here (e.g. the video being watched)
    const norm = globalThis.PLNormalize || ((u) => u);
    if (norm(url) === norm(location.href)) return text(document.title).replace(/\s*-\s*YouTube$/, '');
    return '';
  }

  function infoOf(a) {
    const url = a.href;
    const c = globalThis.PLClassify ? globalThis.PLClassify(url) : { platform: 'web', kind: 'post' };
    const img = a.querySelector('img');
    let title = cleanTitle(text(a.getAttribute('title')) || text(a.innerText) || text(a.getAttribute('aria-label')) || text(img && img.alt));
    if (isWeakTitle(title)) title = betterTitle(a, url) || (isWeakTitle(title) ? '' : title);
    if (title.length > 300) title = title.slice(0, 300);
    let thumb = '';
    if (c && c.platform === 'yt' && c.videoId) thumb = `https://i.ytimg.com/vi/${c.videoId}/hqdefault.jpg`;
    else if (img) { const s = img.currentSrc || img.src; if (/^https?:/.test(s)) thumb = s; }
    return {
      url, title, thumb,
      platform: c ? c.platform : 'web',
      kind: c ? (c.kind === 'other' ? 'post' : c.kind) : 'post',
      ids: c ? { videoId: c.videoId, channelId: c.channelId, handle: c.handle, isShort: c.isShort, postId: c.postId, postType: c.postType } : {},
      domain: (c && c.host) || location.hostname
    };
  }
  function buildLinks(hitSet) {
    const ordered = [...hitSet].sort((p, q) => (p.y - q.y) || (p.x - q.x));
    const map = new Map();
    const list = [];
    for (const h of ordered) {
      const info = infoOf(h.a);
      if (settings.sameSite && info.domain.replace(/^www\./, '') !== location.hostname.replace(/^www\./, '')) continue;
      const key = settings.dedupe !== false && globalThis.PLNormalize ? globalThis.PLNormalize(info.url) : info.url + '#' + list.length;
      const prev = map.get(key);
      if (prev) {
        if (info.title.length > prev.title.length) prev.title = info.title;
        if (!prev.thumb && info.thumb) prev.thumb = info.thumb;
        continue;
      }
      map.set(key, info);
      list.push(info);
    }
    return list;
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    raf = 0;
    if (!drag) return;
    const tone = drag.rule.color || '#2F6BFF';
    layer.style.setProperty('--tone', tone);
    const sx = scrollX, sy = scrollY;
    if (drag.rule.shape === 'lasso') {
      boxEl.style.display = 'none';
      pathEl.setAttribute('d', drag.points.length > 1 ? 'M ' + drag.points.map((p) => (p.x - sx).toFixed(1) + ' ' + (p.y - sy).toFixed(1)).join(' L ') : ''); // open line, not a closed shape
    } else {
      pathEl.setAttribute('d', '');
      const b = boxRect();
      Object.assign(boxEl.style, { display: 'block', left: b.x - sx + 'px', top: b.y - sy + 'px', width: b.w + 'px', height: b.h + 'px' });
    }
    const prevHits = drag.hits;
    drag.hits = computeHits();
    // rebuild the highlight boxes only when the selection or the scroll position changed
    const sameHl = prevHits && drag.hlAt === sx + ',' + sy && prevHits.size === drag.hits.size && [...drag.hits].every((h) => prevHits.has(h));
    drag.hlAt = sx + ',' + sy;
    if (settings.highlight !== false && !sameHl) {
      const frag = document.createDocumentFragment();
      let n = 0;
      for (const c of drag.hits) {
        if (n++ > 400) break;
        const d = document.createElement('div');
        d.className = 'hl';
        d.style.cssText = `left:${c.x - sx - 2}px;top:${c.y - sy - 2}px;width:${c.w + 4}px;height:${c.h + 4}px`;
        frag.appendChild(d);
      }
      hlLayer.replaceChildren(frag);
    }
    const uniq = new Set([...drag.hits].map((h) => (globalThis.PLNormalize ? globalThis.PLNormalize(h.a.href) : h.a.href)));
    pill.style.display = 'flex';
    pill.style.left = Math.min(drag.cur.cx + 18, innerWidth - 300) + 'px';
    pill.style.top = Math.min(drag.cur.cy + 18, innerHeight - 60) + 'px';
    pill.querySelector('b').textContent = uniq.size;
    pill.querySelector('.t').textContent = `링크 ${uniq.size}개 · ${ACTION_LABEL[drag.rule.action] || ''}`;
    pill.querySelector('.s').textContent = `${MOD_LABEL[drag.rule.mod] ? MOD_LABEL[drag.rule.mod] + ' + ' : ''}드래그 · ${SHAPE_LABEL[drag.rule.shape]} · Esc 취소`;
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  // ---------------------------------------------------------------- kept selections (toggle)
  // A drag toggles the links it covers: links without an outline get one (and the rule's action
  // runs for them), links that already have one lose it and leave the side-panel list.
  // Outlines are tracked per URL (every anchor pointing at a selected URL is outlined), sit in page
  // coordinates (follow scrolling, never block clicks) and stay until reload / address change.
  // Deleting a link in the side panel removes its outline here too (storage sync).
  const keyOf = (u) => (globalThis.PLNormalize ? globalThis.PLNormalize(u) : u);
  let marksHref = '', marksRaf = 0, marksTimer = 0;
  let marks = new Map(); // url key → { tone, saved, els: Map(anchor → outline div) }
  const marksDoc = () => root && root.querySelector('.marks-doc');
  const isMarked = (a) => marks.has(keyOf(a.href));
  function syncMarks() {
    marksRaf = 0;
    const doc = marksDoc();
    if (doc) doc.style.transform = `translate(${-scrollX}px, ${-scrollY}px)`;
  }
  function clearMarks() {
    const doc = marksDoc();
    if (doc) doc.replaceChildren();
    marks = new Map();
    clearInterval(marksTimer); marksTimer = 0;
  }
  // Ancestors that clip their content (overflow ≠ visible): a link scrolled out of such a box must
  // not keep an outline floating outside it. Looked up once per link, intersected on every layout.
  const clipCache = new WeakMap();
  function clippers(a) {
    let list = clipCache.get(a);
    if (list) return list;
    list = [];
    for (let p = a.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') list.push(p);
      if (cs.position === 'fixed') break;
    }
    clipCache.set(a, list);
    return list;
  }
  function visibleRect(a) {
    const r = a.getBoundingClientRect();
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (const p of clippers(a)) {
      const c = p.getBoundingClientRect();
      x1 = Math.max(x1, c.left); y1 = Math.max(y1, c.top); x2 = Math.min(x2, c.right); y2 = Math.min(y2, c.bottom);
    }
    return x2 - x1 >= 1 && y2 - y1 >= 1 ? { left: x1, top: y1, width: x2 - x1, height: y2 - y1 } : null;
  }
  // returns false when the link is not visible (outline hidden)
  function placeOutline(el, a) {
    const r = visibleRect(a);
    el.style.display = r ? '' : 'none';
    if (!r) return false;
    el.style.left = r.left + scrollX - 2 + 'px'; el.style.top = r.top + scrollY - 2 + 'px';
    el.style.width = r.width + 4 + 'px'; el.style.height = r.height + 4 + 'px';
    return true;
  }
  function markUrls(keys, tone, saved) {
    if (!keys.size) return;
    ensureOverlay();
    if (marksHref !== location.href) { clearMarks(); marksHref = location.href; }
    const doc = marksDoc();
    const targets = [...document.querySelectorAll('a[href]')].map((a) => [a, a.href]);
    const vurl = currentVideoUrl(), pel = vurl && playerEl();
    if (pel) targets.push([pel, vurl]); // the player stands for the video being watched
    for (const [a, href] of targets) {
      const k = keyOf(href);
      if (!keys.has(k)) continue;
      const r = a.getBoundingClientRect();
      if (!r.width && !r.height) continue; // hidden duplicates
      let m = marks.get(k);
      if (!m) { m = { tone, saved, els: new Map() }; marks.set(k, m); }
      m.tone = tone; m.saved = m.saved || saved;
      let el = m.els.get(a);
      if (!el) { el = document.createElement('div'); el.className = 'mark'; doc.appendChild(el); m.els.set(a, el); }
      el.style.setProperty('--tone', tone);
      placeOutline(el, a);
    }
    syncMarks();
    // SPA sites (YouTube…) change the address without reloading: drop marks from the old page.
    // Otherwise re-measure once a second so outlines follow content that moved on its own.
    if (!marksTimer) marksTimer = setInterval(() => { if (location.href !== marksHref) clearMarks(); else scheduleRelayout(); }, 1000);
    watchLayout();
  }
  // Outlines are page coordinates taken when marking. Anything that re-lays out the page (window
  // resize, browser zoom, side-panel width, fonts/images loading, inner scrollers) moves the links,
  // so every outline is re-measured from its link. Links that were re-rendered (YouTube swaps card
  // elements) are found again by URL.
  let relayoutRaf = 0, layoutRO = null;
  function relayoutMarks() {
    relayoutRaf = 0;
    const rebind = [];
    for (const [k, m] of marks) {
      for (const [a, el] of m.els) {
        if (!a.isConnected) { el.remove(); m.els.delete(a); continue; }
        placeOutline(el, a);
      }
      if (!m.els.size) rebind.push([k, m]);
    }
    for (const [k, m] of rebind) markUrls(new Set([k]), m.tone, m.saved);
    syncMarks();
  }
  function scheduleRelayout() { if (marks.size && !relayoutRaf) relayoutRaf = requestAnimationFrame(relayoutMarks); }
  function watchLayout() {
    if (layoutRO || !globalThis.ResizeObserver) return;
    layoutRO = new ResizeObserver(scheduleRelayout);
    layoutRO.observe(document.documentElement);
    if (document.body) layoutRO.observe(document.body);
  }
  addEventListener('resize', scheduleRelayout, { passive: true });
  function unmarkUrls(keys) {
    for (const k of keys) {
      const m = marks.get(k);
      if (!m) continue;
      m.els.forEach((el) => el.remove());
      marks.delete(k);
    }
  }
  addEventListener('scroll', (e) => {
    if (!marksTimer) return;
    // window scroll: shift the whole layer; an inner scroller moved only its own links: re-measure
    if (e.target === document || e.target === document.documentElement || e.target === document.body) { if (!marksRaf) marksRaf = requestAnimationFrame(syncMarks); }
    else scheduleRelayout();
  }, { capture: true, passive: true });
  // show / hide every outline (side panel eye button, Alt+Shift+M) — 'pl_showMarks' in storage.local
  let showMarks = true;
  const applyShowMarks = () => { const m = root && root.querySelector('.marks'); if (m) m.style.display = showMarks ? '' : 'none'; };
  try {
    chrome.storage.local.get('pl_showMarks', (r) => { if (!chrome.runtime.lastError && r && r.pl_showMarks === false) { showMarks = false; applyShowMarks(); } });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.pl_showMarks) { showMarks = ch.pl_showMarks.newValue !== false; applyShowMarks(); } });
  } catch (e) { /* extension context invalidated */ }
  // side panel deleted links → drop their outlines (only outlines whose link went into the list)
  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local' || !ch.pl_links || !marks.size) return;
      const keep = new Set((ch.pl_links.newValue || []).map((l) => keyOf(l.url)));
      unmarkUrls([...marks.entries()].filter(([k, m]) => m.saved && !keep.has(k)).map(([k]) => k));
    });
  } catch (e) { /* extension context invalidated */ }
  function clearDrawing() {
    if (!layer) return;
    boxEl.style.display = 'none';
    pathEl.setAttribute('d', '');
    hlLayer.replaceChildren();
    pill.style.display = 'none';
  }

  function autoscroll() {
    scrollRaf = 0;
    if (!drag || settings.autoscroll === false) return;
    const { cx, cy } = drag.cur;
    let dx = 0, dy = 0;
    if (cy < EDGE) dy = -Math.ceil((EDGE - cy) / 3);
    else if (cy > innerHeight - EDGE) dy = Math.ceil((cy - (innerHeight - EDGE)) / 3);
    if (cx < EDGE) dx = -Math.ceil((EDGE - cx) / 3);
    else if (cx > innerWidth - EDGE) dx = Math.ceil((cx - (innerWidth - EDGE)) / 3);
    if (dx || dy) {
      scrollBy(dx, dy);
      if (drag.rule.shape === 'lasso') drag.points.push(pageOf(cx, cy));
      schedule();
      scrollRaf = requestAnimationFrame(autoscroll);
    }
  }

  // ---------------------------------------------------------------- toast
  function toast({ tone, title, sub, lines, actions, error }) {
    if (settings.notify === false && !DEMO) return;
    ensureOverlay();
    const el = document.createElement('div');
    el.className = error ? 'toast err' : 'toast';
    el.style.setProperty('--tone', tone || '#2F6BFF');
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    el.innerHTML = `<div class="head"><span class="ic"><svg viewBox="0 0 24 24"><path d="${error ? 'M6 6l12 12M18 6 6 18' : 'm5 12 5 5 9-10'}"></path></svg></span><div><div class="tt">${esc(title)}</div>${sub ? `<div class="ts">${esc(sub)}</div>` : ''}</div></div>` +
      (lines && lines.length ? `<div class="list">${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</div>` : '') +
      (actions && actions.length ? `<div class="acts">${actions.map((a, i) => `<button data-i="${i}" class="${a.primary ? 'pri' : ''}">${esc(a.label)}</button>`).join('')}</div>` : '');
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const a = actions[+b.dataset.i]; a && a.run && a.run(); close(); }));
    toastWrap.appendChild(el);
    let timer = setTimeout(close, 5000);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(close, 2500); });
    function close() { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 200); }
  }

  // ---------------------------------------------------------------- confirm modal (page)
  // Same look as the extension pages' confirmModal, drawn inside the closed shadow root.
  function pageConfirm(title, message, ok = '확인', cancel = '취소') {
    ensureOverlay();
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = '<div class="modal-card" role="alertdialog" aria-modal="true"><div class="mt"></div><div class="md"></div><div class="acts"><button data-v="0"></button><button class="pri" data-v="1"></button></div></div>';
      wrap.querySelector('.mt').textContent = title;
      wrap.querySelector('.md').textContent = message;
      wrap.querySelector('[data-v="0"]').textContent = cancel;
      wrap.querySelector('[data-v="1"]').textContent = ok;
      const done = (v) => { wrap.remove(); removeEventListener('keydown', onKey, true); resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
      };
      wrap.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) done(b.dataset.v === '1'); else if (e.target === wrap) done(false); });
      addEventListener('keydown', onKey, true);
      root.appendChild(wrap);
      wrap.querySelector('.pri').focus();
    });
  }

  // ---------------------------------------------------------------- finish
  function send(msg) {
    return new Promise((resolve) => {
      try { chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? { ok: false, message: '확장 프로그램이 업데이트됐어요. 페이지를 새로고침해 주세요.' } : r)); }
      catch (e) { resolve({ ok: false, message: '확장 프로그램이 업데이트됐어요. 페이지를 새로고침해 주세요.' }); }
    });
  }

  async function finish() {
    const d = drag;
    drag = null; press = null;
    clearDrawing();
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = 0; }
    document.documentElement.style.removeProperty('user-select');
    if (!d) return;
    const hits = computeHitsFor(d);
    const rule = d.rule;
    const how = `${MOD_LABEL[rule.mod] ? MOD_LABEL[rule.mod] + ' + ' : ''}드래그 · ${SHAPE_LABEL[rule.shape]}`;
    // toggle: outlined links are deselected (outline off + removed from the list), the rest are selected
    const fresh = new Set(), off = new Set();
    // 영상 다운로드는 토글하지 않는다: 이미 담긴 영상을 다시 감싸도 선택 해제가 아니라 목록창에 올린다
    for (const h of hits) (rule.action !== 'download' && isMarked(h.a) ? off : fresh).add(h);
    const offKeys = new Set([...off].map((h) => keyOf(h.a.href)));
    if (offKeys.size) {
      unmarkUrls(offKeys);
      if (!DEMO) {
        const r = await send({ type: 'pl:removeUrls', urls: [...offKeys] });
        const n = r && r.ok ? r.count : 0;
        toast({ title: `선택 해제 ${offKeys.size}개${n ? ` · 수집 링크에서 ${n}개 삭제` : ''}`, sub: how,
          actions: r && r.undoToken ? [{ label: '되돌리기', run: async () => { await send({ type: 'pl:undo', token: r.undoToken }); markUrls(offKeys, rule.color || '#2F6BFF', true); } }] : [] });
      } else toast({ title: `(연습) 선택 해제 ${offKeys.size}개`, sub: how });
    }
    const links = buildLinks(fresh);
    if (!links.length) { if (!offKeys.size) toast({ tone: '#98A2B3', error: true, title: '선택한 영역에 링크가 없어요', sub: how }); return; }
    const newKeys = new Set(links.map((l) => keyOf(l.url)));
    const saves = rule.action === 'save' || settings.alsoSave !== false;
    if ((rule.action === 'tabs' || rule.action === 'window') && links.length > (settings.confirmOver || 20)) {
      if (!(await pageConfirm(rule.action === 'tabs' ? '새 탭으로 열기' : '새 창으로 열기', `링크 ${links.length}개를 ${rule.action === 'tabs' ? '새 탭' : '새 창'}으로 열까요?`, '열기'))) return;
    }
    const lines = links.slice(0, 3).map((l) => '• ' + (l.title || l.url));
    if (links.length > 3) lines.push(`외 ${links.length - 3}개`);
    if (DEMO) {
      markUrls(newKeys, rule.color || '#2F6BFF', false);
      toast({ tone: rule.color, title: `(연습) 링크 ${links.length}개 · ${ACTION_LABEL[rule.action]}`, sub: how + ' · 실제 동작은 하지 않아요', lines });
      globalThis.dispatchEvent(new CustomEvent('pl-demo-result', { detail: { count: links.length, action: rule.action } }));
      return;
    }
    if (rule.action === 'download') {
      const vids = links.filter(dlOk);
      if (!vids.length) { toast({ tone: '#98A2B3', error: true, title: '선택한 영역에 영상 링크가 없어요', sub: '유튜브·틱톡·비메오·빌리빌리 게시물 링크만 받을 수 있어요' }); return; }
      const r = await send({ type: 'pl:grab', action: 'download', shape: rule.shape, mod: rule.mod, links: vids, page: { url: location.href, title: document.title } });
      if (!r || !r.ok) { toast({ tone: '#F04438', error: true, title: (r && r.message) || '처리하지 못했어요', sub: how }); return; }
      markUrls(new Set(vids.map((l) => keyOf(l.url))), rule.color || '#C83F55', true);
      openDlPanel(vids, rule.color || '#C83F55');
      return;
    }
    const res = await send({ type: 'pl:grab', action: rule.action, shape: rule.shape, mod: rule.mod, links, page: { url: location.href, title: document.title } });
    if (!res || !res.ok) { toast({ tone: '#F04438', error: true, title: (res && res.message) || '처리하지 못했어요', sub: how }); return; }
    markUrls(newKeys, rule.color || '#2F6BFF', saves);
    if (res.copyPayload && !(await writeClip(res.copyPayload.text, res.copyPayload.html))) {
      toast({ tone: '#F04438', error: true, title: '클립보드에 복사하지 못했어요', sub: '페이지를 한 번 클릭한 뒤 다시 시도해 주세요' });
      return;
    }
    const actions = [];
    if (res.undoToken) {
      actions.push({ label: '되돌리기', run: () => send({ type: 'pl:undo', token: res.undoToken }) });
      actions.push({ label: '사이드바에서 보기', primary: true, run: () => send({ type: 'pl:openSidePanel' }) });
    }
    const shown = Array.isArray(res.titles) && res.titles.length ? res.titles : links.map((l) => l.title || l.url);
    const finalLines = shown.slice(0, 3).map((t) => '• ' + t);
    if (shown.length > 3) finalLines.push(`외 ${shown.length - 3}개`);
    toast({ tone: rule.color, title: res.message, sub: how + (res.note ? ' · ' + res.note : ''), lines: finalLines, actions });
  }
  // ---------------------------------------------------------------- 다운로드 목록창
  // 우클릭 드래그로 고른 영상을 보여 주고, [다운로드] 를 누르면 백그라운드가 다운로더 서버 배치 API 로 보낸다.
  // 창은 한 개만 두고, 새로 드래그하면 목록에 이어 붙는다. 진행률은 2초마다 갱신.
  let dlp = null; // { el, items: Map(url → {link, row}), job, timer, tone }
  const escH = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MODE_LABEL = { both: '영상+음성', video: '영상만', audio: '음성만' };
  function dlWhere() {
    const dl = settings.dl || {};
    return `저장 위치: ${dl.saveDir || '서버 기본 폴더'} · ${MODE_LABEL[dl.mode] || '영상+음성'}${dl.quality ? ` · 최대 ${dl.quality}p` : ' · 최고 화질'}`;
  }
  function closeDlPanel() {
    if (!dlp) return;
    clearTimeout(dlp.timer);
    const el = dlp.el; dlp = null;
    el.classList.add('out'); setTimeout(() => el.remove(), 200);
  }
  function dlRow(link) {
    const row = document.createElement('label');
    row.className = 'dlp-row';
    row.innerHTML = `<input type="checkbox" checked><span class="dlp-th" style="${link.thumb ? `background-image:url(&quot;${escH(link.thumb)}&quot;)` : ''}"></span><span><div class="dlp-t">${escH(link.title || link.url)}</div><div class="dlp-m">${escH((link.domain || '').replace(/^www\./, ''))}</div></span>`;
    return row;
  }
  function dlUpdateCount() {
    if (!dlp || dlp.job) return;
    const n = [...dlp.items.values()].filter((it) => it.row.querySelector('input').checked).length;
    dlp.el.querySelector('.dlp-acts .n').textContent = `${dlp.items.size}개 중 ${n}개 선택`;
    const b = dlp.el.querySelector('button.pri'); b.textContent = `다운로드 ${n}개`; b.disabled = !n;
  }
  function openDlPanel(links, tone) {
    ensureOverlay();
    if (!dlp || dlp.job) {
      if (dlp) closeDlPanel();
      const el = document.createElement('div');
      el.className = 'dlp';
      el.style.setProperty('--tone', tone || '#C83F55');
      el.innerHTML = `<div class="dlp-h"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5"></path></svg></span><div class="tt">영상 다운로드</div><button type="button" class="x" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div>
        <div class="dlp-list"></div>
        <div class="dlp-f"><div class="dlp-where">${escH(dlWhere())}</div><div class="dlp-bar"><span></span></div>
          <div class="dlp-acts"><span class="n"></span><button type="button" class="cfg">설정</button><button type="button" class="pri">다운로드</button></div></div>`;
      el.querySelector('.x').addEventListener('click', closeDlPanel);
      el.querySelector('.cfg').addEventListener('click', () => send({ type: 'pl:openOptions' }));
      el.querySelector('.pri').addEventListener('click', startDl);
      el.addEventListener('change', dlUpdateCount);
      el.addEventListener('mousedown', (e) => e.stopPropagation(), true); // 창 안에서 드래그가 시작되지 않게
      el.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
      toastWrap.parentNode.appendChild(el);
      dlp = { el, items: new Map(), job: null, timer: 0, tone };
    }
    const list = dlp.el.querySelector('.dlp-list');
    for (const l of links) {
      const k = keyOf(l.url);
      if (dlp.items.has(k)) continue;
      const row = dlRow(l); list.appendChild(row); dlp.items.set(k, { link: l, row });
    }
    dlUpdateCount();
  }
  async function startDl() {
    if (!dlp || dlp.job) return;
    const picked = [...dlp.items.values()].filter((it) => it.row.querySelector('input').checked);
    if (!picked.length) return;
    const btn = dlp.el.querySelector('button.pri'); btn.disabled = true; btn.textContent = '보내는 중…';
    const r = await send({ type: 'pl:dlBatch', urls: picked.map((it) => it.link.url), referer: location.href });
    if (!dlp) return;
    if (!r || !r.ok) {
      btn.disabled = false; btn.textContent = `다운로드 ${picked.length}개`;
      toast({ tone: '#F04438', error: true, title: (r && r.message) || '다운로드를 시작하지 못했어요', sub: '설정 › 영상 다운로드에서 서버 주소를 확인하세요', actions: [{ label: '설정 열기', run: () => send({ type: 'pl:openOptions' }) }] });
      return;
    }
    // 진행 모드: 체크 안 한 행은 지우고, 체크박스는 잠근다
    for (const [k, it] of dlp.items) { if (!picked.includes(it)) { it.row.remove(); dlp.items.delete(k); } else it.row.querySelector('input').disabled = true; }
    dlp.job = r.batch;
    dlp.el.querySelector('.dlp-bar').classList.add('on');
    dlp.el.querySelector('.cfg').style.display = 'none';
    btn.textContent = '닫기'; btn.disabled = false; btn.onclick = closeDlPanel;
    btn.removeEventListener('click', startDl);
    dlRender(r.batch);
    dlp.timer = setTimeout(dlPoll, 1500);
  }
  async function dlPoll() {
    if (!dlp || !dlp.job) return;
    const r = await send({ type: 'pl:dlStatus', id: dlp.job.batch_id });
    if (!dlp) return;
    if (r && r.ok) { dlp.job = r.batch; dlRender(r.batch); }
    if (dlp.job.status !== 'done') dlp.timer = setTimeout(dlPoll, 2000);
  }
  const dlFetched = new Set();
  async function dlFetchDone(b) {
    const r = await send({ type: 'pl:dlShouldFetch' });
    if (!r || !r.fetch) return;
    for (const it of b.items || []) {
      if (it.status !== 'completed' || dlFetched.has(it.task_id)) continue;
      dlFetched.add(it.task_id);
      send({ type: 'pl:dlFetchFile', taskId: it.task_id, filename: (it.file_path || '').split(/[\\/]/).pop() });
    }
  }
  function dlRender(b) {
    if (!dlp) return;
    dlFetchDone(b);
    const c = b.counts || {};
    dlp.el.querySelector('.dlp-bar span').style.width = Math.min(100, Math.round(b.progress || 0)) + '%';
    const done = b.status === 'done';
    dlp.el.querySelector('.dlp-acts .n').textContent = done
      ? `완료 · 성공 ${c.completed || 0}개${c.error ? ` · 실패 ${c.error}개` : ''}`
      : `다운로드 중 ${Math.round(b.progress || 0)}% · 완료 ${c.completed || 0}/${b.total}${c.error ? ` · 실패 ${c.error}` : ''}`;
    for (const it of b.items || []) {
      const row = dlp.items.get(keyOf(it.url)); if (!row) continue;
      const m = row.row.querySelector('.dlp-m');
      if (it.status === 'completed') { m.className = 'dlp-m ok'; m.textContent = '완료' + (it.file_path ? ' · ' + it.file_path.split(/[\\/]/).pop() : ''); }
      else if (it.status === 'error' || it.status === 'failed') { m.className = 'dlp-m err'; m.textContent = '실패 · ' + (it.error || ''); m.title = it.error || ''; }
      else if (it.status === 'downloading' || it.status === 'processing') { m.className = 'dlp-m run'; m.textContent = `${Math.round(it.progress || 0)}%` + (it.status_msg ? ' · ' + it.status_msg : ''); }
      else { m.className = 'dlp-m'; m.textContent = '대기 중'; }
    }
    if (done) toast({ tone: c.error ? '#F04438' : dlp.tone, error: !!c.error, title: c.error ? `다운로드 끝 · 성공 ${c.completed || 0}개, 실패 ${c.error}개` : `영상 ${c.completed || 0}개를 다운로드했어요`, sub: (settings.dl && settings.dl.saveDir) || '서버 기본 폴더' });
  }

  async function writeClip(text, html) {
    try {
      if (html && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      else await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      let ok = false;
      const onCopy = (ev) => { ev.clipboardData.setData('text/plain', text); if (html) ev.clipboardData.setData('text/html', html); ev.preventDefault(); ok = true; };
      document.addEventListener('copy', onCopy, true);
      try { document.execCommand('copy'); } catch (err) { /* noop */ }
      document.removeEventListener('copy', onCopy, true);
      return ok;
    }
  }
  function computeHitsFor(d) { const keep = drag; drag = d; refreshRects(); const h = computeHits(); drag = keep; return h; }

  function cancel() {
    if (!drag && !press) return;
    drag = null; press = null;
    clearDrawing();
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = 0; }
    document.documentElement.style.removeProperty('user-select');
  }

  // ---------------------------------------------------------------- events
  addEventListener('mousedown', (e) => {
    if (drag) return;
    // every press starts fresh: a modifier press whose release we never saw (Chrome's context
    // menu swallows the mouseup after Shift + right click) must not turn the next plain drag
    // into that rule
    press = null;
    const rule = findRule(e);
    if (!rule) return;
    press = { rule, cx: e.clientX, cy: e.clientY };
    if (rule.button === 'right' && !IS_WIN) suppressMenuUntil = Date.now() + 400; // mac/linux open menu on mousedown
    if (rule.button === 'left') e.preventDefault();
  }, true);

  // A press made before this engine was injected on demand (src/core/loader.js): take it over so the
  // drag that is already under way works. The rule is looked up again here (the loader only knows
  // modifier + button).
  {
    const pending = globalThis.__PL_PRESS;
    globalThis.__PL_PRESS = null;
    if (pending && Date.now() - pending.t < 5000 && !press && !drag) {
      const rule = (settings.rules || []).find((r) => r.enabled !== false && r.button === pending.rule.button && r.mod === pending.rule.mod);
      if (rule) press = { rule, cx: pending.cx, cy: pending.cy };
    }
  }

  addEventListener('mousemove', (e) => {
    // The button was released where we could not see it (outside the window, over an iframe,
    // or another script swallowed mouseup): end the gesture instead of leaving the box on screen.
    if ((drag || press) && e.buttons === 0) { if (drag) endDrag(); else press = null; return; }
    if (press && !drag) {
      if (Math.hypot(e.clientX - press.cx, e.clientY - press.cy) < DRAG_START) return;
      // the rule's modifier must still be held when the drag really starts; no modifier = no action
      if (modOf(e) !== press.rule.mod) { press = null; return; }
      ensureOverlay();
      drag = { rule: press.rule, points: [pageOf(press.cx, press.cy)], cur: { cx: e.clientX, cy: e.clientY }, cands: collectCandidates(), hits: new Set() };
      press = null;
      document.documentElement.style.setProperty('user-select', 'none', 'important');
      try { getSelection().removeAllRanges(); } catch (err) { /* noop */ }
    }
    if (!drag) return;
    drag.cur = { cx: e.clientX, cy: e.clientY };
    if (drag.rule.shape === 'lasso') {
      const p = pageOf(e.clientX, e.clientY);
      const last = drag.points[drag.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 4) drag.points.push(p);
    }
    schedule();
    if (!scrollRaf && settings.autoscroll !== false) scrollRaf = requestAnimationFrame(autoscroll);
    e.preventDefault();
  }, true);

  // Do not stopPropagation here: other scripts on the page must still see the release,
  // otherwise their own overlays (e.g. other gesture extensions) stay stuck on screen.
  function endDrag(e) {
    if (e) e.preventDefault();
    suppressMenuUntil = Date.now() + 400;
    suppressClickUntil = Date.now() + 400;
    finish();
  }
  addEventListener('mouseup', (e) => {
    if (drag) endDrag(e);
    else if (press) press = null; // plain click: let the page handle it
  }, true);
  addEventListener('pointerup', (e) => { if (drag && e.pointerType === 'mouse') endDrag(e); }, true);
  addEventListener('pointercancel', () => cancel(), true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });

  addEventListener('contextmenu', (e) => {
    if (drag || Date.now() < suppressMenuUntil) e.preventDefault();
  }, true);
  addEventListener('click', (e) => {
    if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); suppressClickUntil = 0; }
  }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && (drag || press)) { e.preventDefault(); cancel(); } }, true);
  addEventListener('scroll', () => { if (drag) { refreshRects(); schedule(); } }, true);
  addEventListener('blur', cancel);
})();
