// Power Link — small shared helpers (ES module)

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// 1234 → "1,234", 12000 → "1.2만", 310000000 → "3.1억"
export function compactKo(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '';
  const v = Number(n);
  const abs = Math.abs(v);
  const trim = (x) => (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ''));
  if (abs >= 1e8) return trim(v / 1e8) + '억';
  if (abs >= 1e4) return trim(v / 1e4) + '만';
  if (abs >= 1e3) return trim(v / 1e3) + '천';
  return v.toLocaleString('ko-KR');
}

export const numFmt = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('ko-KR'));

export function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
  if (s < 86400 * 30) return Math.floor(s / 86400 / 7) + '주 전';
  if (s < 86400 * 365) return Math.floor(s / 86400 / 30) + '개월 전';
  return Math.floor(s / 86400 / 365) + '년 전';
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDuration(sec) {
  if (!sec && sec !== 0) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// Stable 0..1 number from a string (used for placeholder scores so they don't jump around).
export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export const cleanTitle = (t) => String(t || '').replace(/^\(\d+\)\s*/, '').replace(/\s+/g, ' ').trim();

export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
