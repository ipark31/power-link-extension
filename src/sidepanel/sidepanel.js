// Power Link — side panel (collected links, recent screens, keywords, watchlist)
// Layout follows design/graphite (Main / List / Detail / Recent boards).
import { getSettings, setSettings, getLinks, setLinks, updateLink, updateLinks, removeLinks, getWatch, setWatch, getApiKey } from '../shared/storage.js';
import { PLATFORMS, STORAGE, isDownloadable } from '../shared/constants.js';
import { esc, compactKo, timeAgo, fmtDate, fmtDuration } from '../shared/util.js';
import { buildXls, keywordStats } from '../shared/format.js';
import { icon, ytLogo, avatar, send, toast, writeClipboard, confirmModal, memoModal, collectionModal } from '../ui/ui.js';
import { currentTheme, setTheme, themeReady } from '../ui/theme.js';
import { makeZip, safeFileName } from '../shared/zip.js';

const app = document.getElementById('app');
const S = {
  tab: 'links', view: 'list', platform: 'all', kind: 'all', cat: 'all', coll: 'all', hot: false, q: '', sort: 'recent', kwSource: 'title',
  sel: new Set(), open: new Set(), allOpen: false,
  rq: '', rsort: 'new', rprof: 'all',
  limit: 60 // rows rendered so far; more are appended while scrolling (see appendMore)
};
const PAGE = 60;
let links = [], watch = [], settings = null, watchCheckedAt = null, hasKey = false;
let recent = [], openTabs = new Map(); // recent screens + currently open tabs (key → tab)
let recentOthers = { profiles: [] }, bridge = null; // other Chrome profiles (native messaging helper)
let collections = [], showMarks = true; // link folders · page outlines visible
let dlJob = null, dlTimer = 0;          // 진행 중인 영상 다운로드 배치 { batch_id, total, counts, progress, status, items }

const PLAT_FILTERS = [['all', '전체'], ['yt', '유튜브'], ['tt', '틱톡'], ['ig', '인스타'], ['x', 'X'], ['blog', '블로그'], ['web', '웹']];
const KINDS = [['all', '종류'], ['post', '게시물·영상'], ['account', '채널·계정']];
const SORTS = [['recent', '최근 수집순'], ['outlier', '떡상 점수순'], ['views', '조회수순'], ['channel', '채널별 묶기'], ['title', '제목순']];
const BAR_ACTIONS = [
  ['bCopy', 'copy', '복사'], ['bOpen', 'external', '새 탭으로 열기'], ['bThumbs', 'image', '썸네일 압축 저장'],
  ['bColl', 'folder', '컬렉션에 넣기'], ['bWatch', 'eye', '워치리스트에 추가'], ['bBookmark', 'bookmark', '북마크에 추가'], ['bExcel', 'download', '엑셀 다운로드'],
  ['bDownload', 'filmDown', '영상 다운로드 (다운로더 서버로 보내 정한 폴더에 저장)'],
  ['bDelete', 'trash', '목록에서 삭제']
];

// ------------------------------------------------------------------ derived data
const P = (it) => PLATFORMS[it.platform] || PLATFORMS.web;
const isYt = (it) => it.platform === 'yt';
const hot = (it) => settings.outlierHighlight !== false && it.outlier != null && it.outlier >= 1.5;
const titleHtml = (it, lg) => (isYt(it) ? ytLogo(lg) : '') + esc(it.title || it.url);
const chanName = (it) => it.account?.name || it.domain || '';
const bgImg = (url) => (url ? ` style="background-image:url('${esc(url)}')"` : '');
function statLine(it) {
  if (it.kind === 'account') {
    const a = it.account || {};
    return [a.followers != null ? `${P(it).follower || '팔로워'} ${compactKo(a.followers)}` : '', a.total != null ? `영상 ${compactKo(a.total)}` : ''].filter(Boolean).join(' · ') || it.domain;
  }
  const d = it.detail || {};
  return [d.views != null ? `조회 ${compactKo(d.views)}` : '', timeAgo(d.uploadedAt || it.createdAt)].filter(Boolean).join(' · ');
}
function accountStats(a) {
  return [
    ['개설일', fmtDate(a.created) || '-'], ['전체 영상', a.total != null ? compactKo(a.total) : '-'],
    ['롱폼 / 쇼츠', a.longCount != null || a.shortCount != null ? `${a.longCount ?? '-'} / ${a.shortCount ?? '-'}` : '-'],
    ['최근 30일', a.recent30 != null ? a.recent30 + '개' : '-'], ['평균 조회', a.avgViews != null ? compactKo(a.avgViews) : '-'],
    ['총 조회수', a.views != null ? compactKo(a.views) : '-']
  ];
}
// collection name after the meta line (· 폴더명)
const collTag = (it) => { const c = it.coll && collections.find((x) => x.id === it.coll); return c ? ' · ' + esc(c.name) : ''; };
const canFetch = (it) => isYt(it) && ((it.kind === 'post' && it.ids?.videoId) || (it.kind === 'account' && (it.ids?.channelId || it.ids?.handle)));

function filtered() {
  const q = S.q.trim().toLowerCase();
  let list = links.filter((l) =>
    (S.platform === 'all' || l.platform === S.platform) &&
    (S.kind === 'all' || l.kind === S.kind) &&
    (S.cat === 'all' || (l.category || '') === S.cat) &&
    (S.coll === 'all' || (S.coll === 'none' ? !l.coll : l.coll === S.coll)) &&
    (!S.hot || (l.outlier != null && l.outlier >= 1.5)) &&
    (!q || [l.title, l.url, l.account?.name, settings.memoSearch !== false ? l.memo : '', l.category].some((v) => (v || '').toLowerCase().includes(q))));
  const num = (v) => (v == null ? -1 : v);
  if (S.sort === 'outlier') list = [...list].sort((a, b) => num(b.outlier) - num(a.outlier));
  else if (S.sort === 'views') list = [...list].sort((a, b) => num(b.detail?.views) - num(a.detail?.views));
  else if (S.sort === 'title') list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else if (S.sort === 'channel') list = [...list].sort((a, b) => chanName(a).localeCompare(chanName(b), 'ko')); // stable: newest first inside a channel
  return list;
}

// ------------------------------------------------------------------ render pieces
const memoBtn = (it, cls = '') => `<button type="button" class="pl-memo-btn ${cls} ${it.memo ? 'is-on' : ''}" data-act="memo" data-id="${it.id}" aria-label="메모" title="${it.memo ? esc('메모: ' + it.memo) : '메모 추가'}">${icon('memo', 'pl-i--sm')}</button>`;
const memoChip = (it, lg) => `<button type="button" class="pl-memo-chip${lg ? ' pl-memo-chip--lg' : ''}" data-act="memo" data-id="${it.id}" title="메모 수정">${icon('memoSm', 'pl-i--xs')}<span>${esc(it.memo)}</span></button>`;
const check = (it, cls = '') => `<input type="checkbox" class="pl-check ${cls}" data-act="sel" data-id="${it.id}" ${S.sel.has(it.id) ? 'checked' : ''} aria-label="선택">`;
const dur = (it) => (it.detail?.duration ? `<span class="pl-dur">${fmtDuration(it.detail.duration)}</span>` : '');
const hotTag = (it) => (hot(it) ? `<span class="pl-up" title="채널 평균 대비 조회수">×${it.outlier}</span>` : '');
// thumbnail box content: video/post image, or a centered avatar for channels / sites without an image
// Thumbnails are real <img loading="lazy">: only the ones near the viewport are fetched and decoded
// (background-image fetched every thumbnail of the whole list at once).
function thumbInner(it, avCls) {
  if (it.kind === 'account') return avatar(it.account?.name || it.title, it.account?.avatar || it.thumb, avCls);
  return it.thumb && /^https?:/.test(it.thumb) ? `<img class="pl-cover" src="${esc(it.thumb)}" alt="" loading="lazy" decoding="async">` : avatar(it.domain || it.title, '', avCls);
}
const thumbBg = () => '';

function tile(it) {
  const acc = it.kind === 'account';
  return `<div class="pl-tile ${S.sel.has(it.id) ? 'is-selected' : ''}" data-row="${it.id}" tabindex="-1">
    <div class="pl-tile__thumb ${acc ? 'pl-tile__thumb--ch' : ''}"${thumbBg(it)}>
      ${thumbInner(it, 'pl-av--xl')}
      ${check(it, 'pl-tile__check')}
      ${acc ? '' : dur(it)}
    </div>
    <a class="pl-tile__title" href="${esc(it.url)}" target="_blank" rel="noopener">${titleHtml(it)}</a>
    <div class="pl-tile__meta">
      <span class="pl-chan">${avatar(chanName(it), it.account?.avatar)}<span class="pl-trunc">${esc(acc ? (it.ids?.handle || it.domain) : chanName(it))}${it.category ? ' · ' + esc(it.category) : ''}${collTag(it)}</span></span>
      <div class="pl-tile__stat"><span class="pl-trunc">${esc(statLine(it))}</span>${hotTag(it)}${memoBtn(it)}</div>
    </div>
  </div>`;
}

function rowList(it) {
  const acc = it.kind === 'account';
  const meta = acc ? statLine(it) : [chanName(it), statLine(it)].filter(Boolean).join(' · ');
  return `<div class="pl-lrow ${S.sel.has(it.id) ? 'is-selected' : ''}" data-row="${it.id}" tabindex="-1">
    ${check(it)}
    <div class="pl-lthumb ${acc ? 'pl-lthumb--ch' : ''}"${thumbBg(it)}>${thumbInner(it, 'pl-av--lg')}${acc ? '' : dur(it)}</div>
    <div class="pl-lrow__body">
      <a class="pl-lrow__title" href="${esc(it.url)}" target="_blank" rel="noopener">${titleHtml(it)}</a>
      <span class="pl-lrow__meta">${avatar(chanName(it), it.account?.avatar)}<span class="pl-trunc">${esc(meta)}${it.category ? ' · ' + esc(it.category) : ''}${collTag(it)}</span>${hotTag(it)}</span>
      ${it.memo ? memoChip(it) : ''}
    </div>
    ${memoBtn(it, 'pl-memo-btn--md')}
  </div>`;
}

// Status box for YouTube items whose details are not in yet (fetched automatically).
function infoBox(it, open) {
  const chev = `<button type="button" class="pl-ibtn pl-ibtn--sm" data-act="expand" data-id="${it.id}" aria-label="${open ? '접기' : '펼치기'}" aria-expanded="${open}">${icon(open ? 'chevronUp' : 'chevron', 'pl-i--md')}</button>`;
  let msg;
  if (!canFetch(it)) msg = isYt(it) ? '채널·계정 정보 없음' : `${esc(it.domain || '')} · 채널·계정 정보는 유튜브만 가져와요`;
  else if (!hasKey) msg = '설정에서 YouTube API 키를 넣으면 정보가 자동으로 채워져요';
  else if (it.enrichTriedAt && !it.enrichedAt) msg = '유튜브 정보를 찾지 못했어요';
  else msg = '<span class="pl-spinner" aria-hidden="true"></span>유튜브 정보 불러오는 중…';
  return `<div class="pl-loading pl-drow__in"><span class="pl-grow" style="display:flex;align-items:center;gap:8px;">${msg}</span>${chev}</div>`;
}

function rowDetail(it) {
  const open = S.allOpen || S.open.has(it.id);
  const acc = it.kind === 'account';
  const a = it.account;
  const d = it.detail || {};
  const metrics = [];
  if (d.views != null) metrics.push(['조회', compactKo(d.views)]);
  if (d.likes != null) metrics.push([it.platform === 'blog' ? '공감' : '좋아요', compactKo(d.likes)]);
  if (d.comments != null) metrics.push(['댓글', compactKo(d.comments)]);
  const when = acc ? (a?.handle || it.ids?.handle || it.domain) : d.uploadedAt ? timeAgo(d.uploadedAt) : '수집 ' + timeAgo(it.createdAt);
  const cats = settings.categories || [];
  const chev = `<button type="button" class="pl-ibtn pl-ibtn--sm" data-act="expand" data-id="${it.id}" aria-label="${open ? '채널 정보 접기' : '채널 정보 펼치기'}" aria-expanded="${open}">${icon(open ? 'chevronUp' : 'chevron', 'pl-i--md')}</button>`;
  const chbox = a ? `
    <div class="pl-chbox pl-drow__in">
      <div class="pl-chbox__head">
        ${avatar(a.name || it.title, a.avatar, 'pl-av--md')}
        <span class="pl-chbox__name">${esc(a.name || '')}</span>
        ${a.followers != null ? `<span class="pl-chbox__sub">${esc(P(it).follower || '구독자')} ${compactKo(a.followers)}</span>` : ''}
        <span class="pl-grow"></span>
        ${a.power != null ? `<span class="pl-chbox__sub" title="채널력(베타): 현재 임의 점수">채널력 <b>${a.power}</b></span>` : ''}
        ${chev}
      </div>
      ${open ? `<div class="pl-chbox__grid">${accountStats(a).map(([k, v]) => `<div class="pl-chbox__cell"><span class="pl-chbox__k">${k}</span><span class="pl-chbox__v">${esc(v)}</span></div>`).join('')}</div>` : ''}
    </div>` : infoBox(it, open);
  const acts = open ? `
    <div class="pl-drow__acts pl-drow__in">
      <label class="pl-catsel"><select data-act="cat" data-id="${it.id}" aria-label="카테고리">
        <option value="">카테고리 없음</option>${cats.map((c) => `<option ${c === it.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        ${it.category && !cats.includes(it.category) ? `<option selected>${esc(it.category)}</option>` : ''}
      </select>${icon('chevron', 'pl-i--xs')}</label>
      ${a || acc ? `<button type="button" class="pl-chip" data-act="watchOne" data-id="${it.id}">${icon('eye', 'pl-i--sm')}워치리스트</button>` : ''}
      ${a?.accountUrl ? `<a class="pl-chip" href="${esc(a.accountUrl)}" target="_blank" rel="noopener">${icon('external', 'pl-i--sm')}${esc(P(it).openAccount)}</a>` : ''}
      ${it.memo ? '' : `<button type="button" class="pl-chip" data-act="memo" data-id="${it.id}">${icon('memoSm', 'pl-i--sm')}메모 추가</button>`}
    </div>` : '';
  return `<div class="pl-drow ${S.sel.has(it.id) ? 'is-selected' : ''}" data-row="${it.id}" tabindex="-1">
    <div class="pl-drow__top">
      ${check(it)}
      <a class="pl-dthumb ${acc ? 'pl-dthumb--ch' : ''}"${thumbBg(it)} href="${esc(it.url)}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${thumbInner(it, 'pl-av--xl')}${acc ? '' : dur(it)}</a>
      <div class="pl-drow__info">
        <span class="pl-drow__cat">${[it.category, when].filter(Boolean).map(esc).join(' · ')}</span>
        <a class="pl-drow__title" href="${esc(it.url)}" target="_blank" rel="noopener">${titleHtml(it, true)}</a>
      </div>
      ${memoBtn(it, 'pl-memo-btn--md')}
    </div>
    ${metrics.length || it.outlier != null ? `<div class="pl-drow__stats pl-drow__in">
      ${metrics.map(([k, v]) => `<span>${k} <b>${esc(v)}</b></span>`).join('')}
      ${it.outlier != null ? `<span class="pl-push ${hot(it) ? 'pl-up' : ''}" title="채널 평균 조회수 대비">평균 대비 ×${it.outlier}</span>` : ''}
    </div>` : ''}
    ${chbox}
    ${acts}
    ${it.memo ? `<div class="pl-drow__in">${memoChip(it, true)}</div>` : ''}
  </div>`;
}

// Ask the background to fetch missing YouTube details for what is on screen,
// in list order, top to bottom. Already-fetched links are skipped there.
let kickTimer = 0;
function kickEnrich() {
  if (!hasKey) return;
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => {
    const ids = filtered().filter((l) => l.platform === 'yt' && !l.enrichedAt && !l.enrichTriedAt && (l.ids?.videoId || l.ids?.channelId || l.ids?.handle)).map((l) => l.id);
    if (ids.length) send({ type: 'pl:enrichAuto', ids });
  }, 300);
}

function emptyState(title, desc, ic = 'link') {
  return `<div class="pl-empty"><div class="pl-empty__icon">${icon(ic, 'pl-i--lg')}</div><div class="pl-empty__title">${title}</div><div class="pl-caption">${desc}</div></div>`;
}
const tsel = (id, list, cur, label) => `<label class="pl-tsel"><select id="${id}" aria-label="${label}">${list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${icon('chevron', 'pl-i--sm')}</label>`;

function renderLinks() {
  const list = filtered();
  const counts = { all: links.length };
  links.forEach((l) => { counts[l.platform] = (counts[l.platform] || 0) + 1; });
  const cats = [...new Set(links.map((l) => l.category).filter(Boolean))];
  const allSel = list.length > 0 && list.every((l) => S.sel.has(l.id));
  const hotCount = links.filter((l) => l.outlier != null && l.outlier >= 1.5).length;
  if (S.coll !== 'all' && S.coll !== 'none' && !collections.some((c) => c.id === S.coll)) S.coll = 'all';
  const shown = list.slice(0, S.limit);
  const more = list.length > shown.length ? '<div class="pl-more" data-more aria-hidden="true"></div>' : '';
  const body = !links.length
    ? emptyState('아직 수집한 링크가 없어요', 'Alt + 우클릭 드래그로 링크를 둘러 그리면 여기에 저장돼요. 팝업의 ‘목록에 저장’도 쓸 수 있어요.')
    : !list.length ? emptyState('조건에 맞는 링크가 없어요', '필터나 검색어를 바꿔 보세요.', 'search')
    : S.view === 'thumb' ? `<div class="pl-grid" data-rows>${withGroups(shown, null, tile, linkGroupOf(), groupCounts(list))}</div>${more}`
    : `<div data-rows>${withGroups(shown, null, S.view === 'detail' ? rowDetail : rowList, linkGroupOf(), groupCounts(list))}</div>${more}`;
  return `
  <div class="pl-filters">
    <label class="pl-search">${icon('search')}<input type="text" id="q" placeholder="제목, 채널, 메모 검색  ( / )" value="${esc(S.q)}" aria-label="검색"></label>
    <div class="pl-frow pl-frow--wrap">
      <div class="pl-frow__chips">${PLAT_FILTERS.filter(([id]) => id === 'all' || counts[id]).map(([id, l]) => `<button type="button" class="pl-chip" aria-pressed="${S.platform === id}" data-act="platform" data-val="${id}">${id === 'yt' ? icon('play', 'pl-i--sm') : ''}${l}<span class="pl-chip__n">${counts[id] || 0}</span></button>`).join('')}${hotCount || S.hot ? `<button type="button" class="pl-chip" aria-pressed="${S.hot}" data-act="hot" title="채널 평균보다 1.5배 이상 조회된 영상만">떡상 ×1.5↑<span class="pl-chip__n">${hotCount}</span></button>` : ''}</div>
      <span class="pl-grow"></span>
      ${tsel('kind', KINDS, S.kind, '종류')}
      ${tsel('cat', [['all', '카테고리']].concat(cats.map((c) => [c, c])), S.cat, '카테고리')}
      ${collections.length ? tsel('coll', [['all', '컬렉션'], ['none', '컬렉션 없음']].concat(collections.map((c) => [c.id, `${c.name} (${links.filter((l) => l.coll === c.id).length})`])), S.coll, '컬렉션') : ''}
    </div>
    <div class="pl-frow pl-frow--gap8">
      <input type="checkbox" class="pl-check" data-act="selAll" ${allSel ? 'checked' : ''} aria-label="전체 선택">
      <span class="pl-count">${list.length}개 표시</span>
      <label class="pl-tsel pl-tsel--sm"><select id="sort" aria-label="정렬">${SORTS.map(([id, l]) => `<option value="${id}" ${S.sort === id ? 'selected' : ''}>${l}</option>`).join('')}</select>${icon('chevron', 'pl-i--sm')}</label>
      <span class="pl-grow"></span>
      ${S.view === 'detail' ? `<button type="button" class="pl-btn pl-btn--ghost pl-btn--sm" data-act="toggleAll" style="height:26px;padding:0 6px;border-radius:6px;">${S.allOpen ? '모두 접기' : '모두 펼치기'}</button>` : ''}
      <div class="pl-seg pl-seg--icon" role="group" aria-label="보기 방법">${[['list', '목록', 'list'], ['detail', '상세', 'detail'], ['thumb', '썸네일', 'grid']].map(([id, l, ic]) => `<button type="button" class="pl-seg__item" aria-pressed="${S.view === id}" data-act="view" data-val="${id}" aria-label="${l}" title="${l}">${icon(ic, 'pl-i--md')}</button>`).join('')}</div>
    </div>
  </div>
  <div class="pl-scroll pl-scroll--bar">${body}</div>
  ${dlStrip()}
  ${list.length ? `
  <div class="pl-bar" role="toolbar" aria-label="일괄 작업">
    <span class="pl-bar__count" title="${S.sel.size ? '선택한 링크에 적용돼요' : '선택하지 않으면 지금 보이는 링크 전체에 적용돼요'}">${S.sel.size ? `${S.sel.size}개 선택` : `전체 ${list.length}개`}</span>
    ${BAR_ACTIONS.map(([act, ic, l]) => `<button type="button" class="pl-bar__btn" data-act="${act}" aria-label="${l}" title="${l}">${icon(ic, 'pl-i--lg')}</button>`).join('')}
    ${S.sel.size ? `<span class="pl-bar__sep" aria-hidden="true"></span><button type="button" class="pl-bar__btn" data-act="bClear" aria-label="선택 해제" title="선택 해제">${icon('close', 'pl-i--lg')}</button>` : ''}
  </div>` : ''}`;
}

// ------------------------------------------------------------------ recent screens
const rkey = (u) => { try { const x = new URL(u); x.hash = ''; return x.href; } catch (e) { return u; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
let openTabList = []; // every tab of this profile (openTabs keeps one per screen)
async function refreshOpenTabs() {
  const tabs = await chrome.tabs.query({});
  openTabList = tabs.filter((t) => t.url);
  openTabs = new Map(openTabList.map((t) => [rkey(t.url), t]));
}

// "중복 링크 닫기": one tab per screen survives.
// - inside this profile: keep pinned > active > most recently used, close the rest
// - across profiles: this profile wins when it has the screen open; otherwise the first online
//   profile that lists it keeps it. Offline profiles are left alone (their tabs would close
//   unexpectedly the next time they start).
function duplicatePlan() {
  const groups = new Map();
  for (const t of openTabList) { const k = rkey(t.url); if (/^https?:/i.test(t.url)) (groups.get(k) || groups.set(k, []).get(k)).push(t); }
  const localClose = [];
  for (const tabs of groups.values()) {
    if (tabs.length < 2) continue;
    const keep = [...tabs].sort((a, b) => (b.pinned - a.pinned) || (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)))[0];
    tabs.forEach((t) => { if (t !== keep && !t.pinned) localClose.push(t.id); });
  }
  const owner = new Map(); // screen key → 'me' | profile id
  for (const k of groups.keys()) owner.set(k, 'me');
  const remote = [];
  for (const p of otherProfiles().filter((x) => x.online)) {
    const seen = new Set();
    for (const it of p.items) {
      const k = rkey(it.url);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!owner.has(k)) owner.set(k, p.id);
      else if (owner.get(k) !== p.id) remote.push({ pid: p.id, name: p.name, url: it.url });
    }
  }
  return { localClose, remote, count: localClose.length + remote.length };
}
async function closeDuplicates() {
  await refreshOpenTabs();
  const plan = duplicatePlan();
  if (plan.localClose.length) await chrome.tabs.remove(plan.localClose);
  let sent = 0;
  for (const r of plan.remote) { const res = await send({ type: 'pl:bridgeSend', target: r.pid, command: { type: 'close', url: r.url } }); if (res.ok) sent++; }
  await refreshOpenTabs();
  toast(plan.count ? `중복 탭 ${plan.localClose.length}개를 닫았어요${sent ? ` · 다른 프로필에 ${sent}개 닫기 요청` : ''}` : '닫을 중복 링크가 없어요', plan.count ? 'success' : 'warning');
}
// YouTube video id from watch / shorts / youtu.be / embed URLs
function ytVideoId(u) {
  try {
    const x = new URL(u), h = x.hostname.replace(/^(www|m|music)\./, '');
    if (h === 'youtu.be') return x.pathname.slice(1, 12) || null;
    if (h !== 'youtube.com') return null;
    if (x.pathname === '/watch') return x.searchParams.get('v');
    const m = x.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}
const isYtUrl = (u) => /^https?:\/\/([a-z]+\.)?(youtube\.com|youtu\.be)\//i.test(u || '');
// My screens plus every other profile's, one flat list. Other-profile entries carry
// { profile: { id, name, online } }; search, sort and YouTube thumbs treat both alike.
function otherProfiles() {
  const connected = !!(bridge && bridge.connected);
  return (recentOthers.profiles || []).map((p) => ({ id: p.id, name: p.name || '다른 프로필', online: connected && !!p.online, items: p.items || [] }));
}
// Deleted rows disappear at once; the stored list catches up afterwards (the background queues the
// write behind pending recent-screen writes, another profile answers through the helper).
// profile id ('' = this profile) | url key → hide until (ms)
const goneRecent = new Map();
const goneKey = (pid, url) => (pid || '') + '|' + rkey(url);
function hideRecent(pid, url, ms = 15000) { goneRecent.set(goneKey(pid, url), Date.now() + ms); if (S.tab === 'recent') render(); }
function isGone(pid, url) {
  const k = goneKey(pid, url), until = goneRecent.get(k);
  if (until && until < Date.now()) goneRecent.delete(k);
  return !!until && until >= Date.now();
}
function recentMerged() {
  const mine = recent.filter((r) => !goneRecent.size || !isGone('', r.url)).map((r) => ({ url: r.url, title: r.title, at: r.at || 0, favIconUrl: r.favIconUrl, profile: null }));
  const others = otherProfiles().flatMap((p) => p.items.filter((r) => !goneRecent.size || !isGone(p.id, r.url)).map((r) => ({
    url: r.url, title: r.title, at: r.at || 0, favIconUrl: r.favIconUrl, open: !!r.open, profile: { id: p.id, name: p.name, online: p.online }
  })));
  return mine.concat(others);
}
function recentFiltered() {
  const q = S.rq.trim().toLowerCase();
  let list = recentMerged();
  if (S.rprof === 'me') list = list.filter((r) => !r.profile);
  else if (S.rprof !== 'all') list = list.filter((r) => r.profile && r.profile.id === S.rprof);
  if (q) list = list.filter((r) => (r.title + ' ' + r.url + ' ' + (r.profile ? r.profile.name : '')).toLowerCase().includes(q));
  return list.sort((a, b) => (S.rsort === 'old' ? a.at - b.at : b.at - a.at));
}
function recentRow(r, saved) {
  const p = r.profile;
  // other profiles report their open tabs (only trusted while that profile is online)
  const isOpen = p ? p.online && r.open : openTabs.has(rkey(r.url));
  const isSaved = saved.has(rkey(r.url));
  const vid = ytVideoId(r.url);
  const media = vid ? `<img class="pl-recent__thumb${/\/shorts\//.test(r.url) ? ' pl-recent__thumb--short' : ''}" src="https://i.ytimg.com/vi/${esc(vid)}/mqdefault.jpg" alt="" loading="lazy" decoding="async">`
    : r.favIconUrl && /^https?:|^data:/.test(r.favIconUrl) ? `<img class="pl-recent__fav" src="${esc(r.favIconUrl)}" alt="" loading="lazy">`
    : `<span class="pl-recent__letter">${esc((hostOf(r.url)[0] || '?').toUpperCase())}</span>`;
  const pAttrs = p ? ` data-pid="${esc(p.id)}" data-on="${p.online ? 1 : 0}" data-name="${esc(p.name)}"` : '';
  const goTip = p ? (p.online ? `‘${p.name}’ 프로필에서 열기` : '오프라인 프로필 — 이 프로필에서 새 탭으로 열기')
    : isOpen ? '열려 있는 화면으로 이동' : '새 탭으로 다시 열기';
  return `<div class="pl-recent${p && !p.online ? ' is-offline' : ''}" data-row="${esc(r.url)}" tabindex="-1">
    <button type="button" class="pl-recent__main" data-act="rGo" data-val="${esc(r.url)}"${pAttrs} title="${esc(goTip)}">
      <span class="pl-recent__media">${media}</span>
      <span class="pl-recent__text">
        <span class="pl-recent__title">${isYtUrl(r.url) ? ytLogo() : ''}${esc(r.title || r.url)}</span>
        <span class="pl-recent__sub">${isOpen ? '<span class="pl-recent__open"><span class="pl-odot"></span>열림</span><span>·</span>' : ''}<span class="pl-trunc">${esc(hostOf(r.url))} · ${esc(timeAgo(new Date(r.at).toISOString()))}</span></span>
      </span>
    </button>
    ${p ? `<span class="pl-ptag" title="${p.online ? '온라인' : '오프라인'} 프로필">${icon('person', 'pl-i--xs')}<span>${esc(p.name)}</span></span>` : ''}
    <div class="pl-recent__acts">
      ${isOpen ? `<button type="button" class="pl-ibtn" data-act="rClose" data-val="${esc(r.url)}"${pAttrs} aria-label="탭 닫고 목록에서 삭제" title="${p ? `‘${esc(p.name)}’ 프로필의 탭 닫고 목록에서 삭제` : '탭 닫고 목록에서 삭제'}">${icon('close', 'pl-i--md')}</button>` : ''}
      <button type="button" class="pl-ibtn" data-act="rAdd" data-val="${esc(r.url)}" aria-label="수집 링크에 추가" title="${isSaved ? '이미 수집 링크에 있어요' : '수집 링크에 추가'}" ${isSaved ? 'disabled' : ''}>${icon(isSaved ? 'check' : 'plus', 'pl-i--md')}</button>
      <button type="button" class="pl-ibtn" data-act="rDel" data-val="${esc(r.url)}"${pAttrs} aria-label="목록에서 삭제" title="${p ? '그 프로필의 목록에서 삭제' : '목록에서 삭제'}">${icon('trash', 'pl-i--md')}</button>
    </div>
  </div>`;
}
function renderRecent() {
  const list = recentFiltered();
  const saved = new Set(links.map((l) => rkey(l.url)));
  const connected = !!(bridge && bridge.connected);
  const profiles = otherProfiles();
  if (S.rprof !== 'all' && S.rprof !== 'me' && !profiles.some((p) => p.id === S.rprof)) S.rprof = 'all';
  const chips = profiles.length ? `
    <div class="pl-frow pl-frow--wrap">
      <button type="button" class="pl-chip" aria-pressed="${S.rprof === 'all'}" data-act="rprof" data-val="all">모든 프로필</button>
      <button type="button" class="pl-chip" aria-pressed="${S.rprof === 'me'}" data-act="rprof" data-val="me"><span class="pl-odot"></span>이 프로필</button>
      ${profiles.map((p) => `<button type="button" class="pl-chip ${p.online ? '' : 'pl-chip--muted'}" aria-pressed="${S.rprof === p.id}" data-act="rprof" data-val="${esc(p.id)}" title="${p.online ? '온라인' : '오프라인'}"><span class="pl-odot ${p.online ? '' : 'pl-odot--off'}"></span>${esc(p.name)}</button>`).join('')}
    </div>` : '';
  const notice = connected ? '' : `
    <div class="pl-notice" data-bridge-notice>
      <span class="pl-notice__title">다른 프로필 연동: 도우미 설치 필요</span>
      <span class="pl-caption">다른 크롬 프로필의 최근 화면까지 보려면 native-host\\install.bat 을 한 번 실행하세요. 모든 프로필에 같은 dist 폴더로 Power Link가 설치돼 있어야 해요.</span>
      <button type="button" class="pl-btn pl-btn--sm" data-act="rBridgeRetry" style="align-self:flex-start;">다시 연결</button>
    </div>`;
  const total = recentMerged().length;
  const dupCount = duplicatePlan().count;
  return `
  <div class="pl-filters">
    <label class="pl-search">${icon('search')}<input type="text" id="rq" placeholder="제목, 주소 검색" value="${esc(S.rq)}" aria-label="검색"></label>
    ${chips}
    <div class="pl-frow pl-frow--gap8">
      <span class="pl-count">${list.length}개 · 최대 ${settings.recentMax || 50}개 기록</span>
      <span class="pl-grow"></span>
      <div class="pl-seg" role="group" aria-label="정렬">${[['new', '최근 순'], ['old', '오래된 순']].map(([id, l]) => `<button type="button" class="pl-seg__item" aria-pressed="${S.rsort === id}" data-act="rsort" data-val="${id}">${l}</button>`).join('')}</div>
    </div>
  </div>
  <div class="pl-scroll pl-scroll--bar">${notice}${list.length ? `<div class="pl-recent-list" data-rows>${withGroups(list.slice(0, S.limit), null, (r) => recentRow(r, saved), (r) => dayLabel(r.at))}</div>${list.length > S.limit ? '<div class="pl-more" data-more aria-hidden="true"></div>' : ''}` : emptyState(total ? '검색 결과가 없어요' : '아직 기록된 화면이 없어요', total ? '다른 검색어를 입력해 보세요.' : '탭을 보면 여기에 차례대로 쌓여요.', 'clock')}</div>
  <div class="pl-bar" role="toolbar" aria-label="최근 화면 작업">
    <span class="pl-bar__count">${dupCount ? `중복 ${dupCount}개` : `열린 탭 ${openTabList.length}개`}</span>
    <button type="button" class="pl-bar__action" data-act="rSortSites" title="창마다 탭을 사이트(도메인)별로 모아 순서를 정리해요. 탭은 닫지 않아요.">${icon('sortSite', 'pl-i--md')}사이트별 정렬</button>
    <button type="button" class="pl-bar__action" data-act="rDedupe" title="같은 주소로 여러 개 열린 탭을 1개만 남기고 닫아요">${icon('copy', 'pl-i--md')}중복 링크 닫기</button>
  </div>`;
}
async function goRecent(url) {
  const k = rkey(url);
  await refreshOpenTabs();
  const tab = openTabs.get(k);
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}
// Another profile's screen: ask that profile to jump there; if it is offline,
// open the URL here instead so the click never dead-ends.
async function goRecentOther(url, pid, online, name) {
  if (online) {
    const r = await send({ type: 'pl:bridgeSend', target: pid, command: { type: 'activate', url } });
    if (r.ok) { toast(`‘${name}’ 프로필에서 열었어요`); return; }
  }
  await chrome.tabs.create({ url, active: true });
  toast(`‘${name}’ 프로필이 오프라인이라 이 프로필에서 새 탭으로 열었어요`, 'warning');
}
// Close every tab of this profile showing that screen; the record stays in the list.
// ✕: close every tab of this profile showing that screen and drop it from the recent list
async function closeRecent(url) {
  hideRecent('', url);
  const k = rkey(url);
  const ids = (await chrome.tabs.query({})).filter((t) => t.url && rkey(t.url) === k).map((t) => t.id);
  if (ids.length) await chrome.tabs.remove(ids);
  await send({ type: 'pl:recentForget', urls: [url] });
  toast(ids.length > 1 ? `탭 ${ids.length}개를 닫고 목록에서 삭제했어요` : ids.length ? '탭을 닫고 목록에서 삭제했어요' : '목록에서 삭제했어요');
}

// ------------------------------------------------------------------ keywords & watchlist
function renderKeywords() {
  const kws = keywordStats(links, S.kwSource, 20);
  const max = kws[0]?.n || 1;
  return `<div class="pl-scroll"><div class="pl-pane">
    <div class="pl-pane__head">
      <div class="pl-grow"><div class="pl-pane__title">자주 나오는 키워드</div><div class="pl-caption">수집한 링크 ${links.length}개의 ${S.kwSource === 'tags' ? '태그·해시태그' : '제목'} 기준</div></div>
      <div class="pl-seg"><button type="button" class="pl-seg__item" aria-pressed="${S.kwSource === 'title'}" data-act="kwSource" data-val="title">제목</button><button type="button" class="pl-seg__item" aria-pressed="${S.kwSource === 'tags'}" data-act="kwSource" data-val="tags">태그</button></div>
    </div>
    ${kws.length ? `<div>${kws.map((k, i) => `
      <button type="button" class="pl-kw" data-act="kwFilter" data-val="${esc(k.word)}" title="이 키워드로 링크 거르기">
        <span class="pl-kw__rank">${i + 1}</span><span class="pl-kw__word">${esc(k.word)}</span>
        <span class="pl-kw__bar"><span class="pl-kw__fill" style="width:${Math.round((k.n / max) * 100)}%"></span></span><span class="pl-kw__n">${k.n}</span>
      </button>`).join('')}</div>
      <button type="button" class="pl-btn pl-btn--lg pl-btn--block" data-act="kwCopy">${icon('copy')}키워드 복사</button>`
      : emptyState('키워드가 아직 없어요', S.kwSource === 'tags' ? '유튜브 정보를 가져오면 태그가 모여요.' : '링크를 모으면 제목에서 키워드를 뽑아요.', 'tag')}
  </div></div>`;
}

function renderWatch() {
  return `<div class="pl-scroll">
    <div class="pl-pane" style="padding-bottom:12px;border-bottom:1px solid var(--pl-divider);">
      <div class="pl-pane__head">
        <div class="pl-grow"><div class="pl-pane__title">채널·계정 워치리스트</div><div class="pl-caption">${watchCheckedAt ? '마지막 확인 ' + timeAgo(watchCheckedAt) : '아직 확인 전'} · 6시간마다 자동 확인</div></div>
        <button type="button" class="pl-btn pl-btn--sm" data-act="watchCheck">${icon('refresh', 'pl-i--sm')}지금 확인</button>
      </div>
    </div>
    ${watch.length ? watch.map((w, i) => {
      const delta = w.followers != null && w.prevFollowers != null ? w.followers - w.prevFollowers : null;
      const p = PLATFORMS[w.platform] || PLATFORMS.web;
      return `<div class="pl-watch">
        ${avatar(w.name, w.avatar, 'pl-av--lg')}
        <div class="pl-watch__body">
          <a class="pl-watch__name" href="${esc(w.url)}" target="_blank" rel="noopener">${w.platform === 'yt' ? ytLogo() : ''}${esc(w.name)}</a>
          <span class="pl-watch__sub">${w.platform === 'yt' ? `${p.follower} ${w.followers != null ? compactKo(w.followers) : '-'}${delta ? ` <span class="${delta > 0 ? 'pl-up' : ''}">${delta > 0 ? '+' : ''}${compactKo(delta)}</span>` : ''}` : '자동 확인은 유튜브만 지원해요'}</span>
        </div>
        ${w.fresh ? `<button type="button" class="pl-chip pl-chip--sm" data-act="watchSeen" data-val="${i}" title="확인함으로 표시">새 글 ${w.fresh}</button>` : ''}
        <button type="button" class="pl-ibtn pl-ibtn--sm pl-ibtn--muted" data-act="watchRemove" data-val="${i}" aria-label="워치리스트에서 빼기" title="워치리스트에서 빼기">${icon('close', 'pl-i--sm')}</button>
      </div>`;
    }).join('') : emptyState('워치리스트가 비어 있어요', '상세 보기에서 채널을 펼친 뒤 ‘워치리스트’를 누르세요.', 'eye')}
  </div>`;
}

// ------------------------------------------------------------------ frame
// ------------------------------------------------------------------ group headers
// Links sorted "채널별 묶기" and the recent screens (by day) get a header whenever the group changes.
// prev = the item rendered just before this slice (appendMore continues a group without repeating it).
const dayLabel = (at) => {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const t = +d0;
  return at >= t ? '오늘' : at >= t - 864e5 ? '어제' : at >= t - 6 * 864e5 ? '이번 주' : at >= t - 29 * 864e5 ? '이번 달' : '그 이전';
};
function linkGroupOf() { return S.sort === 'channel' ? chanName : null; }
function withGroups(items, prev, rowFn, groupOf, counts) {
  if (!groupOf) return items.map(rowFn).join('');
  let last = prev ? groupOf(prev) : null, html = '';
  for (const it of items) {
    const g = groupOf(it);
    if (g !== last) { html += `<div class="pl-group"><span class="pl-group__name">${esc(g || '기타')}</span>${counts ? `<span class="pl-group__n">${counts.get(g) || 0}개</span>` : ''}</div>`; last = g; }
    html += rowFn(it);
  }
  return html;
}
const groupCounts = (list) => (S.sort === 'channel' ? countBy(list, chanName) : null);
const countBy = (list, fn) => { const m = new Map(); for (const x of list) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); } return m; };

// ------------------------------------------------------------------ progressive list
// Long lists render PAGE rows first; a sentinel below the rows appends the next PAGE when it comes
// within 800px of the viewport. Keeps first paint fast and the DOM small (1,000 links used to mean
// ~150k nodes and every thumbnail fetched up front).
let moreObserver = null;
function watchMore() {
  if (moreObserver) moreObserver.disconnect();
  const el = app.querySelector('[data-more]');
  if (!el) return;
  moreObserver = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) appendMore(); }, { root: app.querySelector('.pl-scroll'), rootMargin: '800px 0px' });
  moreObserver.observe(el);
}
function appendMore() {
  const rows = app.querySelector('[data-rows]');
  if (!rows) return;
  let html = '', total = 0;
  if (S.tab === 'links') {
    const list = filtered(); total = list.length;
    html = withGroups(list.slice(S.limit, S.limit + PAGE), list[S.limit - 1], S.view === 'thumb' ? tile : S.view === 'detail' ? rowDetail : rowList, linkGroupOf(), groupCounts(list));
  } else if (S.tab === 'recent') {
    const list = recentFiltered(); total = list.length;
    const saved = new Set(links.map((l) => rkey(l.url)));
    html = withGroups(list.slice(S.limit, S.limit + PAGE), list[S.limit - 1], (r) => recentRow(r, saved), (r) => dayLabel(r.at));
  }
  S.limit += PAGE;
  rows.insertAdjacentHTML('beforeend', html);
  if (S.limit >= total) { const m = app.querySelector('[data-more]'); if (m) m.remove(); if (moreObserver) moreObserver.disconnect(); }
}
const resetLimit = () => { S.limit = PAGE; S.toTop = true; }; // new filter / sort / tab: start at the top

// Update the live panel to the new markup in place instead of replacing it (innerHTML).
// Storage and tab events re-render the panel several times a second (other profiles, titles, 'open'
// badges); replacing the rows under the pointer dropped their hover (buttons faded, cursor reset)
// and swallowed clicks whose press and release landed on different elements. Rows are matched by
// data-row (or id), so an unchanged row keeps its very elements, and a row that moved is moved.
// The focused text field is never touched: a Korean syllable being composed (IME) breaks when its
// input changes or goes away ('퀄리' → 'ㅋ쿼퀄퀄ㄹ리리').
const nodeKey = (n) => (n.nodeType === 1 ? (n.hasAttribute('data-row') ? n.tagName + '|r|' + n.getAttribute('data-row') : n.id ? n.tagName + '|#' + n.id : null) : null);
function morphChildren(cur, next) {
  const olds = [...cur.childNodes], keyed = new Map(), used = new Set();
  for (const o of olds) { const k = nodeKey(o); if (k) { if (!keyed.has(k)) keyed.set(k, []); keyed.get(k).push(o); } }
  let at = 0;
  [...next.childNodes].forEach((n, i) => {
    const k = nodeKey(n);
    let m = null;
    if (k) m = (keyed.get(k) || []).shift() || null;
    else while (at < olds.length) { const o = olds[at++]; if (!used.has(o) && !nodeKey(o) && o.nodeType === n.nodeType && o.nodeName === n.nodeName) { m = o; break; } }
    if (m) { used.add(m); morphNode(m, n); } else m = n;
    if (cur.childNodes[i] !== m) cur.insertBefore(m, cur.childNodes[i] || null);
  });
  for (const o of olds) if (!used.has(o) && o.parentNode === cur) o.remove();
}
function morphNode(cur, next) {
  if (cur.nodeType !== 1) { if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue; return; }
  const tag = cur.tagName;
  if ((tag === 'INPUT' || tag === 'TEXTAREA') && cur === document.activeElement) return;
  if (cur.isEqualNode(next)) return;
  for (const a of [...cur.attributes]) if (!next.hasAttribute(a.name)) cur.removeAttribute(a.name);
  for (const a of next.attributes) if (cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value);
  if (tag === 'INPUT') { cur.value = next.getAttribute('value') || ''; cur.checked = next.hasAttribute('checked'); return; }
  if (tag === 'TEXTAREA') { cur.value = next.textContent; return; }
  morphChildren(cur, next);
  if (tag === 'SELECT') { const o = next.querySelector('option[selected]') || next.querySelector('option'); if (o) cur.value = o.value; }
}

function render() {
  const active = document.activeElement;
  const refocus = active && active.id ? active.id : null;
  const selStart = active && active.selectionStart;
  // keep the list where the user left it (storage updates re-render the panel)
  if (!S.focusRow && active && active.dataset && active.dataset.row) S.focusRow = active.dataset.row; // keyboard focus survives re-render
  const prevScroll = app.querySelector('.pl-scroll');
  const keep = prevScroll ? { tab: S.tab, top: prevScroll.scrollTop } : null;
  const dark = currentTheme() === 'dark';
  // One header row only: Chrome already draws the panel title bar (icon · "Power Link v…" · pin · ✕)
  // above this page, so the page starts with the tabs and keeps its tool buttons on the same row.
  const html = `
    <header class="pl-tabs-row">
      <nav class="pl-tabs" role="tablist">
        ${[['links', '수집 링크', '수집', links.length], ['recent', '최근 화면', '최근', ''], ['keywords', '키워드', '키워드', ''], ['watch', '워치리스트', '워치', watch.length]].map(([id, l, s, n]) => `<button type="button" role="tab" class="pl-tab" aria-selected="${S.tab === id}" data-act="tab" data-val="${id}" title="${l}"><span class="pl-tab__full">${l}</span><span class="pl-tab__short">${s}</span>${n !== '' ? `<span class="pl-tab__n">${n}</span>` : ''}</button>`).join('')}
      </nav>
      <div class="pl-sp__tools">
        <button type="button" class="pl-ibtn pl-ibtn--sm" data-act="collectWin" aria-label="현재 창의 링크 모으기" title="현재 창의 링크 모으기">${icon('collect', 'pl-i--lg')}</button>
        <button type="button" class="pl-ibtn pl-ibtn--sm" data-act="marksToggle" aria-pressed="${!showMarks}" aria-label="${showMarks ? '페이지 선택 표시 숨기기' : '페이지 선택 표시 보이기'}" title="${showMarks ? '페이지 선택 표시 숨기기' : '페이지 선택 표시 보이기'} (Alt+Shift+M)">${icon(showMarks ? 'eye' : 'eyeOff', 'pl-i--lg')}</button>
        <button type="button" class="pl-ibtn pl-ibtn--sm" data-act="theme" aria-label="${dark ? '밝은 테마로 전환' : '어두운 테마로 전환'}" title="${dark ? '밝은 테마로 전환' : '어두운 테마로 전환'}">${icon(dark ? 'sun' : 'moon', 'pl-i--lg')}</button>
        <button type="button" class="pl-ibtn pl-ibtn--sm" data-act="options" aria-label="설정" title="설정">${icon('sliders', 'pl-i--lg')}</button>
      </div>
    </header>
    ${S.tab === 'links' ? renderLinks() : S.tab === 'recent' ? renderRecent() : S.tab === 'keywords' ? renderKeywords() : renderWatch()}`;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  morphChildren(app, tmp);
  if (refocus === 'q' || refocus === 'rq') { const el = app.querySelector('#' + refocus); if (el && el !== document.activeElement) { el.focus(); if (selStart != null) el.setSelectionRange(selStart, selStart); } }
  const sc = app.querySelector('.pl-scroll');
  if (sc) sc.scrollTop = keep && keep.tab === S.tab && !S.toTop ? keep.top : 0;
  S.toTop = false;
  if (S.focusRow && refocus !== 'q' && refocus !== 'rq' && (document.activeElement === document.body || !document.activeElement)) {
    const el = [...app.querySelectorAll('[data-row]')].find((r) => r.dataset.row === S.focusRow);
    if (el) el.focus({ preventScroll: true });
  }
  S.focusRow = null;
  watchMore();
}

// ------------------------------------------------------------------ actions
// ------------------------------------------------------------------ 영상 다운로드 (universal-downloader 서버)
function dlStrip() {
  if (!dlJob) return '';
  const b = dlJob, c = b.counts || {}, done = b.status === 'done';
  const label = done
    ? `다운로드 완료 · 성공 ${c.completed || 0}개${c.error ? ` · 실패 ${c.error}개` : ''}`
    : `다운로드 중 ${Math.round(b.progress || 0)}% · 완료 ${c.completed || 0}/${b.total}${c.error ? ` · 실패 ${c.error}` : ''}`;
  const where = b.save_dir || '서버 기본 폴더';
  const failed = done && c.error ? (b.items || []).filter((it) => it.status === 'error' || it.status === 'failed').slice(0, 3)
    .map((it) => `<div class="pl-dl__err pl-trunc" title="${esc(it.error || '')}">${esc((it.error || '실패').replace(/\[[0-9;]*m/g, '').replace(/^ERROR:\s*/i, ''))}</div>`).join('') : '';
  return `<div class="pl-dl ${done ? (c.error ? 'is-warn' : 'is-done') : ''}" role="status" aria-live="polite">
    <div class="pl-dl__head">${icon(done ? (c.error ? 'info' : 'check') : 'filmDown', 'pl-i--sm')}<span class="pl-dl__label pl-trunc">${label}</span>
      <button type="button" class="pl-ibtn pl-ibtn--sm pl-ibtn--muted" data-act="dlHide" aria-label="닫기" title="닫기">${icon('close', 'pl-i--sm')}</button></div>
    <div class="pl-dl__meter"><span style="width:${Math.min(100, Math.round(b.progress || 0))}%"></span></div>
    <div class="pl-dl__where pl-trunc" title="${esc(where)}">저장 위치: ${esc(where)}</div>${failed}
  </div>`;
}

const dlFetched = new Set(); // 이미 내 PC 로 가져온 task_id
async function dlFetchDone(batch) {
  const r = await send({ type: 'pl:dlShouldFetch' });
  if (!r || !r.fetch) return;
  for (const it of batch.items || []) {
    if (it.status !== 'completed' || dlFetched.has(it.task_id)) continue;
    dlFetched.add(it.task_id);
    send({ type: 'pl:dlFetchFile', taskId: it.task_id, filename: (it.file_path || '').split(/[\\/]/).pop() });
  }
}
function dlPatch(batch) {
  dlJob = batch; render();
  dlFetchDone(batch);
  if (batch.status === 'done') {
    clearTimeout(dlTimer); dlTimer = 0;
    const c = batch.counts || {};
    toast(c.error ? `다운로드 끝 · 성공 ${c.completed || 0}개, 실패 ${c.error}개` : `영상 ${c.completed || 0}개를 다운로드했어요`, c.error ? 'error' : 'success');
    // 받은 링크에 시각을 남긴다 (엑셀 내보내기·정렬에 활용)
    const okUrls = new Set((batch.items || []).filter((it) => it.status === 'completed').map((it) => it.url));
    const now = new Date().toISOString();
    const patches = links.filter((l) => okUrls.has(l.url)).map((l) => ({ id: l.id, downloadedAt: now }));
    if (patches.length) updateLinks(patches);
  }
}

async function dlPoll() {
  if (!dlJob || dlJob.status === 'done') return;
  const r = await send({ type: 'pl:dlStatus', id: dlJob.batch_id });
  if (r.ok) dlPatch(r.batch);
  if (dlJob && dlJob.status !== 'done') dlTimer = setTimeout(dlPoll, 2000);
}

async function downloadItems(items) {
  const targets = items.filter(isDownloadable);
  const skipped = items.length - targets.length;
  if (!targets.length) { toast('다운로드할 영상 링크가 없어요 (유튜브·틱톡·비메오·빌리빌리 게시물)', 'error'); return; }
  const dl = settings.dl || {};
  const modeLabel = { both: '영상+음성', video: '영상만', audio: '음성만' }[dl.mode] || '영상+음성';
  const lines = [`저장 위치: ${dl.saveDir || '서버 기본 폴더'}`, `${modeLabel}${dl.quality ? ` · 최대 ${dl.quality}p` : ' · 최고 화질'}`];
  if (skipped) lines.push(`영상이 아닌 링크 ${skipped}개는 건너뛰어요`);
  if (!(await confirmModal({ title: `영상 ${targets.length}개 다운로드`, message: lines.join('\n'), ok: '다운로드' }))) return;
  const r = await send({ type: 'pl:dlBatch', urls: targets.map((l) => l.url) });
  if (!r.ok) { toast(r.message || '다운로드를 시작하지 못했어요', 'error', { label: '설정', run: () => chrome.runtime.openOptionsPage() }); return; }
  clearTimeout(dlTimer);
  dlPatch(r.batch);
  dlTimer = setTimeout(dlPoll, 1500);
}

// Bulk actions apply to the selection, or to every visible link when nothing is selected.
const selected = () => (S.sel.size ? links.filter((l) => S.sel.has(l.id)) : filtered());
const targetIds = () => selected().map((l) => l.id);
const report = (r) => toast(r?.message || (r?.ok ? '완료했어요' : '처리하지 못했어요'), r?.ok ? 'success' : 'error');

// Memo: add / edit / delete in a modal (one field, room for several lines)
async function editMemo(id) {
  const it = links.find((l) => l.id === id);
  if (!it) return;
  const r = await memoModal({ subject: it.title || it.url, value: it.memo || '' });
  if (r.action === 'save') {
    if ((r.value || '') === (it.memo || '')) return;
    await updateLink(id, { memo: r.value });
    toast(r.value ? (it.memo ? '메모를 수정했어요' : '메모를 추가했어요') : '메모를 지웠어요');
  } else if (r.action === 'delete') {
    await updateLink(id, { memo: '' });
    toast('메모를 삭제했어요');
  }
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

// All thumbnails in one ZIP (one download instead of a save dialog per image).
// File name inside the ZIP: video title for posts, channel/account name for channel links.
async function fetchImage(urls) {
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length < 1200 && /i\.ytimg\.com/.test(u)) continue; // YouTube's grey "no image" placeholder
      const type = r.headers.get('content-type') || '';
      const ext = /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /gif/.test(type) ? 'gif' : 'jpg';
      return { buf, ext };
    } catch (e) { /* try next */ }
  }
  return null;
}
async function saveThumbsZip(items) {
  const list = items.filter((l) => l.thumb || l.ids?.videoId);
  if (!list.length) { toast('저장할 썸네일이 없어요', 'warning'); return; }
  toast(`썸네일 ${list.length}개를 모으는 중…`, 'warning');
  const used = new Map();
  const files = [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const it = list[i++];
      const vid = it.ids?.videoId;
      const urls = vid && it.kind !== 'account'
        ? [`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${vid}/sddefault.jpg`, it.thumb, `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`]
        : [it.thumb];
      const img = await fetchImage(urls.filter(Boolean));
      if (!img) continue;
      const base = safeFileName(it.kind === 'account' ? (it.account?.name || it.title) : (it.title || it.account?.name), 'thumbnail');
      files.push({ order: list.indexOf(it), base, ext: img.ext, data: img.buf });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
  if (!files.length) { toast('썸네일을 가져오지 못했어요', 'error'); return; }
  files.sort((a, b) => a.order - b.order);
  for (const f of files) { // number duplicates in list order: 제목.jpg, 제목 (2).jpg …
    const n = (used.get(f.base) || 0) + 1;
    used.set(f.base, n);
    f.name = `${n > 1 ? `${f.base} (${n})` : f.base}.${f.ext}`;
  }
  const url = URL.createObjectURL(makeZip(files));
  const d = new Date(), p = (x) => String(x).padStart(2, '0');
  const filename = `PowerLink_썸네일_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`;
  try {
    await chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' });
  } catch (e) {
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  const miss = list.length - files.length;
  toast(`썸네일 ${files.length}개를 압축 파일 하나로 저장했어요${miss ? ` (${miss}개는 가져오지 못함)` : ''}`);
}

// Delete without asking first: the toast offers 되돌리기 for 6 seconds. Undo puts the removed links
// back at their old positions (changes made meanwhile, e.g. details arriving, are kept).
async function deleteLinks(ids) {
  if (!ids.length) return;
  const set = new Set(ids);
  const removed = links.map((l, i) => [i, l]).filter(([, l]) => set.has(l.id));
  await removeLinks(ids);
  ids.forEach((id) => S.sel.delete(id));
  toast(`${removed.length}개를 목록에서 삭제했어요`, 'success', {
    label: '되돌리기',
    run: async () => {
      const cur = await getLinks();
      const have = new Set(cur.map((l) => l.id));
      for (const [i, l] of removed) if (!have.has(l.id)) cur.splice(Math.min(i, cur.length), 0, l);
      await setLinks(cur);
      toast('삭제를 되돌렸어요');
    }
  });
}

// 컬렉션: links carry coll = collection id; collections live in storage.local
async function saveCollections(list) { collections = list; await chrome.storage.local.set({ [STORAGE.collections]: list }); }
async function assignCollection(ids) {
  if (!ids.length) return;
  const items = links.filter((l) => ids.includes(l.id));
  const common = items.every((l) => l.coll && l.coll === items[0].coll) ? items[0].coll : '';
  const r = await collectionModal({ collections, count: ids.length, current: common });
  if (!r) return;
  let id = r.id, name = '';
  if (r.remove) id = '';
  else if (!id) {
    name = r.name;
    const found = collections.find((c) => c.name === name);
    id = found ? found.id : 'c' + Date.now().toString(36);
    if (!found) await saveCollections(collections.concat({ id, name }));
  }
  await updateLinks(ids.map((i) => ({ id: i, coll: id })));
  const cname = id ? (collections.find((c) => c.id === id) || { name }).name : '';
  toast(id ? `‘${cname}’ 컬렉션에 ${ids.length}개를 넣었어요` : `${ids.length}개를 컬렉션에서 뺐어요`);
}

// 사이트별 정렬: inside every window, group unpinned tabs by site (then title). Nothing is closed.
async function sortTabsBySite() {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  let moved = 0;
  for (const w of wins) {
    const tabs = (w.tabs || []).filter((t) => !t.pinned);
    const base = (w.tabs || []).filter((t) => t.pinned).length;
    const sorted = [...tabs].sort((a, b) => hostOf(a.url || '').localeCompare(hostOf(b.url || '')) || (a.index - b.index));
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].index !== base + i) { await chrome.tabs.move(sorted[i].id, { index: base + i }); moved++; }
    }
  }
  toast(moved ? '탭을 사이트별로 정렬했어요' : '이미 사이트별로 정렬돼 있어요');
}

async function bookmark(items) {
  const [root] = await chrome.bookmarks.search({ title: 'Power Link' });
  const folder = root && !root.url ? root : await chrome.bookmarks.create({ title: 'Power Link' });
  for (const it of items) await chrome.bookmarks.create({ parentId: folder.id, title: it.title || it.url, url: it.url });
  toast(`북마크 ‘Power Link’ 폴더에 ${items.length}개를 추가했어요`);
}

// Header button: collect the links of every tab in the current window, using the popup's
// platform / kind choices, and store them in the list.
async function collectWindow() {
  const p = settings.popup || {};
  toast('현재 창의 링크를 모으는 중…', 'warning');
  report(await send({ type: 'pl:collectTabs', action: 'save', scope: 'window', plats: p.plats || ['all'], kinds: p.kinds && p.kinds.length ? p.kinds : ['all'], after: 'keep', sort: 'none', mode: settings.collect }));
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.tagName === 'SELECT') return;
  const act = t.dataset.act, id = t.dataset.id, val = t.dataset.val;
  switch (act) {
    case 'tab': S.tab = val; resetLimit(); if (val === 'recent') { await refreshOpenTabs(); send({ type: 'pl:recentSeed' }); } break;
    case 'collectWin': await collectWindow(); return;
    case 'theme': await setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); break;
    case 'closePanel': window.close(); return;
    case 'rsort': S.rsort = val; resetLimit(); break;
    case 'rprof': S.rprof = val; resetLimit(); break;
    case 'rGo':
      if (t.dataset.pid) await goRecentOther(val, t.dataset.pid, t.dataset.on === '1', t.dataset.name || '다른 프로필');
      else await goRecent(val);
      return;
    case 'rDel':
      if (t.dataset.pid) {
        const pid = t.dataset.pid, on = t.dataset.on === '1';
        if (on) hideRecent(pid, val);
        const r = await send({ type: 'pl:bridgeSend', target: pid, command: { type: 'forget', url: val } });
        if (!r.ok) { goneRecent.delete(goneKey(pid, val)); render(); }
        toast(r.ok ? (on ? '삭제를 요청했어요' : '오프라인 프로필이에요 — 다시 접속하면 삭제돼요') : r.message || '삭제를 요청하지 못했어요', r.ok ? 'success' : 'error');
      } else {
        hideRecent('', val);
        await send({ type: 'pl:recentForget', urls: [val] });
      }
      return;
    case 'rClose':
      if (t.dataset.pid) { // another profile: ask it to close its tab and forget the screen
        hideRecent(t.dataset.pid, val);
        const c = await send({ type: 'pl:bridgeSend', target: t.dataset.pid, command: { type: 'close', url: val } });
        if (c.ok) await send({ type: 'pl:bridgeSend', target: t.dataset.pid, command: { type: 'forget', url: val } });
        if (!c.ok) { goneRecent.delete(goneKey(t.dataset.pid, val)); render(); }
        toast(c.ok ? `‘${t.dataset.name || '다른 프로필'}’ 프로필의 탭을 닫고 목록에서 삭제했어요` : c.message || '닫기를 요청하지 못했어요', c.ok ? 'success' : 'error');
        return;
      }
      await closeRecent(val); await refreshOpenTabs(); break;
    case 'rDedupe':
      if (!(await confirmModal({ title: '중복 링크 닫기', message: '중복된 링크를 닫고 1개만 남깁니다.\n이 프로필에 열린 탭을 우선으로 남기고 나머지는 닫아요.', ok: '예', cancel: '아니요' }))) return;
      await closeDuplicates(); break;
    case 'rAdd': { const r = recentMerged().find((x) => rkey(x.url) === rkey(val)); if (r) report(await send({ type: 'pl:recentAdd', items: [{ url: r.url, title: r.title }] })); return; }
    case 'rBridgeRetry': {
      toast('도우미에 연결하는 중…', 'warning');
      await send({ type: 'pl:bridgeReconnect' });
      setTimeout(async () => {
        const b = (await chrome.storage.local.get(STORAGE.bridge))[STORAGE.bridge];
        if (!b || !b.connected) toast('연결하지 못했어요 — native-host\\install.bat 실행 여부를 확인해 주세요', 'error');
      }, 1500);
      return;
    }
    case 'platform': S.platform = val; resetLimit(); break;
    case 'view': S.view = val; resetLimit(); setSettings({ sidepanel: { view: val } }); break;
    case 'toggleAll': S.allOpen = !S.allOpen; S.open.clear(); break;
    case 'expand': if (S.allOpen) { S.allOpen = false; filtered().forEach((l) => S.open.add(l.id)); } S.open.has(id) ? S.open.delete(id) : S.open.add(id); break;
    case 'sel': S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); break;
    case 'selAll': { const list = filtered(); const all = list.every((l) => S.sel.has(l.id)); list.forEach((l) => (all ? S.sel.delete(l.id) : S.sel.add(l.id))); break; }
    case 'memo': await editMemo(id); return;
    case 'watchOne': report(await send({ type: 'pl:watchAdd', ids: [id] })); return;
    case 'options': chrome.runtime.openOptionsPage(); return;
    case 'bCopy': { const r = await send({ type: 'pl:copyItems', ids: targetIds() }); if (r.ok && r.copyPayload && !(await writeClipboard(r.copyPayload.text, r.copyPayload.html))) { toast('클립보드에 복사하지 못했어요', 'error'); return; } report(r); return; }
    case 'bOpen': { const urls = selected().map((l) => l.url); if (urls.length > (settings.confirmOver || 20) && !(await confirmModal({ title: '새 탭으로 열기', message: `탭 ${urls.length}개를 새로 열까요?`, ok: '열기' }))) return; await send({ type: 'pl:openUrls', urls }); return; }
    case 'bThumbs': await saveThumbsZip(selected()); return;
    case 'bWatch': report(await send({ type: 'pl:watchAdd', ids: targetIds() })); return;
    case 'bBookmark': await bookmark(selected()); return;
    case 'bExcel': downloadXls(selected()); toast('엑셀 파일을 저장했어요'); return;
    case 'bDelete': await deleteLinks(targetIds()); return;
    case 'bDownload': await downloadItems(selected()); return;
    case 'dlHide': clearTimeout(dlTimer); dlTimer = 0; dlJob = null; break;
    case 'bColl': await assignCollection(targetIds()); return;
    case 'hot': S.hot = !S.hot; resetLimit(); break;
    case 'marksToggle': await chrome.storage.local.set({ [STORAGE.showMarks]: !showMarks }); return;
    case 'rSortSites': await sortTabsBySite(); await refreshOpenTabs(); break;
    case 'bClear': S.sel.clear(); break;
    case 'kwSource': S.kwSource = val; break;
    case 'kwFilter': S.q = val; S.tab = 'links'; resetLimit(); break;
    case 'kwCopy': { const kws = keywordStats(links, S.kwSource, 20).map((k) => k.word).join(', '); const ok = await writeClipboard(kws); toast(ok ? '키워드를 복사했어요' : '클립보드에 복사하지 못했어요', ok ? 'success' : 'error'); return; }
    case 'watchCheck': toast('확인하는 중…', 'warning'); report(await send({ type: 'pl:watchCheck' })); return;
    case 'watchRemove': watch.splice(+val, 1); await setWatch(watch); return;
    case 'watchSeen': watch[+val].fresh = 0; await setWatch(watch); return;
    default: return;
  }
  render();
});

let searchTimer = 0;
app.addEventListener('input', (e) => {
  // search re-renders once typing pauses (150ms), not on every keystroke
  if (e.target.id === 'q') { S.q = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { resetLimit(); render(); }, 150); }
  if (e.target.id === 'rq') { S.rq = e.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { resetLimit(); render(); }, 150); }
});
app.addEventListener('change', async (e) => {
  if (e.target.id === 'cat') { S.cat = e.target.value; resetLimit(); render(); }
  if (e.target.id === 'kind') { S.kind = e.target.value; resetLimit(); render(); }
  if (e.target.id === 'sort') { S.sort = e.target.value; resetLimit(); render(); }
  if (e.target.id === 'coll') { S.coll = e.target.value; resetLimit(); render(); }
  if (e.target.dataset.act === 'cat') await updateLink(e.target.dataset.id, { category: e.target.value });
});

// ------------------------------------------------------------------ keyboard
// /  search · ↑↓ (j/k) move · Space select · Enter open · Delete remove (undo in the toast)
// Esc clear selection / leave search · Ctrl+A select all (수집 링크)
const typing = (el) => !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type)));
const rowEls = () => [...app.querySelectorAll('[data-row]')];
function focusRow(el) { if (!el) return; el.focus(); el.scrollIntoView({ block: 'nearest' }); }
document.addEventListener('keydown', async (e) => {
  if (document.querySelector('.pl-sheet') || e.isComposing) return; // a modal handles its own keys
  const t = e.target;
  const search = () => app.querySelector('#q, #rq');
  if (e.key === '/' && !typing(t)) { e.preventDefault(); const q = search(); if (q) { q.focus(); q.select(); } return; }
  if (typing(t)) {
    if ((t.id === 'q' || t.id === 'rq') && e.key === 'Escape') t.blur();
    if ((t.id === 'q' || t.id === 'rq') && e.key === 'ArrowDown') { e.preventDefault(); focusRow(rowEls()[0]); }
    return;
  }
  if (S.tab !== 'links' && S.tab !== 'recent') return;
  const rows = rowEls();
  const cur = t.closest && t.closest('[data-row]');
  const i = cur ? rows.indexOf(cur) : -1;
  if (e.key === 'ArrowDown' || e.key === 'j') {
    e.preventDefault();
    if (i >= rows.length - 1) appendMore();
    const all = rowEls(); focusRow(all[Math.min(i + 1, all.length - 1)]);
  } else if (e.key === 'ArrowUp' || e.key === 'k') {
    e.preventDefault();
    if (i <= 0) { const q = search(); if (q) q.focus(); } else focusRow(rows[i - 1]);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && S.tab === 'links') {
    e.preventDefault(); filtered().forEach((l) => S.sel.add(l.id)); render();
  } else if (e.key === 'Escape') {
    if (S.sel.size) { S.sel.clear(); render(); }
  } else if (cur && e.key === ' ' && S.tab === 'links') {
    e.preventDefault();
    const id = cur.dataset.row; S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); render();
  } else if (cur && e.key === 'Enter' && t === cur) {
    e.preventDefault();
    if (S.tab === 'links') { const it = links.find((l) => l.id === cur.dataset.row); if (it) chrome.tabs.create({ url: it.url, active: true }); }
    else cur.querySelector('[data-act="rGo"]').click();
  } else if (cur && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault();
    const next = rows[i + 1] || rows[i - 1];
    S.focusRow = next ? next.dataset.row : null;
    if (S.tab === 'links') await deleteLinks(S.sel.size ? [...S.sel] : [cur.dataset.row]);
    else cur.querySelector('[data-act="rDel"]').click();
  }
});

chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area === 'local' && ch[STORAGE.links]) { links = ch[STORAGE.links].newValue || []; const ids = new Set(links.map((l) => l.id)); [...S.sel].forEach((i) => ids.has(i) || S.sel.delete(i)); render(); kickEnrich(); }
  if (area === 'local' && ch[STORAGE.apiKey]) { hasKey = !!ch[STORAGE.apiKey].newValue; render(); kickEnrich(); }
  if (area === 'local' && ch[STORAGE.recent]) {
    recent = ch[STORAGE.recent].newValue || [];
    // a deleted screen is gone from the stored list now: stop hiding it (visiting it again brings it back)
    if (goneRecent.size) { const have = new Set(recent.map((r) => goneKey('', r.url))); [...goneRecent.keys()].forEach((k) => k.startsWith('|') && !have.has(k) && goneRecent.delete(k)); }
    if (S.tab === 'recent') render();
  }
  if (area === 'local' && ch[STORAGE.recentOthers]) { recentOthers = ch[STORAGE.recentOthers].newValue || { profiles: [] }; if (S.tab === 'recent') render(); }
  if (area === 'local' && ch[STORAGE.bridge]) { bridge = ch[STORAGE.bridge].newValue || null; if (S.tab === 'recent') render(); }
  if (area === 'local' && ch[STORAGE.watch]) { watch = ch[STORAGE.watch].newValue || []; if (S.tab === 'watch') render(); }
  if (area === 'local' && ch[STORAGE.collections]) { collections = ch[STORAGE.collections].newValue || []; if (S.tab === 'links') render(); }
  if (area === 'local' && ch[STORAGE.showMarks]) { showMarks = ch[STORAGE.showMarks].newValue !== false; render(); }
  if (area === 'local' && ch.pl_theme) render(); // header icon follows the theme
  if (area === 'local' && ch.pl_watchCheckedAt) watchCheckedAt = ch.pl_watchCheckedAt.newValue;
  if (area === 'sync' && ch[STORAGE.settings]) { settings = await getSettings(); render(); }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());

// keep the 'open' badges current while the recent tab is showing
let tabsTimer = 0;
const onTabsChange = () => { if (S.tab !== 'recent') return; clearTimeout(tabsTimer); tabsTimer = setTimeout(async () => { await refreshOpenTabs(); render(); }, 150); };
chrome.tabs.onRemoved.addListener(onTabsChange);
chrome.tabs.onCreated.addListener(onTabsChange);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.status === 'complete') onTabsChange(); });

(async function init() {
  settings = await getSettings();
  S.view = settings.sidepanel?.view || 'list';
  [links, watch] = await Promise.all([getLinks(), getWatch()]);
  recent = (await chrome.storage.local.get(STORAGE.recent))[STORAGE.recent] || [];
  recentOthers = (await chrome.storage.local.get(STORAGE.recentOthers))[STORAGE.recentOthers] || { profiles: [] };
  { const r = await chrome.storage.local.get([STORAGE.collections, STORAGE.showMarks]); collections = r[STORAGE.collections] || []; showMarks = r[STORAGE.showMarks] !== false; }
  bridge = (await chrome.storage.local.get(STORAGE.bridge))[STORAGE.bridge] || null;
  ({ pl_watchCheckedAt: watchCheckedAt } = await chrome.storage.local.get('pl_watchCheckedAt'));
  await themeReady;
  render();                       // screen first
  hasKey = !!(await getApiKey());  // then details, asynchronously
  if (hasKey) { render(); kickEnrich(); }
})();
