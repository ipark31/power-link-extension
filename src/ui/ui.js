// Power Link — shared UI helpers for extension pages (ES module)
// Icons are inline stroke SVG paths so they inherit currentColor and the .pl-i sizing classes.

const P = {
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  window: '<path d="M3 5h18v14H3zM3 9h18M7 7h.01"/>',
  mouse: '<path d="M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6ZM12 3v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>',
  detail: '<path d="M4 5h16v6H4zM4 15h16M4 19h10"/>',
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  memo: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 9h8M8 13h5"/>',
  external: '<path d="M14 4h6v6M20 4 10 14M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  image: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m3 15 5-5 4 4 3-3 6 6M12 21v-4M9.5 19.5 12 22l2.5-2.5"/>',
  sparkle: '<path d="M10 3.5 11.6 8 16 9.5 11.6 11 10 15.5 8.4 11 4 9.5 8.4 8Z"/><path d="M18 13.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  chart: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  text: '<path d="M4 7h16M4 12h10M4 17h7"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  play: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9.5 5 2.5-5 2.5v-5Z"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/>',
  lasso: '<path d="M8 19c-3-1-5-3.5-5-7 0-4.5 4-8 9-8s9 3 9 6.5-4 6.5-9 6.5c-1.5 0-3-.3-4-1"/>',
  rules: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6"/>',
  lines: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
};

export const icon = (name, cls = '') => `<svg class="pl-i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

export const version = () => chrome.runtime.getManifest().version;

export const send = (msg) => new Promise((resolve) => {
  chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? { ok: false, message: chrome.runtime.lastError.message } : r || { ok: false }));
});

let toastWrap = null;
export function toast(message, tone = 'success') {
  if (!message) return;
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.style.cssText = 'position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(toastWrap);
  }
  const el = document.createElement('div');
  const color = tone === 'error' ? '#F97066' : tone === 'warning' ? '#FDB022' : '#32D583';
  el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:9px;background:#101828;color:#fff;font:500 12px var(--pl-font);box-shadow:0 12px 28px -8px rgba(16,24,40,.45);animation:pl-in .2s var(--pl-ease);max-width:340px;';
  el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span><span></span>`;
  el.lastChild.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; setTimeout(() => el.remove(), 220); }, 2600);
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
