// Power Link — shared UI helpers for extension pages (ES module)
// Icons are inline stroke SVG paths so they inherit currentColor and the .pl-i sizing classes.

const P = {
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  collect: '<path d="M4 6h16M4 12h10M4 18h7M18 14v7M14.5 17.5h7"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>',
  detail: '<rect x="4" y="5" width="16" height="6" rx="1.5"/><path d="M4 15h16M4 19h10"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  memo: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 9h8M8 13h5"/>',
  memoSm: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
  external: '<path d="M14 4h6v6M20 4 10 14M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  image: '<path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 15l5-5 4 4 3-3 6 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  key: '<path d="M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM11 12l9-9M17 6l3 3M15 8l2 2"/>',
  play: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor"/>',
  mouse: '<path d="M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6ZM12 3v6"/>',
  fields: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12ZM7.5 7.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3ZM7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  more: '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>'
};

export const icon = (name, cls = '') => `<svg class="pl-i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

// Power Link mark (same artwork as icons/icon.svg)
export const logo = (size = 22, scale = 1.2) => `<svg class="pl-logo" width="${size}" height="${size}" viewBox="0 0 128 128" role="img" aria-label="Power Link 로고"><rect width="128" height="128" rx="30" fill="#111317"/><rect x="1.5" y="1.5" width="125" height="125" rx="28.5" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="3"/><g transform="translate(64 64) scale(${scale}) translate(-64 -64)"><g fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><path d="M28 48V34a6 6 0 0 1 6-6h14"/><path d="M80 28h14a6 6 0 0 1 6 6v14"/><path d="M28 80v14a6 6 0 0 0 6 6h14"/></g><path d="M62 60l38 14-16 5 11 17-8 5-11-17-11 12z" fill="#4CFF3F" stroke="#4CFF3F" stroke-width="4" stroke-linejoin="round"/></g></svg>`;

// Red YouTube mark placed in front of YouTube titles (one of the three allowed colors)
export const ytLogo = (lg) => `<svg class="pl-yt${lg ? ' pl-yt--lg' : ''}" viewBox="0 0 28 20" role="img" aria-label="유튜브"><rect width="28" height="20" rx="5" fill="#FF0000"/><path d="M11 6l7.5 4-7.5 4z" fill="#FFFFFF"/></svg>`;

// Channel avatar: API thumbnail, or the first letter on a muted color picked from the name
const AV = ['#8B6F4E', '#4E6A8B', '#5E7D62', '#7A5C86', '#8B4E55', '#4E7F86'];
const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function avatar(name, url, cls = '') {
  const n = String(name || '').trim() || '?';
  if (url && /^https?:/.test(url)) return `<img class="pl-av pl-av--img ${cls}" src="${escAttr(url)}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
  const bg = AV[[...n].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AV.length];
  return `<span class="pl-av ${cls}" aria-hidden="true" style="background-color:${bg}">${escAttr([...n][0].toUpperCase())}</span>`;
}

export const version = () => chrome.runtime.getManifest().version;

export const send = (msg) => new Promise((resolve) => {
  chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? { ok: false, message: chrome.runtime.lastError.message } : r || { ok: false }));
});

// Dark pill toast. Green / red only on the small status dot.
let toastWrap = null;
export function toast(message, tone = 'success') {
  if (!message) return;
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.style.cssText = 'position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
    document.body.appendChild(toastWrap);
  }
  const el = document.createElement('div');
  const color = tone === 'error' ? '#EF4444' : tone === 'warning' ? '#AAAAAA' : 'var(--pl-online)';
  el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:18px;background:var(--pl-bar);border:1px solid var(--pl-bar-border);color:var(--pl-bar-text);font:500 12px/1.4 var(--pl-font);box-shadow:var(--pl-shadow-bar);animation:pl-in .2s ease;max-width:340px;';
  el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span><span></span>`;
  el.lastChild.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 220); }, 2600);
}

// Shared confirmation modal (replaces the browser's confirm()). Resolves true on OK.
// Enter = OK, Esc / backdrop / cancel = false. Buttons carry data-act="confirmYes" / "confirmNo".
export function confirmModal({ title = '확인', message = '', ok = '확인', cancel = '취소' } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'pl-app pl-sheet';
    wrap.innerHTML = `<div class="pl-sheet__card" role="alertdialog" aria-modal="true" aria-labelledby="plSheetTitle" aria-describedby="plSheetDesc">
      <div class="pl-sheet__title" id="plSheetTitle"></div>
      <p class="pl-sheet__desc" id="plSheetDesc"></p>
      <div class="pl-sheet__acts">
        <button type="button" class="pl-btn" data-act="confirmNo"></button>
        <button type="button" class="pl-btn pl-btn--ink" data-act="confirmYes"></button>
      </div>
    </div>`;
    wrap.querySelector('.pl-sheet__title').textContent = title;
    const desc = wrap.querySelector('.pl-sheet__desc');
    String(message).split('\n').forEach((line, i) => { if (i) desc.appendChild(document.createElement('br')); desc.appendChild(document.createTextNode(line)); });
    wrap.querySelector('[data-act="confirmNo"]').textContent = cancel;
    wrap.querySelector('[data-act="confirmYes"]').textContent = ok;
    const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter' && e.target.dataset.act !== 'confirmNo') { e.preventDefault(); e.stopPropagation(); done(true); }
      else if (e.key === 'Tab') { // keep focus on the two buttons
        const b = [...wrap.querySelectorAll('button')]; const i = b.indexOf(document.activeElement);
        e.preventDefault(); b[(i + (e.shiftKey ? b.length - 1 : 1)) % b.length].focus();
      }
    };
    wrap.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (t) done(t.dataset.act === 'confirmYes');
      else if (!e.target.closest('.pl-sheet__card')) done(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-act="confirmYes"]').focus();
  });
}

// Memo editor modal. Resolves { action: 'save', value } | { action: 'delete' } | { action: 'cancel' }.
// Enter = 저장 (Shift+Enter = 줄바꿈), Esc / backdrop = 취소. 삭제 appears only when a memo exists.
export function memoModal({ title = '메모', subject = '', value = '', max = 500 } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const had = !!String(value).trim();
    const wrap = document.createElement('div');
    wrap.className = 'pl-app pl-sheet';
    wrap.innerHTML = `<div class="pl-sheet__card pl-sheet__card--wide" role="dialog" aria-modal="true" aria-labelledby="plMemoTitle">
      <div class="pl-sheet__title" id="plMemoTitle"></div>
      <div class="pl-sheet__subject"></div>
      <textarea class="pl-memo-area" id="plMemoText" rows="5" maxlength="${max}" aria-label="메모 내용" placeholder="메모를 입력하세요"></textarea>
      <div class="pl-memo-meta"><span>Enter 저장 · Shift+Enter 줄바꿈</span><span class="pl-memo-count"></span></div>
      <div class="pl-sheet__acts">
        ${had ? '<button type="button" class="pl-btn pl-btn--outline" data-act="memoDelete" style="margin-right:auto">삭제</button>' : ''}
        <button type="button" class="pl-btn" data-act="memoCancel">취소</button>
        <button type="button" class="pl-btn pl-btn--ink" data-act="memoSave">저장</button>
      </div>
    </div>`;
    wrap.querySelector('.pl-sheet__title').textContent = had ? '메모 수정' : title === '메모' ? '메모 추가' : title;
    const subj = wrap.querySelector('.pl-sheet__subject');
    if (subject) subj.textContent = subject; else subj.remove();
    const ta = wrap.querySelector('textarea');
    const count = wrap.querySelector('.pl-memo-count');
    ta.value = value || '';
    const upd = () => { count.textContent = `${ta.value.length} / ${max}`; };
    upd();
    ta.addEventListener('input', upd);
    const done = (r) => { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (prev && prev.focus) prev.focus(); resolve(r); };
    const save = () => done({ action: 'save', value: ta.value.trim() });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done({ action: 'cancel' }); }
      else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target === ta) { e.preventDefault(); e.stopPropagation(); save(); }
    };
    wrap.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (t) { const a = t.dataset.act; if (a === 'memoSave') save(); else if (a === 'memoDelete') done({ action: 'delete' }); else done({ action: 'cancel' }); }
      else if (!e.target.closest('.pl-sheet__card')) done({ action: 'cancel' });
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });
}

// Write text/plain (+ optional text/html) from a focused extension page.
export async function writeClipboard(text, html) {
  try {
    if (html && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
