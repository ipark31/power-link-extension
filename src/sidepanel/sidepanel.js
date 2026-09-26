// Power Link — side panel (collected links, keywords, watchlist)
import { getSettings, setSettings, getLinks, updateLink, removeLinks, getWatch, setWatch } from '../shared/storage.js';
import { PLATFORMS, STORAGE } from '../shared/constants.js';
import { esc, compactKo, timeAgo, fmtDate, fmtDuration } from '../shared/util.js';
import { buildXls, keywordStats } from '../shared/format.js';
import { icon, version, send, toast, writeClipboard } from '../ui/ui.js';

const app = document.getElementById('app');
const S = {
  tab: 'links', view: 'list', platform: 'all', kind: 'all', cat: 'all', q: '', sort: 'recent', kwSource: 'title',
  sel: new Set(), open: new Set(), allOpen: false, editing: null, draft: ''
};
let links = [], watch = [], settings = null, watchCheckedAt = null;

const PLAT_FILTERS = [['all', '전체'], ['yt', '유튜브'], ['tt', '틱톡'], ['ig', '인스타'], ['x', 'X'], ['blog', '블로그'], ['web', '웹']];
const SORTS = [['recent', '최근 수집순'], ['outlier', '떡상 점수순'], ['views', '조회수순'], ['title', '제목순']];

// ------------------------------------------------------------------ derived data
const P = (it) => PLATFORMS[it.platform] || PLATFORMS.web;
function metricsOf(it) {
  const d = it.detail || {};
  const out = [];
  if (d.views != null) out.push(['조회', compactKo(d.views)]);
  if (d.likes != null) out.push([it.platform === 'blog' ? '공감' : '좋아요', compactKo(d.likes)]);
  if (d.comments != null) out.push(['댓글', compactKo(d.comments)]);
  return out;
}
function keyMetric(it) {
  if (it.kind === 'account') return it.account?.followers != null ? [P(it).follower, compactKo(it.account.followers)] : ['', ''];
  const m = metricsOf(it)[0];
  return m || ['', ''];
}
function accountDetails(it) {
  const a = it.account;
  if (!a) return [];
  const rows = [
    ['개설일', fmtDate(a.created)], [P(it).follower || '팔로워', a.followers != null ? compactKo(a.followers) : '비공개'],
    ['전체 영상', a.total != null ? compactKo(a.total) : ''], ['롱폼 / 쇼츠', a.longCount != null || a.shortCount != null ? `${a.longCount ?? '-'} / ${a.shortCount ?? '-'}` : ''],
    ['최근 30일', a.recent30 != null ? a.recent30 + '개' : ''], ['평균 조회', a.avgViews != null ? compactKo(a.avgViews) : '']
  ];
  return rows.filter((r) => r[1] !== '');
}
const powerLevel = (p) => (p >= 8 ? 'high' : p >= 5 ? 'mid' : 'low');

function filtered() {
  const q = S.q.trim().toLowerCase();
  let list = links.filter((l) =>
    (S.platform === 'all' || l.platform === S.platform) &&
    (S.kind === 'all' || l.kind === S.kind) &&
    (S.cat === 'all' || (l.category || '') === S.cat) &&
    (!q || [l.title, l.url, l.account?.name, settings.memoSearch !== false ? l.memo : '', l.category].some((v) => (v || '').toLowerCase().includes(q))));
  const num = (v) => (v == null ? -1 : v);
  if (S.sort === 'outlier') list = [...list].sort((a, b) => num(b.outlier) - num(a.outlier));
  else if (S.sort === 'views') list = [...list].sort((a, b) => num(b.detail?.views) - num(a.detail?.views));
  else if (S.sort === 'title') list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return list;
}

// ------------------------------------------------------------------ render pieces
const memoIcon = icon('memo', 'pl-i--sm');
function memoEditor(it, compact) {
  return `<div class="pl-memo-editor">
    <input type="text" class="pl-input pl-input--sm pl-input--focus" data-memo-input="${it.id}" value="${esc(S.draft)}" placeholder="메모를 입력하고 Enter" aria-label="메모">
    ${compact ? '' : `<button type="button" class="pl-btn pl-btn--primary pl-btn--sm" data-act="memoSave" data-id="${it.id}">저장</button><button type="button" class="pl-btn pl-btn--soft pl-btn--sm" data-act="memoCancel">취소</button>`}
  </div>`;
}
const thumbStyle = (it) => (it.thumb ? `background:var(--pl-gray-150) url('${esc(it.thumb)}') center/cover no-repeat;` : 'background:var(--pl-gray-150);');
const avatarStyle = (url) => (url ? `background:var(--pl-gray-300) url('${esc(url)}') center/cover no-repeat;` : '');

function rowList(it) {
  const sel = S.sel.has(it.id), editing = S.editing === it.id;
  const [kl, kv] = keyMetric(it);
  const isAcc = it.kind === 'account';
  const mini = isAcc ? 'pl-thumb--mini-round' : it.detail?.isShort || it.ids?.isShort ? 'pl-thumb--mini-tall' : 'pl-thumb--mini';
  const sub = isAcc ? it.ids?.handle || it.domain : (it.account?.name || it.domain) + ' · ' + timeAgo(it.detail?.uploadedAt || it.createdAt);
  return `<div class="pl-row-item ${sel ? 'is-selected' : ''}">
    <div class="pl-row-item__line">
      <input type="checkbox" class="pl-checkbox" data-act="sel" data-id="${it.id}" ${sel ? 'checked' : ''} aria-label="선택">
      <span class="pl-thumb ${mini}" style="${thumbStyle(it)}"></span>
      <div class="pl-u-grow" style="display:flex;flex-direction:column;gap:1px;">
        <a class="pl-item__title pl-u-truncate" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a>
        <span class="pl-meta pl-u-muted" style="font-size:var(--pl-fs-xs);">
          <span class="pl-dot pl-dot--sm" data-tone="${it.platform}"></span>${esc(P(it).short)}${it.category ? ` · <span class="pl-category">${esc(it.category)}</span>` : ''} ·
          ${it.memo && !editing ? `<span class="pl-memo-inline pl-u-truncate">메모: ${esc(it.memo)}</span>` : `<span class="pl-u-truncate">${esc(sub)}</span>`}
        </span>
      </div>
      ${kv ? `<span class="pl-row-item__key"><b>${esc(kv)}</b><small>${esc(kl)}</small></span>` : ''}
      ${it.outlier ? `<span class="pl-outlier pl-outlier--inline" data-level="${it.outlier >= 5 ? 'hot' : 'warm'}">×${it.outlier}</span>` : ''}
      <button type="button" class="pl-icon-btn pl-icon-btn--sm pl-icon-btn--memo ${it.memo ? 'is-on' : ''}" data-act="memo" data-id="${it.id}" aria-label="메모" data-tip="메모" data-tip-align="end">${memoIcon}</button>
    </div>
    ${editing ? `<div class="pl-row-item__edit">${memoEditor(it)}</div>` : ''}
  </div>`;
}

function rowDetail(it) {
  const sel = S.sel.has(it.id), editing = S.editing === it.id, open = S.allOpen || S.open.has(it.id);
  const a = it.account;
  const isAcc = it.kind === 'account';
  const tall = it.detail?.isShort || it.ids?.isShort;
  const tag = it.detail?.isShort ? (it.platform === 'yt' ? '쇼츠' : '') : it.ids?.postType === '릴스' ? '릴스' : '';
  const details = accountDetails(it);
  const head = isAcc ? `
    <div style="display:flex;align-items:center;gap:10px;">
      <span class="pl-avatar pl-avatar--xl" style="${avatarStyle(it.thumb)}"></span>
      <div style="min-width:0;display:flex;flex-direction:column;gap:2px;">
        <span class="pl-meta"><a class="pl-u-strong pl-u-truncate" style="font-size:13px;" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a><span class="pl-platform"><span class="pl-dot pl-dot--sm" data-tone="${it.platform}"></span>${esc(P(it).short)}</span></span>
        <span class="pl-u-muted pl-u-truncate" style="font-size:11px;">${esc(a?.handle || it.ids?.handle || it.domain)}${a?.followers != null ? ` · ${P(it).follower} ${compactKo(a.followers)}` : ''}${it.category ? ` · <span class="pl-category">${esc(it.category)}</span>` : ''}</span>
      </div>
      <span class="pl-badge pl-u-push" data-tone="violet">${esc(P(it).account)}</span>
    </div>` : `
    <div style="display:flex;gap:10px;">
      <a class="pl-thumb ${tall ? 'pl-thumb--tall' : 'pl-thumb--wide'}" style="${thumbStyle(it)}" href="${esc(it.url)}" target="_blank" rel="noopener">${it.detail?.duration ? `<span class="pl-thumb__len">${fmtDuration(it.detail.duration)}</span>` : ''}</a>
      <div style="min-width:0;display:flex;flex-direction:column;gap:4px;">
        <span class="pl-meta">
          <span class="pl-platform"><span class="pl-dot pl-dot--sm" data-tone="${it.platform}"></span>${esc(P(it).short)}</span>
          ${tag ? `<span class="pl-badge pl-badge--sq" data-tone="orange">${tag}</span>` : ''}
          ${it.category ? `<span class="pl-badge pl-badge--sq" data-tone="violet">${esc(it.category)}</span>` : ''}
          <span>${esc(it.detail?.uploadedAt ? timeAgo(it.detail.uploadedAt) : '수집 ' + timeAgo(it.createdAt))}</span>
        </span>
        <a class="pl-item__title pl-u-clamp-2" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a>
        <div class="pl-metrics">${metricsOf(it).map(([k, v]) => `<span>${k} <b>${esc(v)}</b></span>`).join('') || `<span class="pl-u-faint">${esc(it.domain)}</span>`}</div>
      </div>
      ${it.outlier ? `<span class="pl-outlier pl-u-push" data-level="${it.outlier >= 5 ? 'hot' : 'warm'}" title="채널 평균 조회수 대비" style="align-self:flex-start;"><b class="pl-outlier__value">×${it.outlier}</b><span class="pl-outlier__label">떡상</span></span>` : ''}
    </div>`;
  const strip = a ? `
    <div class="pl-strip">
      <span class="pl-avatar pl-avatar--xs" style="${avatarStyle(a.avatar)}"></span>
      <span class="pl-strip__name pl-u-truncate">${esc(a.name || '')}</span>
      ${a.followers != null ? `<span class="pl-strip__sub">${P(it).follower} ${compactKo(a.followers)}</span>` : ''}
      ${a.power != null ? `<span class="pl-power pl-u-push" data-level="${powerLevel(a.power)}" title="채널력(베타): 현재 임의 점수"><span class="pl-power__label">채널력</span><b class="pl-power__value">${a.power}</b></span>` : '<span class="pl-u-push"></span>'}
      <button type="button" class="pl-icon-btn pl-icon-btn--xs ${open ? 'is-on' : ''}" data-act="expand" data-id="${it.id}" aria-label="채널 정보 펼치기" data-tip="채널 정보" data-tip-align="end">${icon('chevron', 'pl-i--sm pl-chevron')}</button>
    </div>` : `
    <div class="pl-strip">
      <span class="pl-strip__sub pl-u-grow">${it.platform === 'yt' ? '유튜브 정보 수집 전이에요' : '채널·계정 정보 없음'}</span>
      ${it.platform === 'yt' ? `<button type="button" class="pl-btn pl-btn--xs pl-btn--soft" data-act="enrichOne" data-id="${it.id}">${icon('chart', 'pl-i--xs')}정보 가져오기</button>` : ''}
      <button type="button" class="pl-icon-btn pl-icon-btn--xs ${open ? 'is-on' : ''}" data-act="expand" data-id="${it.id}" aria-label="펼치기" data-tip="펼치기" data-tip-align="end">${icon('chevron', 'pl-i--sm pl-chevron')}</button>
    </div>`;
  const memo = editing ? memoEditor(it)
    : it.memo ? `<button type="button" class="pl-memo" data-act="memo" data-id="${it.id}" title="메모 수정">${memoIcon}<span>${esc(it.memo)}</span></button>`
    : `<button type="button" class="pl-btn pl-btn--xs pl-btn--dashed" data-act="memo" data-id="${it.id}" style="align-self:flex-start;background:transparent;">${memoIcon}메모 추가</button>`;
  const cats = settings.categories || [];
  const openBody = open ? `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${details.length ? `<div class="pl-stats">${details.map(([k, v]) => `<div class="pl-stat"><span class="pl-stat__k">${k}</span><span class="pl-stat__v">${esc(v)}</span></div>`).join('')}</div>` : ''}
      <div class="pl-head" style="gap:6px;flex-wrap:wrap;">
        <select class="pl-select pl-select--inline" data-act="cat" data-id="${it.id}" aria-label="카테고리">
          <option value="">카테고리 없음</option>${cats.map((c) => `<option ${c === it.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          ${it.category && !cats.includes(it.category) ? `<option selected>${esc(it.category)}</option>` : ''}
        </select>
        ${a || isAcc ? `<button type="button" class="pl-btn pl-btn--sm" data-act="watchOne" data-id="${it.id}">${icon('eye', 'pl-i--sm')}워치리스트 추가</button>` : ''}
        ${a?.accountUrl ? `<a class="pl-btn pl-btn--sm pl-u-push" href="${esc(a.accountUrl)}" target="_blank" rel="noopener">${esc(P(it).openAccount)}${icon('external', 'pl-i--xs')}</a>` : ''}
      </div>
      <span class="pl-caption">${esc(it.url)}</span>
    </div>` : '';
  return `<div class="pl-item ${sel ? 'is-selected' : ''}">
    <input type="checkbox" class="pl-checkbox" data-act="sel" data-id="${it.id}" ${sel ? 'checked' : ''} aria-label="선택" style="margin-top:3px;">
    <div class="pl-item__body">${head}${strip}${memo}${openBody}</div>
  </div>`;
}

function tile(it) {
  const sel = S.sel.has(it.id), editing = S.editing === it.id;
  const isAcc = it.kind === 'account';
  const [, kv] = keyMetric(it);
  return `<div class="pl-tile ${sel ? 'is-selected' : ''}">
    <div class="pl-thumb pl-thumb--tile" style="${isAcc ? 'background:var(--pl-surface-3);' : thumbStyle(it)}">
      ${isAcc ? `<span class="pl-avatar pl-avatar--2xl" style="${avatarStyle(it.thumb)}"></span>` : ''}
      <input type="checkbox" class="pl-checkbox pl-thumb__corner pl-thumb__corner--tl" data-act="sel" data-id="${it.id}" ${sel ? 'checked' : ''} aria-label="선택" style="width:16px;height:16px;">
      <span class="pl-platform pl-platform--float pl-thumb__corner pl-thumb__corner--tr"><span class="pl-dot pl-dot--sm" data-tone="${it.platform}"></span>${esc(P(it).short)}</span>
      ${it.outlier ? `<span class="pl-outlier pl-outlier--inline pl-thumb__corner pl-thumb__corner--bl" data-level="${it.outlier >= 5 ? 'hot' : 'warm'}">×${it.outlier} 떡상</span>` : ''}
      ${it.detail?.duration ? `<span class="pl-thumb__len" style="right:6px;bottom:6px;">${fmtDuration(it.detail.duration)}</span>` : ''}
    </div>
    <a class="pl-tile__title pl-u-clamp-2" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title || it.url)}</a>
    <div class="pl-head">
      <span class="pl-u-muted pl-u-truncate pl-u-grow" style="font-size:11px;">${esc(it.account?.name || it.domain)}${it.category ? ` · <span class="pl-category">${esc(it.category)}</span>` : ''}${kv ? ' · ' + esc(kv) : ''}</span>
      <button type="button" class="pl-icon-btn pl-icon-btn--xs pl-icon-btn--memo ${it.memo ? 'is-on' : ''}" data-act="memo" data-id="${it.id}" aria-label="메모" data-tip="메모" data-tip-align="end">${memoIcon}</button>
    </div>
    ${editing ? memoEditor(it, true) : it.memo ? `<button type="button" class="pl-memo pl-memo--compact" data-act="memo" data-id="${it.id}">${esc(it.memo)}</button>` : ''}
  </div>`;
}

function emptyState(title, desc) {
  return `<div class="pl-empty"><div class="pl-empty__icon">${icon('link', 'pl-i--lg')}</div><div class="pl-empty__title">${title}</div><div class="pl-caption">${desc}</div></div>`;
}

function renderLinks() {
  const list = filtered();
  const counts = { all: links.length };
  links.forEach((l) => { counts[l.platform] = (counts[l.platform] || 0) + 1; });
  const cats = [...new Set(links.map((l) => l.category).filter(Boolean))];
  const allSel = list.length > 0 && list.every((l) => S.sel.has(l.id));
  const body = !links.length
    ? emptyState('아직 수집한 링크가 없어요', 'Alt + 우클릭 드래그로 링크를 둘러 그리면 여기에 저장돼요. 팝업의 ‘목록에 저장’도 쓸 수 있어요.')
    : !list.length ? emptyState('조건에 맞는 링크가 없어요', '필터나 검색어를 바꿔 보세요.')
    : S.view === 'thumb' ? `<div class="pl-tiles">${list.map(tile).join('')}</div>`
    : S.view === 'detail' ? list.map(rowDetail).join('')
    : list.map(rowList).join('');
  return `
  <div class="pl-panel__filters">
    <label class="pl-input-group">${icon('search', 'pl-i--sm')}<input type="text" id="q" placeholder="제목, 채널·계정, 메모 검색" value="${esc(S.q)}"></label>
    <div style="display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;">
      ${PLAT_FILTERS.filter(([id]) => id === 'all' || counts[id]).map(([id, l]) => `<button type="button" class="pl-pill" style="flex:1 0 auto;" aria-pressed="${S.platform === id}" data-act="platform" data-val="${id}"><span class="pl-dot pl-dot--sm" data-tone="${id === 'all' ? 'none' : id}"></span>${l}<span class="pl-pill__count">${counts[id] || 0}</span></button>`).join('')}
    </div>
    <div class="pl-head">
      <div class="pl-seg pl-seg--sm pl-seg--inline">${[['all', '전체'], ['post', '게시물'], ['account', '채널·계정']].map(([id, l]) => `<button type="button" class="pl-seg__item" aria-pressed="${S.kind === id}" data-act="kind" data-val="${id}">${l}</button>`).join('')}</div>
      <select class="pl-select pl-select--sm" id="cat" aria-label="카테고리" style="max-width:112px;"><option value="all">카테고리 전체</option>${cats.map((c) => `<option ${S.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <span class="pl-u-grow"></span>
      ${S.view === 'detail' ? `<button type="button" class="pl-btn pl-btn--soft pl-btn--xs" data-act="toggleAll">${icon(S.allOpen ? 'chevronUp' : 'chevron', 'pl-i--xs')}${S.allOpen ? '모두 접기' : '모두 펼치기'}</button>` : ''}
    </div>
    <div class="pl-head pl-caption">
      <input type="checkbox" class="pl-checkbox" data-act="selAll" ${allSel ? 'checked' : ''} aria-label="전체 선택">
      <span>${list.length}개 표시</span>
      <select class="pl-select pl-select--sm pl-u-push" id="sort" aria-label="정렬" style="border:0;background:transparent;">${SORTS.map(([id, l]) => `<option value="${id}" ${S.sort === id ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div class="pl-seg pl-seg--sm pl-seg--inline" role="group" aria-label="보기 방법">${[['list', '목록', 'list'], ['detail', '상세', 'detail'], ['thumb', '썸네일', 'grid']].map(([id, l, ic]) => `<button type="button" class="pl-seg__item" aria-pressed="${S.view === id}" data-act="view" data-val="${id}">${icon(ic, 'pl-i--sm')}${l}</button>`).join('')}</div>
    </div>
  </div>
  <div class="pl-panel__scroll" style="padding-bottom:72px;">${body}</div>
  ${S.sel.size ? `
  <div class="pl-toolbar">
    <span class="pl-toolbar__count"><b>${S.sel.size}</b>개 선택</span>
    <button type="button" class="pl-toolbar__btn" data-act="bCopy" aria-label="복사" data-tip="복사">${icon('copy')}</button>
    <button type="button" class="pl-toolbar__btn" data-act="bOpen" aria-label="새 탭으로 열기" data-tip="새 탭으로 열기">${icon('external')}</button>
    <button type="button" class="pl-toolbar__btn" data-act="bThumbs" aria-label="썸네일 일괄 저장" data-tip="썸네일 일괄 저장">${icon('image')}</button>
    <button type="button" class="pl-toolbar__btn" data-act="bEnrich" aria-label="유튜브 정보 가져오기" data-tip="유튜브 정보 가져오기">${icon('chart')}</button>
    <button type="button" class="pl-toolbar__btn" data-act="bWatch" aria-label="워치리스트에 추가" data-tip="워치리스트에 추가">${icon('eye')}</button>
    <button type="button" class="pl-toolbar__btn" data-act="bBookmark" aria-label="북마크" data-tip="북마크에 추가">${icon('bookmark')}</button>
    <button type="button" class="pl-toolbar__btn" data-act="bExcel" aria-label="엑셀 다운로드" data-tip="엑셀 다운로드">${icon('download')}</button>
    <button type="button" class="pl-toolbar__btn pl-toolbar__btn--danger" data-act="bDelete" aria-label="목록에서 삭제" data-tip="목록에서 삭제">${icon('trash')}</button>
    <button type="button" class="pl-toolbar__btn pl-toolbar__btn--muted" data-act="bClear" aria-label="선택 해제" data-tip="선택 해제" data-tip-align="end">${icon('close')}</button>
  </div>` : ''}`;
}

function renderKeywords() {
  const kws = keywordStats(links, S.kwSource, 20);
  const max = kws[0]?.n || 1;
  return `<div class="pl-panel__scroll" style="padding:14px;display:flex;flex-direction:column;gap:12px;">
    <div class="pl-head">
      <div style="display:flex;flex-direction:column;"><span class="pl-title-xs">자주 나오는 키워드</span><span class="pl-caption">수집한 링크 ${links.length}개의 ${S.kwSource === 'tags' ? '태그·해시태그' : '제목'} 기준</span></div>
      <div class="pl-seg pl-seg--sm pl-seg--inline pl-u-push"><button type="button" class="pl-seg__item" aria-pressed="${S.kwSource === 'title'}" data-act="kwSource" data-val="title">제목</button><button type="button" class="pl-seg__item" aria-pressed="${S.kwSource === 'tags'}" data-act="kwSource" data-val="tags">태그·해시태그</button></div>
    </div>
    ${kws.length ? `<div style="display:flex;flex-direction:column;gap:2px;">${kws.map((k, i) => `
      <button type="button" class="pl-bar-row" data-act="kwFilter" data-val="${esc(k.word)}" style="border:0;background:transparent;padding:0;cursor:pointer;text-align:left;" title="이 키워드로 링크 거르기">
        <span class="pl-bar-row__rank">${i + 1}</span><span class="pl-bar-row__word">${esc(k.word)}</span>
        <span class="pl-bar"><span class="pl-bar__fill" style="display:block;width:${Math.round((k.n / max) * 100)}%"></span></span><span class="pl-bar-row__n">${k.n}</span>
      </button>`).join('')}</div>
      <button type="button" class="pl-btn pl-btn--lg" data-act="kwCopy">${icon('copy')}키워드 복사</button>`
      : emptyState('키워드가 아직 없어요', S.kwSource === 'tags' ? '유튜브 정보를 가져오면 태그가 모여요.' : '링크를 모으면 제목에서 키워드를 뽑아요.')}
  </div>`;
}

function renderWatch() {
  return `<div class="pl-panel__scroll">
    <div class="pl-head" style="padding:12px 14px;border-bottom:1px solid var(--pl-divider);">
      <div style="display:flex;flex-direction:column;"><span class="pl-title-xs">채널·계정 워치리스트</span><span class="pl-caption">${watchCheckedAt ? '마지막 확인 ' + timeAgo(watchCheckedAt) : '아직 확인 전'} · 6시간마다 자동 확인</span></div>
      <button type="button" class="pl-btn pl-btn--sm pl-u-push" data-act="watchCheck">${icon('refresh', 'pl-i--sm')}지금 확인</button>
    </div>
    ${watch.length ? watch.map((w, i) => {
      const delta = w.followers != null && w.prevFollowers != null ? w.followers - w.prevFollowers : null;
      const p = PLATFORMS[w.platform] || PLATFORMS.web;
      return `<div class="pl-head" style="padding:12px 14px;border-bottom:1px solid var(--pl-divider);gap:10px;">
        <span class="pl-avatar pl-avatar--lg" style="${avatarStyle(w.avatar)}"></span>
        <div class="pl-u-grow" style="display:flex;flex-direction:column;gap:2px;">
          <span class="pl-meta"><a class="pl-u-strong pl-u-truncate" style="font-size:12.5px;" href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.name)}</a><span class="pl-platform"><span class="pl-dot pl-dot--sm" data-tone="${w.platform}"></span>${esc(p.short)}</span></span>
          <span class="pl-u-muted" style="font-size:11px;">${w.platform === 'yt' ? `${p.follower} ${w.followers != null ? compactKo(w.followers) : '-'}${delta ? ` <b class="${delta > 0 ? 'pl-u-success' : 'pl-u-danger'}">${delta > 0 ? '+' : ''}${compactKo(delta)}</b>` : ''}` : '자동 확인은 유튜브만 지원해요'}</span>
        </div>
        ${w.fresh ? `<button type="button" class="pl-badge" data-tone="danger" data-act="watchSeen" data-val="${i}" style="border:0;cursor:pointer;" title="확인함으로 표시">새 글 ${w.fresh}</button>` : ''}
        <button type="button" class="pl-icon-btn pl-icon-btn--sm" data-act="watchRemove" data-val="${i}" aria-label="삭제" data-tip="워치리스트에서 빼기" data-tip-align="end">${icon('close', 'pl-i--sm')}</button>
      </div>`;
    }).join('') : emptyState('워치리스트가 비어 있어요', '상세 보기에서 채널·계정을 펼친 뒤 ‘워치리스트 추가’를 누르세요.')}
  </div>`;
}

function render() {
  const active = document.activeElement;
  const refocus = active && active.id ? active.id : active && active.dataset && active.dataset.memoInput ? 'memo' : null;
  const selStart = active && active.selectionStart;
  app.innerHTML = `
    <div class="pl-panel__head">
      <span class="pl-brand__mark pl-brand__mark--sm">${icon('link')}</span>
      <span class="pl-u-strong" style="color:var(--pl-text-2);">Power Link</span>
      <span class="pl-badge pl-badge--mono" title="버전">v${version()}</span>
      <span class="pl-u-grow"></span>
      <button type="button" class="pl-icon-btn pl-icon-btn--sm" data-act="options" aria-label="설정" data-tip="설정" data-tip-pos="below" data-tip-align="end">${icon('sliders')}</button>
    </div>
    <nav class="pl-tabs" role="tablist">
      ${[['links', '수집 링크', links.length], ['keywords', '키워드', ''], ['watch', '워치리스트', watch.length]].map(([id, l, n]) => `<button type="button" role="tab" class="pl-tab" aria-selected="${S.tab === id}" data-act="tab" data-val="${id}">${l}${n !== '' ? `<span class="pl-tab__count">${n}</span>` : ''}</button>`).join('')}
    </nav>
    ${S.tab === 'links' ? renderLinks() : S.tab === 'keywords' ? renderKeywords() : renderWatch()}`;
  if (refocus === 'memo' || (S.editing && refocus !== 'q')) { const el = app.querySelector('[data-memo-input]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  else if (refocus === 'q') { const el = app.querySelector('#q'); if (el) { el.focus(); if (selStart != null) el.setSelectionRange(selStart, selStart); } }
}

// ------------------------------------------------------------------ actions
const selected = () => links.filter((l) => S.sel.has(l.id));
const report = (r) => toast(r?.message || (r?.ok ? '완료했어요' : '처리하지 못했어요'), r?.ok ? 'success' : 'error');

async function saveMemo(id) {
  const text = (S.draft || '').trim();
  S.editing = null;
  await updateLink(id, { memo: text });
}

function downloadXls(items) {
  const html = buildXls(items, settings);
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `PowerLink_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.xls`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function bookmark(items) {
  const [root] = await chrome.bookmarks.search({ title: 'Power Link' });
  const folder = root && !root.url ? root : await chrome.bookmarks.create({ title: 'Power Link' });
  for (const it of items) await chrome.bookmarks.create({ parentId: folder.id, title: it.title || it.url, url: it.url });
  toast(`북마크 ‘Power Link’ 폴더에 ${items.length}개를 추가했어요`);
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act, id = t.dataset.id, val = t.dataset.val;
  switch (act) {
    case 'tab': S.tab = val; break;
    case 'platform': S.platform = val; break;
    case 'kind': S.kind = val; break;
    case 'view': S.view = val; setSettings({ sidepanel: { view: val } }); break;
    case 'toggleAll': S.allOpen = !S.allOpen; S.open.clear(); break;
    case 'expand': if (S.allOpen) { S.allOpen = false; filtered().forEach((l) => S.open.add(l.id)); } S.open.has(id) ? S.open.delete(id) : S.open.add(id); break;
    case 'sel': S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); break;
    case 'selAll': { const list = filtered(); const all = list.every((l) => S.sel.has(l.id)); list.forEach((l) => (all ? S.sel.delete(l.id) : S.sel.add(l.id))); break; }
    case 'memo': { const it = links.find((l) => l.id === id); S.editing = id; S.draft = it?.memo || ''; break; }
    case 'memoSave': await saveMemo(id); return;
    case 'memoCancel': S.editing = null; break;
    case 'enrichOne': toast('유튜브 정보를 가져오는 중…', 'warning'); report(await send({ type: 'pl:enrich', ids: [id] })); return;
    case 'watchOne': report(await send({ type: 'pl:watchAdd', ids: [id] })); return;
    case 'options': chrome.runtime.openOptionsPage(); return;
    case 'bCopy': { const r = await send({ type: 'pl:copyItems', ids: [...S.sel] }); if (r.ok && r.copyPayload && !(await writeClipboard(r.copyPayload.text, r.copyPayload.html))) { toast('클립보드에 복사하지 못했어요', 'error'); return; } report(r); return; }
    case 'bOpen': { const urls = selected().map((l) => l.url); if (urls.length > (settings.confirmOver || 20) && !confirm(`탭 ${urls.length}개를 열까요?`)) return; await send({ type: 'pl:openUrls', urls }); return; }
    case 'bThumbs': report(await send({ type: 'pl:thumbs', ids: [...S.sel] })); return;
    case 'bEnrich': toast('유튜브 정보를 가져오는 중…', 'warning'); report(await send({ type: 'pl:enrich', ids: [...S.sel] })); return;
    case 'bWatch': report(await send({ type: 'pl:watchAdd', ids: [...S.sel] })); return;
    case 'bBookmark': await bookmark(selected()); return;
    case 'bExcel': downloadXls(selected()); toast('엑셀 파일을 저장했어요'); return;
    case 'bDelete': if (!confirm(`${S.sel.size}개를 목록에서 삭제할까요?`)) return; await removeLinks([...S.sel]); S.sel.clear(); return;
    case 'bClear': S.sel.clear(); break;
    case 'kwSource': S.kwSource = val; break;
    case 'kwFilter': S.q = val; S.tab = 'links'; break;
    case 'kwCopy': { const kws = keywordStats(links, S.kwSource, 20).map((k) => k.word).join(', '); const ok = await writeClipboard(kws); toast(ok ? '키워드를 복사했어요' : '클립보드에 복사하지 못했어요', ok ? 'success' : 'error'); return; }
    case 'watchCheck': toast('확인하는 중…', 'warning'); report(await send({ type: 'pl:watchCheck' })); return;
    case 'watchRemove': watch.splice(+val, 1); await setWatch(watch); return;
    case 'watchSeen': watch[+val].fresh = 0; await setWatch(watch); return;
    default: return;
  }
  render();
});

app.addEventListener('input', (e) => {
  if (e.target.id === 'q') { S.q = e.target.value; render(); }
  if (e.target.dataset.memoInput) S.draft = e.target.value;
});
app.addEventListener('change', async (e) => {
  if (e.target.id === 'cat') { S.cat = e.target.value; render(); }
  if (e.target.id === 'sort') { S.sort = e.target.value; render(); }
  if (e.target.dataset.act === 'cat') await updateLink(e.target.dataset.id, { category: e.target.value });
});
app.addEventListener('keydown', async (e) => {
  const id = e.target.dataset && e.target.dataset.memoInput;
  if (!id) return;
  if (e.key === 'Enter') { e.preventDefault(); await saveMemo(id); }
  if (e.key === 'Escape') { S.editing = null; render(); }
});

chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area === 'local' && ch[STORAGE.links]) { links = ch[STORAGE.links].newValue || []; const ids = new Set(links.map((l) => l.id)); [...S.sel].forEach((i) => ids.has(i) || S.sel.delete(i)); render(); }
  if (area === 'local' && ch[STORAGE.watch]) { watch = ch[STORAGE.watch].newValue || []; if (S.tab === 'watch') render(); }
  if (area === 'local' && ch.pl_watchCheckedAt) watchCheckedAt = ch.pl_watchCheckedAt.newValue;
  if (area === 'sync' && ch[STORAGE.settings]) settings = await getSettings();
});

(async function init() {
  settings = await getSettings();
  S.view = settings.sidepanel?.view || 'list';
  [links, watch] = await Promise.all([getLinks(), getWatch()]);
  ({ pl_watchCheckedAt: watchCheckedAt } = await chrome.storage.local.get('pl_watchCheckedAt'));
  render();
})();
