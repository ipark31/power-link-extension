// Power Link — page loader (classic content script, every page).
// Keeps each tab light: the drag engine (src/core/content.js + classify.js, ~45KB) is injected by the
// background only when the user is about to use it — a rule's modifier key goes down, a mouse
// button matching a rule is pressed, or (when a rule needs no modifier key) the pointer first moves over the page. A press made before the engine arrives is handed over through
// globalThis.__PL_PRESS (content scripts of one extension share this isolated world).
(() => {
  if (globalThis.__PL_LOADER__) return;
  globalThis.__PL_LOADER__ = true;

  let rules = [
    { enabled: true, mod: 'ctrl', button: 'right' }, { enabled: true, mod: 'shift', button: 'right' }, { enabled: true, mod: 'alt', button: 'right' },
    { enabled: true, mod: 'none', button: 'right' }
  ];
  try {
    chrome.storage.sync.get('pl_settings', (r) => { if (!chrome.runtime.lastError && r && r.pl_settings && Array.isArray(r.pl_settings.rules)) rules = r.pl_settings.rules; });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && ch.pl_settings && ch.pl_settings.newValue && Array.isArray(ch.pl_settings.newValue.rules)) rules = ch.pl_settings.newValue.rules; });
  } catch (e) { /* extension context invalidated */ }

  const KEY_MOD = { Control: 'ctrl', Meta: 'ctrl', Shift: 'shift', Alt: 'alt' };
  const modOf = (e) => (e.ctrlKey || e.metaKey ? 'ctrl' : e.shiftKey ? 'shift' : e.altKey ? 'alt' : 'none');
  const active = () => rules.filter((r) => r.enabled !== false);
  let requested = false;
  function load() {
    if (requested || globalThis.__PL_ENGINE__) return;
    requested = true;
    try { chrome.runtime.sendMessage({ type: 'pl:loadEngine' }, () => { if (chrome.runtime.lastError) requested = false; }); } catch (e) { requested = false; }
  }
  // 16:9 버튼으로 쇼츠를 롱폼 화면으로 다시 연 직후: 넘겨받은 다운로드 창을 바로 띄우도록 엔진을 지금 불러온다
  try { if (sessionStorage.getItem('pl_dlp_carry')) load(); } catch (e) { /* storage blocked */ }
  // warm up while the modifier is held, before the mouse goes down
  addEventListener('keydown', (e) => { const m = KEY_MOD[e.key]; if (m && active().some((r) => r.mod === m)) load(); }, true);
  // A rule without a modifier key gives no warning before the press: the engine would be requested at mousedown and could
  // arrive after a quick first drag has already ended (that drag is lost and the page's own context menu shows instead).
  // When such a rule is on, fetch the engine as soon as the pointer first moves over the page.
  const warm = () => { removeEventListener('pointermove', warm, true); if (active().some((r) => r.mod === 'none')) load(); };
  addEventListener('pointermove', warm, true);
  addEventListener('mousedown', (e) => {
    if (globalThis.__PL_ENGINE__) return; // the engine handles it
    const button = e.button === 2 ? 'right' : e.button === 0 ? 'left' : null;
    const mod = modOf(e);
    if (!button || (mod === 'none' && button === 'left')) return;
    const rule = active().find((r) => r.button === button && r.mod === mod);
    if (!rule) return;
    globalThis.__PL_PRESS = { rule, cx: e.clientX, cy: e.clientY, t: Date.now() };
    if (button === 'left') e.preventDefault();
    load();
  }, true);
  addEventListener('mouseup', () => { if (!globalThis.__PL_ENGINE__) globalThis.__PL_PRESS = null; }, true);
})();
