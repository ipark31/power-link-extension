// Power Link — in-page link grabbing engine (box / lasso).
// Classic content script. Requires src/shared/classify.js to be loaded first (globalThis.PLClassify).
// When globalThis.PL_DEMO is true (options page practice area) nothing is sent; results are only shown.
(() => {
  if (globalThis.__PL_ENGINE__) return;
  globalThis.__PL_ENGINE__ = true;

  const DEMO = !!globalThis.PL_DEMO;
  const DRAG_START = 8;          // px before a press becomes a drag
  const EDGE = 40;               // px from viewport edge that triggers autoscroll
  const ACTION_LABEL = { copy: '복사', tabs: '새 탭으로 열기', window: '새 창으로 열기', save: '목록에 저장' };
  const SHAPE_LABEL = { box: '박스', lasso: '자유도형' };
  const MOD_LABEL = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', none: '' };
  const IS_WIN = /Win/i.test(navigator.platform || navigator.userAgent);

  let settings = {
    rules: [
      { id: 'r1', enabled: true, mod: 'ctrl', button: 'right', shape: 'box', action: 'copy', color: '#2F6BFF' },
      { id: 'r2', enabled: true, mod: 'shift', button: 'right', shape: 'box', action: 'tabs', color: '#E8590C' },
      { id: 'r3', enabled: true, mod: 'alt', button: 'right', shape: 'lasso', action: 'save', color: '#0E9384' }
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
    * { box-sizing: border-box; font-family: 'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
    svg.draw { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
    .box { position: absolute; border: 2px dashed var(--tone); border-radius: 6px; background: color-mix(in srgb, var(--tone) 7%, transparent); display: none; }
    svg.draw path { fill: color-mix(in srgb, var(--tone) 6%, transparent); stroke: var(--tone); stroke-width: 2; stroke-dasharray: 7 5; stroke-linejoin: round; stroke-linecap: round; }
    .hl { position: absolute; border-radius: 4px; box-shadow: 0 0 0 2px var(--tone); background: color-mix(in srgb, var(--tone) 8%, transparent); }
    .pill { position: absolute; display: none; align-items: center; gap: 10px; padding: 8px 12px 8px 8px; background: #101828; color: #fff; border-radius: 12px; box-shadow: 0 16px 32px -10px rgba(16,24,40,.45); white-space: nowrap; }
    .pill b { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 8px; background: var(--tone); font: 600 14px ui-monospace, 'SF Mono', Consolas, monospace; }
    .pill .t { font-size: 13px; font-weight: 600; }
    .pill .s { font-size: 11px; color: #98A2B3; }
    .toasts { position: fixed; right: 24px; bottom: 24px; display: flex; flex-direction: column; gap: 10px; pointer-events: none; z-index: 2147483647; }
    .toast { pointer-events: auto; width: 360px; padding: 14px; border-radius: 14px; background: #101828; color: #fff; box-shadow: 0 20px 44px -12px rgba(16,24,40,.5); display: flex; flex-direction: column; gap: 10px; animation: in .22s cubic-bezier(.2,.8,.2,1); }
    .toast.out { animation: out .18s ease forwards; }
    .head { display: flex; gap: 10px; align-items: flex-start; }
    .ic { width: 28px; height: 28px; border-radius: 8px; background: var(--tone); display: grid; place-items: center; flex-shrink: 0; }
    .ic svg { width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    .tt { font-size: 13.5px; font-weight: 600; line-height: 1.4; }
    .ts { font-size: 12px; color: #98A2B3; margin-top: 2px; }
    .list { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-radius: 9px; background: rgba(255,255,255,.06); }
    .list span { font-size: 11.5px; color: #D0D5DD; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .acts { display: flex; gap: 8px; justify-content: flex-end; }
    button { height: 28px; padding: 0 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #344054; background: transparent; color: #D0D5DD; }
    button.pri { background: #fff; color: #101828; border-color: #fff; }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes out { to { opacity: 0; transform: translateY(6px); } }`;

  function ensureOverlay() {
    if (host && host.isConnected) return;
    host = document.createElement('power-link-overlay');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS}</style><div class="layer"><div class="hls"></div><svg class="draw"><path d=""></path></svg><div class="box"></div><div class="pill"><b>0</b><div><div class="t"></div><div class="s"></div></div></div></div><div class="toasts"></div>`;
    layer = root.querySelector('.layer');
    hlLayer = root.querySelector('.hls');
    svg = root.querySelector('svg.draw');
    pathEl = root.querySelector('svg.draw path');
    boxEl = root.querySelector('.box');
    pill = root.querySelector('.pill');
    toastWrap = root.querySelector('.toasts');
    (document.documentElement || document.body).appendChild(host);
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
      const cs = getComputedStyle(a);
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
      out.push({ a, x: r.left + sx, y: r.top + sy, w: r.width, h: r.height });
    }
    return out;
  }
  function refreshRects() {
    if (!drag) return;
    const sx = scrollX, sy = scrollY;
    for (const c of drag.cands) {
      const r = c.a.getBoundingClientRect();
      c.x = r.left + sx; c.y = r.top + sy; c.w = r.width; c.h = r.height;
    }
  }

  const pageOf = (cx, cy) => ({ x: cx + scrollX, y: cy + scrollY });

  function boxRect() {
    const a = drag.points[0], b = pageOf(drag.cur.cx, drag.cur.cy);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }
  function inside(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
  function computeHits() {
    const hits = new Set();
    if (drag.rule.shape === 'lasso') {
      if (drag.points.length < 3) return hits;
      for (const c of drag.cands) if (inside({ x: c.x + c.w / 2, y: c.y + c.h / 2 }, drag.points)) hits.add(c);
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
      pathEl.setAttribute('d', drag.points.length > 1 ? 'M ' + drag.points.map((p) => (p.x - sx).toFixed(1) + ' ' + (p.y - sy).toFixed(1)).join(' L ') + ' Z' : '');
    } else {
      pathEl.setAttribute('d', '');
      const b = boxRect();
      Object.assign(boxEl.style, { display: 'block', left: b.x - sx + 'px', top: b.y - sy + 'px', width: b.w + 'px', height: b.h + 'px' });
    }
    drag.hits = computeHits();
    if (settings.highlight !== false) {
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
    el.className = 'toast';
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
    const links = buildLinks(hits);
    const rule = d.rule;
    const how = `${MOD_LABEL[rule.mod] ? MOD_LABEL[rule.mod] + ' + ' : ''}드래그 · ${SHAPE_LABEL[rule.shape]}`;
    if (!links.length) { toast({ tone: '#98A2B3', error: true, title: '선택한 영역에 링크가 없어요', sub: how }); return; }
    if ((rule.action === 'tabs' || rule.action === 'window') && links.length > (settings.confirmOver || 20)) {
      if (!confirm(`링크 ${links.length}개를 ${rule.action === 'tabs' ? '새 탭' : '새 창'}으로 열까요?`)) return;
    }
    const lines = links.slice(0, 3).map((l) => '• ' + (l.title || l.url));
    if (links.length > 3) lines.push(`외 ${links.length - 3}개`);
    if (DEMO) {
      toast({ tone: rule.color, title: `(연습) 링크 ${links.length}개 · ${ACTION_LABEL[rule.action]}`, sub: how + ' · 실제 동작은 하지 않아요', lines });
      globalThis.dispatchEvent(new CustomEvent('pl-demo-result', { detail: { count: links.length, action: rule.action } }));
      return;
    }
    const res = await send({ type: 'pl:grab', action: rule.action, shape: rule.shape, mod: rule.mod, links, page: { url: location.href, title: document.title } });
    if (!res || !res.ok) { toast({ tone: '#F04438', error: true, title: (res && res.message) || '처리하지 못했어요', sub: how }); return; }
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
    const rule = findRule(e);
    if (!rule) return;
    press = { rule, cx: e.clientX, cy: e.clientY };
    if (rule.button === 'right' && !IS_WIN) suppressMenuUntil = Date.now() + 400; // mac/linux open menu on mousedown
    if (rule.button === 'left') e.preventDefault();
  }, true);

  addEventListener('mousemove', (e) => {
    // The button was released where we could not see it (outside the window, over an iframe,
    // or another script swallowed mouseup): end the gesture instead of leaving the box on screen.
    if ((drag || press) && e.buttons === 0) { if (drag) endDrag(); else press = null; return; }
    if (press && !drag) {
      if (Math.hypot(e.clientX - press.cx, e.clientY - press.cy) < DRAG_START) return;
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
