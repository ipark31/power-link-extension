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
  // 인스타그램은 게시물(/p/, /reel/, /tv/)만 — 가입·로그인 안내 같은 다른 인스타 링크는 영상이 아니다
  const dlOk = (l) => l && l.kind !== 'account' && DL_HOSTS.test((l.domain || '').replace(/^(www|m)\./, '')) && (l.platform !== 'ig' || !!(l.ids && l.ids.postId));
  const SHAPE_LABEL = { box: '박스', lasso: '선 긋기' };
  const MOD_LABEL = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', none: '' };
  const IS_WIN = /Win/i.test(navigator.platform || navigator.userAgent);

  let settings = {
    rules: [
      { id: 'r1', enabled: true, mod: 'ctrl', button: 'right', shape: 'box', action: 'copy', color: '#2F6BFF' },
      { id: 'r2', enabled: true, mod: 'shift', button: 'right', shape: 'box', action: 'tabs', color: '#E8590C' },
      { id: 'r3', enabled: true, mod: 'alt', button: 'right', shape: 'lasso', action: 'save', color: '#2F6BFF' },
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
    /* Colours are tokens so the overlay can follow the extension's theme (chrome.storage.local 'pl_theme', same as src/ui/theme.js).
       The host carries data-theme="dark|light". Defaults are the dark values. The light values apply to the download panel and the
       confirm dialog only: toasts and the drag pill stay dark in both themes, like the side panel's bottom bar. */
    :host { all: initial;
      --bg: #0F0F0F; --text: #F1F1F1; --text2: #D0D0D0; --muted: #AAAAAA; --border: #303030; --divider: #262626; --chip: #272727;
      --sunken: #1F1F1F; --hover: #1A1A1A; --track: #2A2A2A; --ink: #F1F1F1; --on-ink: #0F0F0F; --ok: #4ADE80; --err: #F87171; --warn: #FBBF24;
      --stop-bg: #7F1D1D; --stop-text: #FEE2E2; --stop-hover: #991B1B; --sh: .45; --sh2: .6; }
    .dlp, .modal-card { color-scheme: dark; }
    :host([data-theme="light"]) .dlp, :host([data-theme="light"]) .modal-card { color-scheme: light;
      --bg: #FFFFFF; --text: #0F0F0F; --text2: #3F3F3F; --muted: #606060; --border: #E5E5E5; --divider: #F0F0F0; --chip: #F2F2F2;
      --sunken: #F7F7F7; --hover: #F5F5F5; --track: #E5E5E5; --ink: #0F0F0F; --on-ink: #FFFFFF; --ok: #0B7A3B; --err: #DC2626; --warn: #B45309;
      --stop-bg: #DC2626; --stop-text: #FFFFFF; --stop-hover: #B91C1C; --sh: .22; --sh2: .28; }
    /* Vertical centering (checked by tests/align.mjs, which measures the text ink in pixels):
       - The first available font sets the line box. Korean fonts come first so that Hangul and Latin share one font on every site;
         with Roboto first, pages that load it (YouTube) got a different line box from pages that do not.
       - line-height is explicit and in whole pixels everywhere: with 'normal', a fallback font's taller ascent stretches the line box
         and text sits low; a fractional line-height (1.4 x 11px) puts boxes between pixels and text then rounds up here, down there.
       - The browser puts the text baseline on a whole pixel, and Korean fonts draw glyphs about half a pixel below the middle of the
         line box. In an even-height pill the text therefore ends up half a pixel high or low whatever the padding. Pills (buttons,
         the count badge) have an odd height and 1px more padding at the bottom: measured 0.00px off with Noto Sans KR and
         0.13-0.25px with Malgun Gothic. Text beside buttons copies the button's geometry so both share a baseline. */
    * { box-sizing: border-box; font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', Roboto, Arial, sans-serif; line-height: 16px; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
    svg.draw { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
    .box { position: absolute; border: 2px dashed var(--tone); border-radius: 6px; background: color-mix(in srgb, var(--tone) 7%, transparent); display: none; }
    svg.draw path { fill: none; stroke: var(--tone); stroke-width: 3; stroke-opacity: .85; stroke-linejoin: round; stroke-linecap: round; }
    .marks { position: absolute; inset: 0; overflow: hidden; }
    .marks-doc { position: absolute; left: 0; top: 0; will-change: transform; }
    .mark { position: absolute; border-radius: 4px; box-shadow: 0 0 0 2px var(--tone); background: color-mix(in srgb, var(--tone) 6%, transparent); }
    /* 'hide page marks' (side panel eye button, Alt+Shift+M) hides the boxes of saved links and opened tabs, never the boxes of
       videos in the open download panel: what is in that panel is always outlined on the page. */
    .marks.hide .mark:not(.keep) { display: none !important; }
    /* a link in two or three places: one more ring per place, 1px apart (see paintMark) */
    .mark.two { outline: 2px solid var(--tone2); outline-offset: 3px; }
    .mark.three::after { content: ''; position: absolute; inset: -8px; border-radius: 10px; box-shadow: 0 0 0 2px var(--tone3); }
    .hl { position: absolute; border-radius: 4px; box-shadow: 0 0 0 2px var(--tone); background: color-mix(in srgb, var(--tone) 8%, transparent); }
    .pill { position: absolute; display: none; align-items: center; gap: 10px; padding: 8px 12px 8px 8px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 28px -10px rgba(0,0,0,var(--sh)); white-space: nowrap; }
    .pill b { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px 2px; border-radius: 8px; background: var(--chip); font-size: 14px; line-height: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
    .pill .t { font-size: 13px; line-height: 18px; font-weight: 500; }
    .pill .s { font-size: 11px; color: var(--muted); }
    .toasts { position: fixed; right: 24px; bottom: 24px; display: flex; flex-direction: column; gap: 10px; pointer-events: none; z-index: 2147483647; }
    .toast { pointer-events: auto; width: 360px; padding: 14px; border-radius: 12px; background: var(--bg); color: var(--text); border: 1px solid var(--border); box-shadow: 0 12px 28px -10px rgba(0,0,0,var(--sh)); display: flex; flex-direction: column; gap: 10px; animation: in .22s cubic-bezier(.2,.8,.2,1); }
    .toast.out { animation: out .18s ease forwards; }
    .head { display: flex; gap: 10px; align-items: flex-start; }
    .ic { width: 22px; height: 22px; margin-top: -1px; border-radius: 50%; background: #16A34A; display: grid; place-items: center; flex-shrink: 0; }
    .toast.err .ic { background: #DC2626; }
    .ic svg { width: 13px; height: 13px; fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .tt { font-size: 13px; font-weight: 500; line-height: 20px; }
    .ts { font-size: 12px; line-height: 17px; color: var(--muted); margin-top: 2px; }
    .list { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-radius: 8px; background: var(--sunken); }
    .list span { font-size: 12px; line-height: 17px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .acts { display: flex; gap: 8px; justify-content: flex-end; }
    button { display: inline-flex; align-items: center; justify-content: center; height: 31px; padding: 0 14px 1px; border-radius: 16px; font-size: 12px; line-height: 12px; font-weight: 500; white-space: nowrap; cursor: pointer; border: 0; background: var(--chip); color: var(--text); }
    button.pri { background: var(--ink); color: var(--on-ink); }
    .modal { position: fixed; inset: 0; z-index: 2147483647; pointer-events: auto; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.45); }
    .modal-card { width: 100%; max-width: 340px; padding: 20px; border-radius: 14px; background: var(--bg); color: var(--text); border: 1px solid var(--border); box-shadow: 0 12px 28px -10px rgba(0,0,0,var(--sh)); display: flex; flex-direction: column; gap: 8px; animation: in .15s ease; }
    .mt { font-size: 15px; line-height: 22px; font-weight: 500; }
    .md { font-size: 13px; line-height: 20px; color: var(--text2); }
    .modal .acts { margin-top: 8px; }
    /* 다운로드 목록창 (우클릭 드래그 → 영상 고르기 → 다운로드) */
    .dlp { position: fixed; right: 24px; bottom: 24px; width: 424px; max-height: min(70vh, 640px); z-index: 2147483647; pointer-events: auto; display: flex; flex-direction: column;
           border-radius: 14px; background: var(--bg); color: var(--text); border: 1px solid var(--border); box-shadow: 0 16px 36px -12px rgba(0,0,0,var(--sh2)); animation: in .18s ease; overflow: hidden; }
    .dlp.out { animation: out .18s ease forwards; }
    .dlp-h { display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px 14px; border-bottom: 1px solid var(--divider); }
    .dlp-h .ic { background: var(--tone, #C83F55); margin-top: 0; }
    .dlp-h .tt { flex: 1; }
    .dlp-h .x, .dlp-h .cfg, .dlp-h .lst { width: 28px; height: 28px; padding: 0; border-radius: 50%; background: none; color: var(--muted); display: grid; place-items: center; }
    .dlp-h .x:hover, .dlp-h .cfg:hover, .dlp-h .lst:hover { background: var(--chip); color: var(--text); }
    .dlp-h .x:disabled, .dlp-h .cfg:disabled { opacity: .3; cursor: not-allowed; background: none; }
    .dlp-h .x svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
    .dlp-h .cfg, .dlp-h .lst { margin-right: -4px; }
    .dlp-h .lst svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
    .dlp-h .cfg svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .dlp-list { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; }
    .dlp-row { display: grid; grid-template-columns: 18px 56px minmax(0, 1fr); gap: 10px; align-items: center; padding: 6px; border-radius: 8px; cursor: pointer; }
    .dlp-row > .dlp-b { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .dlp-row.lock { cursor: default; }
    .dlp-row input:disabled { cursor: default; opacity: .55; }
    .dlp-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .dlp-pb { flex: 1; min-width: 0; height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
    .dlp-pb span { display: block; height: 100%; width: 0; background: var(--tone, #C83F55); transition: width .4s ease; }
    .dlp-pb.ok span { background: var(--ok); } .dlp-pb.err span { background: var(--err); } .dlp-pb.stop span { background: var(--warn); }
    .dlp-pb.idle { visibility: hidden; }
    .dlp-row:hover { background: var(--hover); }
    .dlp-row input { width: 16px; height: 16px; margin: 0; accent-color: var(--tone, #C83F55); cursor: pointer; }
    .dlp-th { width: 56px; height: 32px; border-radius: 6px; background: var(--chip) center/cover no-repeat; flex-shrink: 0; }
    .dlp-t { font-size: 12px; line-height: 16px; max-height: 32px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .dlp-m { font-size: 11px; line-height: 15px; padding-bottom: 1px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; max-width: 100%; }
    .dlp-m.host { flex-shrink: 1; min-width: 0; }
    .dlp-m.ok { color: var(--ok); } .dlp-m.err { color: var(--err); } .dlp-m.run { color: var(--text); }
    .dlp-f { padding: 10px 12px 12px; border-top: 1px solid var(--divider); display: flex; flex-direction: column; gap: 8px; }
    .dlp-bar { height: 4px; border-radius: 2px; background: var(--chip); overflow: hidden; display: none; }
    .dlp-bar span { display: block; height: 100%; width: 0; background: var(--tone, #C83F55); transition: width .4s ease; }
    .dlp-bar.on { display: block; }
    .dlp-acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .dlp-btns { display: flex; gap: 8px; margin-left: auto; }
    .dlp-acts .n { font-size: 12px; line-height: 12px; padding: 9px 0 10px; color: var(--muted); flex: 0 1 auto; max-width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button:disabled { opacity: .45; cursor: default; }
    button.stop { background: var(--stop-bg); color: var(--stop-text); }
    button.stop:hover { background: var(--stop-hover); }
    .dlp-m.stop { color: var(--warn); }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes out { to { opacity: 0; transform: translateY(6px); } }`;

  // ---------------------------------------------------------------- theme
  // The same choice the extension pages use (src/ui/theme.js): 'device' | 'dark' | 'light' in chrome.storage.local 'pl_theme'.
  // Changing it in the side panel or the settings page restyles an open download panel at once.
  let themeChoice = 'device';
  const themeMedia = globalThis.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    if (!host) return;
    host.dataset.theme = themeChoice === 'dark' || themeChoice === 'light' ? themeChoice : themeMedia && themeMedia.matches ? 'dark' : 'light';
  }
  try {
    chrome.storage.local.get('pl_theme', (r) => { if (!chrome.runtime.lastError && r) { themeChoice = r.pl_theme || 'device'; applyTheme(); } });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.pl_theme) { themeChoice = ch.pl_theme.newValue || 'device'; applyTheme(); } });
    if (themeMedia) themeMedia.addEventListener('change', applyTheme);
  } catch (e) { /* extension was reloaded */ }

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
    applyTheme();
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
    for (const c of tiktokCandidates()) out.push(c);
    for (const c of instagramCandidates()) out.push(c);
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
  // 틱톡 피드·에피소드의 영상에는 링크(a)가 없다. 영상 요소를 감싼 id(…-<영상번호>)와 작성자 링크로 주소를 만든다.
  function tiktokCandidates() {
    if (!/(^|\.)tiktok\.com$/.test(location.hostname)) return [];
    const out = [], seen = new Set();
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      let id = '', el = v;
      for (let i = 0; i < 10 && el; i++) {
        const m = el.id && String(el.id).match(/(\d{15,})/);
        if (m) { id = m[1]; break; }
        el = el.parentElement;
      }
      if (!id) { const m = location.pathname.match(/\/video\/(\d{15,})/); if (m) id = m[1]; }
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const box = v.closest('article, [data-e2e="recommend-list-item-container"]') || v.parentElement;
      let user = '';
      const au = box && box.querySelector('a[href^="/@"], a[href*="tiktok.com/@"]');
      if (au) { const m = String(au.getAttribute('href')).match(/\/@([^/?#]+)/); if (m) user = m[1]; }
      if (!user) { const m = location.pathname.match(/^\/@([^/?#]+)/); if (m) user = m[1]; }
      const desc = box && box.querySelector('[data-e2e="video-desc"], [data-e2e="browse-video-desc"], h1');
      const a = document.createElement('a');
      a.href = 'https://www.tiktok.com/@' + (user || '_') + '/video/' + id;
      a.setAttribute('title', text(desc ? desc.innerText : '') || (user ? '@' + user + ' 틱톡 영상' : '틱톡 영상'));
      if (v.poster) { const im = document.createElement('img'); im.src = v.poster; a.appendChild(im); }
      out.push({ a, el: v, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    }
    return out;
  }
  // 인스타그램 릴스·게시물의 영상에도 링크(a)가 없다. 주소는
  //   1) 주소창이 릴스·게시물(/reels/코드, /reel/코드, /p/코드, /계정/reel/코드)이면 화면에 가장 크게 보이는 영상 = 그 코드
  //   2) 아니면(홈 피드 등) 영상을 감싼 가장 가까운 상자 안의 게시물 링크(/p/코드/, 댓글 주소 /p/코드/c/…)
  // 로 만든다. 상자 안에 서로 다른 게시물 링크가 섞여 있으면 어느 영상인지 알 수 없으므로 건너뛴다.
  const IG_POST = /^\/(?:[A-Za-z0-9_.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]{5,})(?:\/|$)/;
  const igCode = (href) => {
    try { const m = new URL(href, location.href).pathname.match(IG_POST); return m && m[1] !== 'audio' ? m[1] : ''; } catch (e) { return ''; }
  };
  const IG_RESERVED = /^(explore|accounts|stories|direct|reels?|p|tv|about|legal|developer|web|emails|challenge|your_activity|settings)$/;
  function igUser(root) {
    for (const a of root.querySelectorAll('a[href]')) {
      const m = (a.getAttribute('href') || '').match(/^(?:https:\/\/www\.instagram\.com)?\/([A-Za-z0-9_.]+)\/?$/);
      if (m && !IG_RESERVED.test(m[1])) return m[1];
    }
    return '';
  }
  function igCaption() {
    // og:title 예) Instagram의 계정님 : "캡션…" / 계정 on Instagram: "caption…" → 캡션 첫 줄
    const og = (document.querySelector('meta[property="og:title"]') || {}).content || '';
    const m = og.match(/:\s*["“]([^\n"”]+)/);
    return m ? text(m[1]) : '';
  }
  function instagramCandidates() {
    if (!/(^|\.)instagram\.com$/.test(location.hostname)) return [];
    const vids = [...document.querySelectorAll('video')].map((v) => ({ v, r: v.getBoundingClientRect() })).filter(({ r }) => r.width >= 40 && r.height >= 40);
    if (!vids.length) return [];
    const seen = new Map();   // 코드 → 영상
    const pageCode = igCode(location.href);
    if (pageCode) {
      const shown = ({ r }) => Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      const main = vids.reduce((a, b) => (shown(b) > shown(a) ? b : a));
      if (shown(main) > 0) seen.set(pageCode, main);
    }
    for (const it of vids) {
      if ([...seen.values()].includes(it)) continue;
      let code = '';
      for (let el = it.v.parentElement, i = 0; el && el !== document.body && i < 25; el = el.parentElement, i++) {
        const codes = new Set([...el.querySelectorAll('a[href]')].map((a) => igCode(a.href)).filter(Boolean));
        if (codes.size === 1) code = [...codes][0];
        if (codes.size) break;
      }
      if (code && !seen.has(code)) seen.set(code, it);
    }
    const ogUrl = (document.querySelector('meta[property="og:url"]') || {}).content || '';
    const out = [];
    for (const [code, { v, r }] of seen) {
      // 영상이 그 게시물 링크 안에 있으면(프로필 격자의 미리보기 등) 링크가 이미 후보다
      const wrap = v.closest('a[href]');
      if (wrap && igCode(wrap.href) === code) continue;
      const box = v.closest('article') || v.parentElement;
      let user = box ? igUser(box) : '';
      if (!user && code === pageCode) { const m = ogUrl.match(/instagram\.com\/([A-Za-z0-9_.]+)\/(?:p|reels?|tv)\//); if (m) user = m[1]; }
      const own = code === pageCode && igCode(ogUrl) === code;   // og 정보가 이 게시물 것인가 (SPA 로 넘어가면 예전 게시물 것일 수 있다)
      const cap = own ? igCaption() : '';
      const a = document.createElement('a');
      a.href = 'https://www.instagram.com/reel/' + code + '/';
      a.setAttribute('title', cap || (user ? '@' + user + ' 인스타그램 영상' : '인스타그램 영상'));
      const poster = v.poster || (own ? (document.querySelector('meta[property="og:image"]') || {}).content : '');
      if (poster) { const im = document.createElement('img'); im.src = poster; a.appendChild(im); }
      out.push({ a, el: v, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
    }
    return out;
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
  // Button labels on ad cards ("시청", "Watch") are links to the video too, but they are not its title.
  const WEAK = /^(?:[\d:.\s]+|live|shorts?|쇼츠|지금 재생 중|now playing|재생목록|playlist|ad|광고|new|새 동영상|시청|시청하기|지금 시청|watch|watch now|재생|play|\d+\s*(?:분|초|시간|개|views?|회)?)$/i;
  function isWeakTitle(t) {
    t = text(t);
    return t.length < 2 || WEAK.test(t) || /^(?:[\d:]+\s*)+(?:지금 재생 중|now playing)?$/i.test(t);
  }
  // A link wrapped around a thumbnail shows overlay badges, not the title: the duration, or stats that other
  // extensions inject ("29.7K VPH", "306 VPH 7.5x"). Short text in such a link is never used as the title.
  const BADGE = /^(?:[\d.,]+\s*[kmb만천억]?\s*(?:vph|x|views?|subs(?:cribers)?|회|조회수)?\s*)+$/i;
  const THUMB = 'img, picture, video, yt-image, yt-thumbnail-view-model, ytd-thumbnail';
  function isThumbText(a, t) {
    if (BADGE.test(t)) return true;
    return t.length <= 40 && !(a.getAttribute && a.getAttribute('title')) && !!(a.querySelector && a.querySelector(THUMB));
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
        if (isWeakTitle(t) || isThumbText(x, t)) continue;
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
    else if (isThumbText(a, title)) title = betterTitle(a, url) || (BADGE.test(title) ? '' : title);
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
    const tone = colorOf(drag.rule);
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
  // url key → { groups: Map(group → tone), els: Map(anchor → outline div) }
  // A box remembers the drag mode that made it: 'dl' = in the download panel, 'list' = in the saved list (side panel),
  // 'tabs' = opened in a tab. A link can be in several. Each mode puts in and takes out only its own membership, and the
  // box goes away when none is left. The colour shown is the download one first, then tabs, then list.
  let marks = new Map();
  const GROUP_ORDER = ['dl', 'tabs', 'list'];
  const groupOf = (action) => (action === 'download' ? 'dl' : action === 'tabs' || action === 'window' ? 'tabs' : 'list');
  // Rules that put links in the saved list (copy, save) differ only in how you select (box or free line): one colour, blue.
  // A colour stored on such a rule is ignored (the save rule used to be teal).
  const LIST_TONE = '#2F6BFF';
  const colorOf = (rule) => (groupOf(rule.action) === 'list' ? LIST_TONE : rule.color || (rule.action === 'download' ? '#C83F55' : '#2F6BFF'));
  // One ring per place the link is in, inside out: download (red), tabs (orange), saved list (blue). So a video that is both
  // in the download panel and in the saved list shows a red ring with a blue ring around it.
  function paintMark(m, el) {
    const tones = [...new Set(GROUP_ORDER.filter((g) => m.groups.has(g)).map((g) => m.groups.get(g)))];
    el.style.setProperty('--tone', tones[0]);
    el.style.setProperty('--tone2', tones[1] || 'transparent');
    el.style.setProperty('--tone3', tones[2] || 'transparent');
    el.classList.toggle('two', tones.length > 1);
    el.classList.toggle('three', tones.length > 2);
    el.classList.toggle('keep', m.groups.has('dl'));   // boxes of the open download panel are never hidden
  }
  const marksDoc = () => root && root.querySelector('.marks-doc');
  const isMarked = (a, group) => { const m = marks.get(keyOf(a.href)); return !!m && (!group || m.groups.has(group)); };
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
  function markUrls(keys, tone, group) {
    if (!keys.size) return;
    ensureOverlay();
    if (marksHref !== location.href) { clearMarks(); marksHref = location.href; }
    const doc = marksDoc();
    const targets = [...document.querySelectorAll('a[href]')].map((a) => [a, a.href]);
    const vurl = currentVideoUrl(), pel = vurl && playerEl();
    if (pel) targets.push([pel, vurl]); // the player stands for the video being watched
    for (const c of tiktokCandidates()) targets.push([c.el, c.a.href]); // 틱톡 영상 요소
    for (const c of instagramCandidates()) targets.push([c.el, c.a.href]); // 인스타그램 영상 요소
    for (const [a, href] of targets) {
      const k = keyOf(href);
      if (!keys.has(k)) continue;
      const r = a.getBoundingClientRect();
      if (!r.width && !r.height) continue; // hidden duplicates
      let m = marks.get(k);
      if (!m) { m = { groups: new Map(), els: new Map() }; marks.set(k, m); }
      m.groups.set(group, tone);
      let el = m.els.get(a);
      if (!el) { el = document.createElement('div'); el.className = 'mark'; doc.appendChild(el); m.els.set(a, el); }
      paintMark(m, el);
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
    for (const [k, m] of rebind) for (const [g, t] of [...m.groups]) markUrls(new Set([k]), t, g);
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
  // Take links out of one mode's boxes (or out of all when no group is given). A link still in another mode keeps its box.
  function unmarkUrls(keys, group) {
    for (const k of keys) {
      const m = marks.get(k);
      if (!m) continue;
      if (group) {
        m.groups.delete(group);
        if (m.groups.size) { m.els.forEach((el) => paintMark(m, el)); continue; }
      }
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
  const applyShowMarks = () => { const m = root && root.querySelector('.marks'); if (m) m.classList.toggle('hide', !showMarks); };
  // A drag is done while looking at the boxes, and what it puts in a list must be outlined: a drag turns the display back on.
  function showMarksAgain() {
    if (showMarks) return;
    showMarks = true; applyShowMarks();
    try { chrome.storage.local.set({ pl_showMarks: true }); } catch (e) { /* extension context invalidated */ }
  }
  try {
    chrome.storage.local.get('pl_showMarks', (r) => { if (!chrome.runtime.lastError && r && r.pl_showMarks === false) { showMarks = false; applyShowMarks(); } });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.pl_showMarks) { showMarks = ch.pl_showMarks.newValue !== false; applyShowMarks(); } });
  } catch (e) { /* extension context invalidated */ }
  // Keep the boxes in step with what actually exists:
  //   a link deleted in the side panel leaves the saved list → its 'list' box goes;
  //   a tab opened by a drag gets closed → its 'tabs' box goes.
  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.pl_links) {
        const keep = new Set((ch.pl_links.newValue || []).map((l) => keyOf(l.url)));
        if (marks.size) unmarkUrls([...marks.entries()].filter(([k, m]) => m.groups.has('list') && !keep.has(k)).map(([k]) => k), 'list');
        // download panel: which videos are in the saved list (the [목록에 추가] button follows this)
        if (dlp) { for (const [k, it] of dlp.items) it.added = keep.has(k); dlRefresh(); }
      }
      if (ch.pl_tabsOpen && marks.size) {
        const open = new Set(Object.keys(ch.pl_tabsOpen.newValue || {}));
        unmarkUrls([...marks.entries()].filter(([k, m]) => m.groups.has('tabs') && !open.has(k)).map(([k]) => k), 'tabs');
      }
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
    if (hits.size) showMarksAgain();
    const rule = d.rule;
    const how = `${MOD_LABEL[rule.mod] ? MOD_LABEL[rule.mod] + ' + ' : ''}드래그 · ${SHAPE_LABEL[rule.shape]}`;
    // Toggle, per drag mode: a link that is already in THIS mode's target is taken out, the others are put in.
    //   download → the download panel     save / copy → the saved list (side panel)     tabs / window → the tabs it opened
    // A mode never touches another mode's target: a plain right-drag leaves the saved list alone, a Ctrl/Alt-drag leaves the
    // download panel alone, a Shift-drag only opens and closes its tabs.
    const group = groupOf(rule.action);
    const fresh = new Set(), off = new Set();
    // a video that is being downloaded stays where it is (stop it with [다운로드 중지])
    const busy = (h) => { const it = group === 'dl' && dlp && dlp.items.get(keyOf(h.a.href)); return !!it && (dlp.sending || dlRunning(it)); };
    for (const h of hits) { if (isMarked(h.a, group)) { if (!busy(h)) off.add(h); } else fresh.add(h); }
    const offKeys = new Set([...off].map((h) => keyOf(h.a.href)));
    if (offKeys.size && group === 'dl') {
      dlDrop(offKeys);   // 다운로드 창에서만 뺀다
    } else if (offKeys.size && group === 'tabs') {
      unmarkUrls(offKeys, 'tabs');
      if (!DEMO) {
        const r = await send({ type: 'pl:closeTabs', urls: [...offKeys] });   // 이 드래그로 열었던 탭을 닫는다
        toast({ title: `탭 ${r && r.ok ? r.count : 0}개를 닫았어요`, sub: how });
      } else toast({ title: `(연습) 선택 해제 ${offKeys.size}개`, sub: how });
    } else if (offKeys.size) {
      unmarkUrls(offKeys, 'list');
      if (!DEMO) {
        const r = await send({ type: 'pl:removeUrls', urls: [...offKeys] });   // 사이드바 목록에서만 뺀다
        const n = r && r.ok ? r.count : 0;
        toast({ title: `선택 해제 ${offKeys.size}개${n ? ` · 수집 링크에서 ${n}개 삭제` : ''}`, sub: how,
          actions: r && r.undoToken ? [{ label: '되돌리기', run: async () => { await send({ type: 'pl:undo', token: r.undoToken }); markUrls(offKeys, LIST_TONE, 'list'); } }] : [] });
      } else toast({ title: `(연습) 선택 해제 ${offKeys.size}개`, sub: how });
    }
    const links = buildLinks(fresh);
    if (!links.length) { if (!offKeys.size) toast({ tone: '#98A2B3', error: true, title: '선택한 영역에 링크가 없어요', sub: how }); return; }
    const newKeys = new Set(links.map((l) => keyOf(l.url)));
    if ((rule.action === 'tabs' || rule.action === 'window') && links.length > (settings.confirmOver || 20)) {
      if (!(await pageConfirm(rule.action === 'tabs' ? '새 탭으로 열기' : '새 창으로 열기', `링크 ${links.length}개를 ${rule.action === 'tabs' ? '새 탭' : '새 창'}으로 열까요?`, '열기'))) return;
    }
    const lines = links.slice(0, 3).map((l) => '• ' + (l.title || l.url));
    if (links.length > 3) lines.push(`외 ${links.length - 3}개`);
    if (DEMO) {
      markUrls(newKeys, colorOf(rule), group);
      toast({ tone: colorOf(rule), title: `(연습) 링크 ${links.length}개 · ${ACTION_LABEL[rule.action]}`, sub: how + ' · 실제 동작은 하지 않아요', lines });
      globalThis.dispatchEvent(new CustomEvent('pl-demo-result', { detail: { count: links.length, action: rule.action } }));
      return;
    }
    if (rule.action === 'download') {
      const vids = links.filter(dlOk);
      if (!vids.length) { if (!offKeys.size) toast({ tone: '#98A2B3', error: true, title: '선택한 영역에 영상 링크가 없어요', sub: '유튜브·틱톡·비메오·빌리빌리·인스타그램 게시물 링크만 받을 수 있어요' }); return; }
      // 우클릭 드래그는 다운로드 창만 다룬다. 사이드바 목록에는 목록창의 [목록에 추가] 를 눌러야 들어간다
      markUrls(new Set(vids.map((l) => keyOf(l.url))), rule.color || '#C83F55', 'dl');
      openDlPanel(vids, rule.color || '#C83F55');
      return;
    }
    const res = await send({ type: 'pl:grab', action: rule.action, shape: rule.shape, mod: rule.mod, links, page: { url: location.href, title: document.title } });
    if (!res || !res.ok) { toast({ tone: '#F04438', error: true, title: (res && res.message) || '처리하지 못했어요', sub: how }); return; }
    // 탭을 연 링크는 '연 탭' 박스, 복사·저장한 링크는 '목록' 박스. (새 탭 규칙이 목록에도 저장하는 설정이어도 박스는 탭만 나타낸다)
    markUrls(newKeys, colorOf(rule), group);
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
    toast({ tone: colorOf(rule), title: res.message, sub: how + (res.note ? ' · ' + res.note : ''), lines: finalLines, actions });
  }
  // ---------------------------------------------------------------- 다운로드 목록창
  // 우클릭 드래그로 고른 영상을 보여 준다. 체크한 것만 받는다.
  //   받기 전  : 체크박스로 고르고 [다운로드 N개] / [선택 삭제]
  //   받는 중  : [다운로드 중지] 만 누를 수 있다. 체크박스(체크된 상태 유지)와 다른 버튼은 잠긴다
  //   끝난 뒤  : 다시 체크박스와 [선택 삭제] 를 쓸 수 있다
  // 파일별 진행률은 막대 하나(영상+음성 합산 비율)로 보여 준다.
  // 창은 한 개만 두고, 새로 드래그하면 목록에 이어 붙는다. 진행률은 2초마다 갱신.
  let dlp = null; // { el, items: Map(key → item), timer, tone, toasted:Set, sending }  item = { link, row, taskId, batchId, status, progress }
  const escH = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DL_DONE = { completed: 1, error: 1, failed: 1, cancelled: 1 };
  const dlSent = (it) => !!it.taskId;
  const dlRunning = (it) => dlSent(it) && !DL_DONE[it.status];
  // 다운로드 창에서 영상을 뺀다: 줄과 '다운로드' 박스가 함께 없어진다. 받는 중인 영상은 그대로 둔다.
  // 사이드바 목록은 건드리지 않는다 (목록에도 있는 영상은 '목록' 박스가 남는다)
  function dlDrop(keys) {
    const gone = new Set();
    if (!dlp) for (const k of keys) gone.add(k);
    else if (!dlp.sending) for (const k of keys) { const it = dlp.items.get(k); if (it && dlRunning(it)) continue; if (it) { it.row.remove(); dlp.items.delete(k); } gone.add(k); }
    unmarkUrls(gone, 'dl');
    if (dlp && gone.size) { if (!dlp.items.size) closeDlPanel(); else dlRefresh(); }
    return gone.size;
  }
  function closeDlPanel() {
    if (!dlp) return;
    if (dlp.sending || [...dlp.items.values()].some(dlRunning)) return; // 받는 중에는 닫지 않는다
    clearTimeout(dlp.timer); clearInterval(dlp.markTimer);
    unmarkUrls(new Set(dlp.items.keys()), 'dl');   // 창이 닫히면 '다운로드' 박스도 없어진다
    const el = dlp.el; dlp = null;
    el.classList.add('out'); setTimeout(() => el.remove(), 200);
  }
  function dlRow(link) {
    const row = document.createElement('label');
    row.className = 'dlp-row';
    row.innerHTML = `<input type="checkbox" checked><span class="dlp-th" style="${link.thumb ? `background-image:url(&quot;${escH(link.thumb)}&quot;)` : ''}"></span><span class="dlp-b"><div class="dlp-t">${escH(link.title || link.url)}</div><div class="dlp-line"><div class="dlp-pb idle"><span></span></div><div class="dlp-m host">${escH((link.domain || '').replace(/^www\./, ''))}</div></div></span>`;
    return row;
  }
  const dlChecked = (it) => it.row.querySelector('input').checked;

  // 한 행의 진행 막대와 상태 글자. 진행률은 서버가 준 합산 값 하나만 쓴다 (영상/음성을 따로 보여 주지 않는다)
  function dlPaint(it, s) {
    const bar = it.row.querySelector('.dlp-pb'), fill = bar.querySelector('span'), m = it.row.querySelector('.dlp-m');
    const pct = Math.max(0, Math.min(100, Math.round(s.progress || 0)));
    m.removeAttribute('title');
    if (s.status === 'completed') { bar.className = 'dlp-pb ok'; fill.style.width = '100%'; m.className = 'dlp-m ok'; m.textContent = '완료'; }
    else if (s.status === 'error' || s.status === 'failed') { bar.className = 'dlp-pb err'; fill.style.width = '100%'; m.className = 'dlp-m err'; m.textContent = '실패'; m.title = s.error || ''; it.row.title = s.error || ''; }
    else if (s.status === 'cancelled') { bar.className = 'dlp-pb stop'; fill.style.width = pct + '%'; m.className = 'dlp-m stop'; m.textContent = '중지됨'; }
    else if (s.status === 'processing') { bar.className = 'dlp-pb'; fill.style.width = '100%'; m.className = 'dlp-m run'; m.textContent = '합치는 중'; }
    else if (s.status === 'downloading') { bar.className = 'dlp-pb'; fill.style.width = pct + '%'; m.className = 'dlp-m run'; m.textContent = pct + '%'; }
    else { bar.className = 'dlp-pb'; fill.style.width = '0%'; m.className = 'dlp-m'; m.textContent = '대기'; }
  }

  // 버튼·요약·진행 막대·잠금 상태를 현재 상태에 맞게 다시 그린다
  function dlRefresh() {
    if (!dlp) return;
    const all = [...dlp.items.values()];
    const fresh = all.filter((it) => !dlSent(it));
    const sent = all.filter(dlSent);
    const running = sent.filter(dlRunning);
    const busy = running.length > 0 || dlp.sending;   // 받는 중: [다운로드 중지] 만 쓸 수 있다
    const checked = all.filter(dlChecked);
    const toSend = fresh.filter(dlChecked);
    const q = (sel) => dlp.el.querySelector(sel);
    const n = (st) => sent.filter((it) => it.status === st).length;
    const failed = n('error') + n('failed');

    let line = '';
    if (sent.length) {
      const pct = Math.round(sent.reduce((a, it) => a + (it.status === 'completed' ? 100 : (it.progress || 0)), 0) / sent.length);
      q('.dlp-bar span').style.width = Math.min(100, pct) + '%';
      const tail = (failed ? ` · 실패 ${failed}` : '') + (n('cancelled') ? ` · 중지 ${n('cancelled')}` : '');
      line = running.length ? `다운로드 중 ${pct}% · 완료 ${n('completed')}/${sent.length}${tail}` : `완료 · 성공 ${n('completed')}개${tail}`;
      if (fresh.length && !busy) line += ` · 새 항목 ${toSend.length}개 선택`;
    } else {
      line = `${all.length}개 중 ${toSend.length}개 선택`;
    }
    // [목록에 추가] 결과는 이 줄에 잠깐 보여 준다 (알림은 이 창 뒤에 가려진다)
    q('.dlp-acts .n').textContent = dlp.note && dlp.note.until > Date.now() ? dlp.note.text : line;
    q('.dlp-bar').classList.toggle('on', sent.length > 0);

    // 받는 동안 체크박스는 체크된 상태 그대로 잠근다
    for (const it of all) {
      it.row.querySelector('input').disabled = busy;
      it.row.classList.toggle('lock', busy);
    }
    const go = q('button.pri'), del = q('button.del'), stop = q('button.stop'), cfg = q('button.cfg');
    go.style.display = fresh.length && !running.length ? '' : 'none';
    go.textContent = dlp.sending ? '보내는 중…' : `다운로드 ${toSend.length}개`;
    go.disabled = busy || !toSend.length;
    stop.style.display = running.length ? '' : 'none';
    stop.disabled = dlp.stopping === true;
    del.disabled = busy || !checked.length;
    del.textContent = !busy && checked.length ? `선택 삭제 ${checked.length}` : '선택 삭제';
    cfg.disabled = busy;
    // 목록에 추가: 체크한 것 중 아직 목록에 넣지 않은 영상. 받는 동안에는 잠근다
    const add = q('button.add'), toAdd = checked.filter((it) => !it.added);
    add.disabled = busy || dlp.adding === true || !toAdd.length;
    add.textContent = dlp.adding ? '추가하는 중…' : checked.length && !toAdd.length ? '목록에 있음' : '목록에 추가';
    // 받는 중에는 창을 닫을 수 없다 (닫으면 진행 상황과 중지 버튼이 사라진다)
    const x = q('.x'); x.disabled = busy; x.title = busy ? '받는 중에는 닫을 수 없어요. 멈추려면 다운로드 중지를 누르세요' : '';
  }

  function openDlPanel(links, tone) {
    ensureOverlay();
    if (!dlp) {
      const el = document.createElement('div');
      el.className = 'dlp';
      el.style.setProperty('--tone', tone || '#C83F55');
      el.innerHTML = `<div class="dlp-h"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5"></path></svg></span><div class="tt">영상 다운로드</div><button type="button" class="lst" aria-label="목록 보기" title="수집 링크 목록 보기 (사이드바 열기)"><svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"></path></svg></button><button type="button" class="cfg" aria-label="설정" title="설정"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6"></circle><circle cx="12" cy="12" r="6.4"></circle><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.35 5.35l2.12 2.12M16.53 16.53l2.12 2.12M5.35 18.65l2.12-2.12M16.53 7.47l2.12-2.12"></path></svg></button><button type="button" class="x" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div>
        <div class="dlp-list"></div>
        <div class="dlp-f"><div class="dlp-bar"><span></span></div>
          <div class="dlp-acts"><span class="n"></span><span class="dlp-btns"><button type="button" class="add" title="체크한 영상을 수집 링크 목록에 저장해요">목록에 추가</button><button type="button" class="del" title="체크한 항목을 목록에서 빼요">선택 삭제</button><button type="button" class="stop" title="받는 중인 다운로드를 모두 중지하고 서버의 받던 파일을 지워요">다운로드 중지</button><button type="button" class="pri">다운로드</button></span></div></div>`;
      el.querySelector('.x').addEventListener('click', closeDlPanel);
      el.querySelector('.cfg').addEventListener('click', () => send({ type: 'pl:openOptions' }));
      el.querySelector('.lst').addEventListener('click', () => send({ type: 'pl:openSidePanel' })); // 보기만 하므로 받는 중에도 쓸 수 있다
      el.querySelector('.add').addEventListener('click', addToList);
      el.querySelector('.pri').addEventListener('click', startDl);
      el.querySelector('.del').addEventListener('click', deleteChecked);
      el.querySelector('.stop').addEventListener('click', stopAll);
      el.addEventListener('change', dlRefresh);
      el.addEventListener('mousedown', (e) => e.stopPropagation(), true); // 창 안에서 드래그가 시작되지 않게
      el.addEventListener('contextmenu', (e) => e.stopPropagation(), true);
      toastWrap.parentNode.appendChild(el);
      dlp = { el, items: new Map(), timer: 0, tone, toasted: new Set(), sending: false, stopping: false, adding: false, note: null };
      // 목록에 있으면 외곽선도 있어야 한다: 화면이 바뀌거나(유튜브의 페이지 전환) 카드가 뒤늦게 그려져 외곽선이 없는 영상을 다시 표시한다
      dlp.markTimer = setInterval(() => {
        if (!dlp) return;
        const missing = [...dlp.items.keys()].filter((k) => { const m = marks.get(k); return !m || !m.groups.has('dl') || marksHref !== location.href; });
        if (missing.length) markUrls(new Set(missing), dlp.tone || '#C83F55', 'dl');
      }, 1500);
    }
    const list = dlp.el.querySelector('.dlp-list');
    for (const l of links) {
      const k = keyOf(l.url);
      if (dlp.items.has(k)) continue;
      const row = dlRow(l); list.appendChild(row);
      dlp.items.set(k, { link: l, row, taskId: '', batchId: '', status: '', progress: 0, added: false });
    }
    dlRefresh();
  }

  async function startDl() {
    if (!dlp || dlp.sending) return;
    // 체크한 것만 받는다. 체크는 그대로 둔다 (받는 동안 잠금)
    const picked = [...dlp.items.values()].filter((it) => !dlSent(it) && dlChecked(it));
    if (!picked.length) return;
    dlp.sending = true; dlRefresh();
    const r = await send({ type: 'pl:dlBatch', urls: picked.map((it) => it.link.url), referer: location.href });
    if (!dlp) return;
    dlp.sending = false;
    if (!r || !r.ok) {
      dlRefresh();
      toast({ tone: '#F04438', error: true, title: (r && r.message) || '다운로드를 시작하지 못했어요', sub: '설정 › 영상 다운로드에서 서버 주소를 확인하세요', actions: [{ label: '설정 열기', run: () => send({ type: 'pl:openOptions' }) }] });
      return;
    }
    for (const it of picked) it.batchId = r.batch.batch_id;
    dlApply(r.batch);
    clearTimeout(dlp.timer);
    dlp.timer = setTimeout(dlPoll, 1500);
  }

  // 서버가 돌려준 배치 상태를 행에 반영
  function dlApply(b) {
    if (!dlp || !b) return;
    for (const s of b.items || []) {
      const it = dlp.items.get(keyOf(s.url));
      if (!it) continue;
      it.taskId = s.task_id; it.batchId = b.batch_id; it.status = s.status; it.progress = s.progress || 0;
      dlPaint(it, s);
    }
    dlRefresh();   // 다 받은 파일의 전달은 백그라운드가 맡는다 (이 창이 닫혀도 전달됨)
    if (b.status === 'done' && !dlp.toasted.has(b.batch_id)) {
      dlp.toasted.add(b.batch_id);
      const c = b.counts || {};
      const bad = (c.error || 0), stopped = (c.cancelled || 0);
      const title = bad ? `다운로드 끝 · 성공 ${c.completed || 0}개, 실패 ${bad}개` : stopped ? `다운로드 중지 · 성공 ${c.completed || 0}개, 중지 ${stopped}개` : `영상 ${c.completed || 0}개를 다운로드했어요`;
      const dl = settings.dl || {};
      toast({ tone: bad ? '#F04438' : dlp.tone, error: !!bad, title, sub: dl.saveDir || (dl.fetch === 'off' ? '서버 폴더' : '다운로드 폴더 › PowerLink 에 저장') });
    }
  }

  async function dlPoll() {
    if (!dlp) return;
    const ids = [...new Set([...dlp.items.values()].filter(dlRunning).map((it) => it.batchId).filter(Boolean))];
    for (const id of ids) {
      const r = await send({ type: 'pl:dlStatus', id });
      if (!dlp) return;
      if (r && r.ok) dlApply(r.batch);
    }
    if ([...dlp.items.values()].some(dlRunning)) dlp.timer = setTimeout(dlPoll, 2000);
  }

  // 배치별로 묶어 서버에 중지를 요청한다
  async function dlCancel(items) {
    const by = new Map();
    for (const it of items) { if (!by.has(it.batchId)) by.set(it.batchId, []); by.get(it.batchId).push(it.taskId); }
    for (const [id, taskIds] of by) {
      const r = await send({ type: 'pl:dlCancel', id, taskIds });
      if (!dlp) return;
      if (r && r.ok) dlApply(r.batch);
      else toast({ tone: '#F04438', error: true, title: (r && r.message) || '중지하지 못했어요' });
    }
  }

  async function stopAll() {
    if (!dlp || dlp.stopping) return;
    const running = [...dlp.items.values()].filter(dlRunning);
    if (!running.length) return;
    dlp.stopping = true; dlRefresh();
    await dlCancel(running);
    if (dlp) { dlp.stopping = false; dlRefresh(); }
  }

  // 받는 중에는 잠겨 있어 호출되지 않는다. 받기 전이나 끝난 뒤에 체크한 항목을 목록에서 뺀다
  // 체크한 영상을 수집 링크 목록(사이드바)에 저장한다. 드래그만으로는 저장하지 않는다
  async function addToList() {
    if (!dlp || dlp.adding) return;
    const picked = [...dlp.items.values()].filter((it) => dlChecked(it) && !it.added);
    if (!picked.length) return;
    dlp.adding = true; dlRefresh();
    const r = await send({ type: 'pl:grab', action: 'save', shape: 'box', mod: 'none', links: picked.map((it) => it.link), page: { url: location.href, title: document.title } });
    if (!dlp) return;
    dlp.adding = false;
    const say = (text) => { dlp.note = { text, until: Date.now() + 2500 }; setTimeout(() => dlp && dlRefresh(), 2600); };
    if (!r || !r.ok) { say((r && r.message) || '목록에 추가하지 못했어요'); dlRefresh(); return; }
    for (const it of picked) it.added = true;
    markUrls(new Set(picked.map((it) => keyOf(it.link.url))), LIST_TONE, 'list');   // 이제 사이드바 목록에도 있다
    say(`${picked.length}개 추가했어요`);   // 짧게: 길면 버튼 묶음이 아래 줄로 밀려 창이 출렁인다
    dlRefresh();
  }

  function deleteChecked() {
    if (!dlp || [...dlp.items.values()].some(dlRunning)) return;
    dlDrop(new Set([...dlp.items.entries()].filter(([, it]) => dlChecked(it)).map(([k]) => k)));
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
