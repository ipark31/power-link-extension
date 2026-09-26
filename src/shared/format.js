// Power Link — output formats: clipboard text/html, Excel export, categories, keywords (ES module)
import { PLATFORMS } from './constants.js';
import { esc, fmtDate, fmtDuration, numFmt } from './util.js';

const KIND = { post: '게시물', account: '채널·계정', other: '기타' };

// Columns for table/Excel output. field = settings field id (for 'detail' filtering), get = value getter.
const COLUMNS = [
  { h: '플랫폼', get: (it) => PLATFORMS[it.platform]?.name || '' },
  { h: '종류', get: (it) => KIND[it.kind] || '' },
  { h: '제목', field: 'title', get: (it) => it.title || '' },
  { h: 'URL', field: 'url', get: (it) => it.url },
  { h: '카테고리', field: 'category', get: (it) => it.category || '' },
  { h: '조회수', field: 'views', detail: true, get: (it) => it.detail?.views ?? '' },
  { h: '좋아요', field: 'likes', detail: true, get: (it) => it.detail?.likes ?? '' },
  { h: '댓글수', field: 'comments', detail: true, get: (it) => it.detail?.comments ?? '' },
  { h: '업로드 일자', field: 'uploadedAt', detail: true, get: (it) => fmtDate(it.detail?.uploadedAt) },
  { h: '영상 길이', field: 'duration', detail: true, get: (it) => (it.detail?.duration ? fmtDuration(it.detail.duration) : '') },
  { h: '쇼츠', field: 'isShort', detail: true, get: (it) => (it.detail?.isShort == null ? '' : it.detail.isShort ? 'Y' : 'N') },
  { h: '태그', field: 'tags', detail: true, get: (it) => (it.detail?.tags || []).join(', ') },
  { h: '떡상 점수', field: 'outlier', detail: true, get: (it) => (it.outlier ? '×' + it.outlier : '') },
  { h: '채널·계정', field: 'name', detail: true, get: (it) => it.account?.name || '' },
  { h: '채널·계정 링크', field: 'accountUrl', detail: true, get: (it) => it.account?.accountUrl || '' },
  { h: '구독자·팔로워', field: 'followers', detail: true, get: (it) => it.account?.followers ?? '' },
  { h: '개설일', field: 'created', detail: true, get: (it) => fmtDate(it.account?.created) },
  { h: '전체 영상·게시물', field: 'total', detail: true, get: (it) => it.account?.total ?? '' },
  { h: '롱폼 수', field: 'longCount', detail: true, get: (it) => it.account?.longCount ?? '' },
  { h: '숏폼 수', field: 'shortCount', detail: true, get: (it) => it.account?.shortCount ?? '' },
  { h: '최근 30일', field: 'recent30', detail: true, get: (it) => it.account?.recent30 ?? '' },
  { h: '평균 조회수', field: 'avgViews', detail: true, get: (it) => it.account?.avgViews ?? '' },
  { h: '채널력', field: 'power', detail: true, get: (it) => it.account?.power ?? '' },
  { h: '메모', memo: true, get: (it) => it.memo || '' },
  { h: '수집일', get: (it) => fmtDate(it.createdAt || new Date().toISOString()) }
];

export function columnsFor(items, settings, mode) {
  const plats = [...new Set(items.map((i) => i.platform))];
  return COLUMNS.filter((c) => {
    if (c.memo) return settings.memoExport && items.some((i) => i.memo);
    if (c.detail && mode !== 'detail') return false;
    if (mode === 'link' && c.field && c.field !== 'url') return false;
    if (c.field && c.detail) {
      // drop a column when every platform present has it switched off
      return plats.some((p) => !settings.fieldsOff?.[p + ':' + c.field]);
    }
    return true;
  });
}

const cardHtml = (it) => `
<div style="display:flex;align-items:center;border:1px solid #e0e0e0;border-radius:16px;padding:12px;margin-bottom:16px;font-family:sans-serif;max-width:600px;background:#fff;">
  ${it.thumb ? `<div style="flex-shrink:0;width:100px;height:100px;margin-right:16px;overflow:hidden;border-radius:12px;background:#f8f9fa;"><img src="${esc(it.thumb)}" style="width:100%;height:100%;object-fit:cover;display:block;"></div>` : ''}
  <div style="flex-grow:1;min-width:0;">
    <div style="margin:0 0 6px;font-size:17px;font-weight:700;line-height:1.4;"><a href="${esc(it.url)}" style="color:#0066cc;text-decoration:none;">${esc(it.title || it.url)}</a></div>
    <div style="font-size:13px;color:#5f6368;margin-bottom:6px;">🔗 ${esc(it.url)}</div>
    <div style="font-size:13px;color:#70757a;">${esc(PLATFORMS[it.platform]?.name || '')}${it.category ? ' · ' + esc(it.category) : ''}${it.memo ? ' · 메모: ' + esc(it.memo) : ''}</div>
  </div>
</div>`;

// Build clipboard payload for the chosen collect mode + copy format.
export function buildCopy(items, settings, mode = settings.collect) {
  const fmt = settings.copyFormat || 'text';
  const memoOn = settings.memoExport;
  if (fmt === 'table' || mode === 'detail') {
    const cols = columnsFor(items, settings, mode);
    const rows = items.map((it) => cols.map((c) => String(c.get(it)).replace(/[\t\n\r]+/g, ' ')));
    const text = [cols.map((c) => c.h).join('\t')].concat(rows.map((r) => r.join('\t'))).join('\n');
    const html = `<table border="1" cellspacing="0" cellpadding="4"><thead><tr>${cols.map((c) => `<th>${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return { text, html };
  }
  if (fmt === 'card') {
    const text = items.map((it) => (mode === 'link' ? it.url : `${it.title || ''}\n${it.url}`)).join('\n\n');
    return { text, html: `<div>${items.map(cardHtml).join('')}</div>` };
  }
  if (mode === 'link') {
    const text = items.map((it) => it.url + (memoOn && it.memo ? `  # ${it.memo}` : '')).join('\n');
    return { text, html: items.map((it) => `<a href="${esc(it.url)}">${esc(it.url)}</a>`).join('<br>') };
  }
  const text = items.map((it) => `${it.title || it.url}\n${it.url}${memoOn && it.memo ? '\n메모: ' + it.memo : ''}`).join('\n\n');
  const html = `<ul>${items.map((it) => `<li><a href="${esc(it.url)}">${esc(it.title || it.url)}</a>${memoOn && it.memo ? ` — ${esc(it.memo)}` : ''}</li>`).join('')}</ul>`;
  return { text, html };
}

export function buildXls(items, settings) {
  const cols = columnsFor(items, settings, 'detail').filter((c) => !c.detail || items.some((i) => i.detail || i.account));
  const head = cols.map((c) => `<th>${esc(c.h)}</th>`).join('');
  const body = items.map((it) => `<tr>${cols.map((c) => `<td>${esc(c.get(it))}</td>`).join('')}</tr>`).join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>th{background:#2F6BFF;color:#fff;font-weight:bold;border:1px solid #D0D5DD;padding:6px}td{border:1px solid #E4E7EC;padding:6px;mso-number-format:"\\@"}</style></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

// Fill missing categories with the user's keyword rules (title + tags).
export function applyCategoryRules(items, settings) {
  const rules = (settings.catRules || []).map((r) => ({ c: r.c, keys: String(r.k || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) }));
  return items.map((it) => {
    if (it.category) return it;
    const hay = ((it.title || '') + ' ' + (it.detail?.tags || []).join(' ')).toLowerCase();
    const hit = rules.find((r) => r.keys.some((k) => hay.includes(k)));
    return hit ? Object.assign({}, it, { category: hit.c }) : it;
  });
}

const STOP = new Set(['그리고', '하는', '있는', '없는', '이런', '저런', '그냥', '정말', '진짜', '어떻게', '위한', '대한', '하면', '해서', '에서', '으로', '입니다', '합니다', '했다', 'the', 'and', 'for', 'with', 'you', 'this', 'that', 'youtube', '유튜브', 'shorts']);

export function keywordStats(items, source = 'title', limit = 20) {
  const counts = new Map();
  const add = (w) => {
    const k = w.trim();
    if (k.length < 2 || STOP.has(k.toLowerCase()) || /^\d+$/.test(k)) return;
    counts.set(k, (counts.get(k) || 0) + 1);
  };
  for (const it of items) {
    if (source === 'tags') {
      (it.detail?.tags || []).forEach(add);
      ((it.title || '').match(/#[^\s#]+/g) || []).forEach((t) => add(t.slice(1)));
    } else {
      const words = (it.title || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/);
      new Set(words.map((w) => w.replace(/(은|는|이|가|을|를|의|에|로|와|과|도|만)$/u, ''))).forEach(add);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word, n]) => ({ word, n }));
}

export { numFmt };
