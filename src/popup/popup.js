// Power Link — popup (design/graphite/Popup.dc.html)
import { getSettings, setSettings, getLinks } from '../shared/storage.js';
import { MODIFIERS } from '../shared/constants.js';
import { esc } from '../shared/util.js';
import { icon, logo, version, send, toast, writeClipboard } from '../ui/ui.js';
import { themeReady } from '../ui/theme.js';

const app = document.getElementById('app');
let settings, linkCount = 0, tabCounts = { current: 1, window: 0, all: 0 }, busy = false;

const PLATS = [['all', '전체'], ['yt', '유튜브'], ['tt', '틱톡'], ['ig', '인스타'], ['x', 'X'], ['blog', '블로그']];
const PLAT_NAME = { yt: '유튜브', tt: '틱톡', ig: '인스타그램', x: 'X', blog: '블로그' };
const KINDS = [['post', '영상·게시물'], ['account', '채널·계정'], ['all', '모든 링크']];
const SCOPES = [['current', '현재 탭'], ['window', '현재 창'], ['all', '모든 창']];
const CONTENT = [['link', '링크만'], ['title', '링크 + 제목'], ['detail', '상세 정보']];
const AFTER = [['keep', '그대로'], ['close', '탭 닫기'], ['move', '새 창으로']];
const SORT = [['none', '안 함'], ['domain', '도메인별 창'], ['one', '한 창으로']];

// the kind segment is single-choice; stored kinds stay an array for the background
const kindOf = (kinds) => (kinds.includes('all') || (kinds.includes('post') && kinds.includes('account')) ? 'all' : kinds.includes('account') ? 'account' : 'post');
const seg = (list, cur, attr, label, count) => `<div class="pl-seg pl-seg--fill" role="group" aria-label="${label}">${list.map(([id, l]) => `<button type="button" class="pl-seg__item" aria-pressed="${cur === id}" ${attr}="${id}">${l}${count && cur === id && id !== 'current' && count[id] ? ` · ${count[id]}` : ''}</button>`).join('')}</div>`;
const tsel = (id, list, cur, label) => `<label class="pl-tsel pl-tsel--sm"><select id="${id}" aria-label="${label}">${list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${icon('chevron', 'pl-i--xs')}</label>`;

function summary(p) {
  const scope = { current: '현재 탭', window: `현재 창의 탭 ${tabCounts.window}개`, all: `모든 창의 탭 ${tabCounts.all}개` }[p.scope];
  const plat = p.plats.includes('all') ? '' : p.plats.map((x) => PLAT_NAME[x]).join('·') + ' ';
  const kind = { post: '영상·게시물', account: '채널·계정', all: '모든' }[kindOf(p.kinds)];
  const how = { link: '주소만', title: '제목과 함께', detail: '상세 정보까지' }[settings.collect] || '';
  return `${esc(scope)}에서 <b>${esc(plat + kind)}</b> 링크를 ${how} 모아요.`;
}

function render() {
  const p = settings.popup;
  const mods = [...new Set(settings.rules.filter((r) => r.enabled !== false && MODIFIERS[r.mod]).map((r) => r.mod))];
  app.innerHTML = `
  <header class="pl-pop__head">
    ${logo(24, 1.1)}
    <span class="pl-sp__name">Power Link</span>
    <span class="pl-sp__ver">v${version()}</span>
    <div class="pl-sp__tools">
      <button type="button" class="pl-ibtn" id="openPanel" aria-label="사이드바 열기" title="사이드바 열기">${icon('sidebar', 'pl-i--lg')}</button>
      <button type="button" class="pl-ibtn" id="openOptions" aria-label="설정" title="설정">${icon('sliders', 'pl-i--lg')}</button>
    </div>
  </header>
  <main class="pl-pop__main">
    <div class="pl-pop__field"><span class="pl-label">범위</span>${seg(SCOPES, p.scope, 'data-set="scope" data-val', '범위', tabCounts)}</div>
    <div class="pl-pop__field"><span class="pl-label">플랫폼</span>
      <div class="pl-pop__chips">${PLATS.map(([id, l]) => `<button type="button" class="pl-chip" aria-pressed="${p.plats.includes(id)}" data-plat="${id}">${l}</button>`).join('')}</div>
    </div>
    <div class="pl-pop__field"><span class="pl-label">종류</span>${seg(KINDS, kindOf(p.kinds), 'data-kindone', '종류')}</div>
    <div class="pl-pop__field"><span class="pl-label">담을 정보</span>${seg(CONTENT, settings.collect, 'data-collect', '담을 정보')}</div>
    <p class="pl-pop__sum">${summary(p)}</p>
    <div class="pl-pop__cta">
      <button type="button" class="pl-btn pl-btn--xl" id="doSave">${icon('bookmark', 'pl-i--md')}목록에 저장</button>
      <button type="button" class="pl-btn pl-btn--xl pl-btn--ink" id="doCopy">${icon('copy', 'pl-i--md')}복사</button>
    </div>
    <div class="pl-pop__tabs">수집 후 탭${tsel('after', AFTER, p.after, '수집 후 탭')}<span class="pl-grow"></span>탭 정렬${tsel('sort', SORT, p.sort, '탭 정렬')}</div>
    <div class="pl-pop__hint">
      ${mods.length ? mods.map((m) => `<kbd class="pl-kbd">${MODIFIERS[m]}</kbd>`).join('') + '<span>+ 우클릭 드래그로도 모아요</span>' : '<span>마우스 수집 규칙이 모두 꺼져 있어요</span>'}
      <button type="button" class="pl-link" id="editRules">규칙</button>
    </div>
  </main>
  <footer class="pl-pop__foot">
    <span>사이드바</span><span style="color:var(--pl-text2)">Alt + Shift + L</span>
    <span class="pl-grow"></span>
    <span>수집 링크 <b id="linkCount">${linkCount}</b></span>
  </footer>`;
}

async function savePopup(patch) {
  settings.popup = Object.assign({}, settings.popup, patch);
  render();
  await setSettings({ popup: settings.popup });
}

app.addEventListener('change', (e) => {
  if (e.target.id === 'after' || e.target.id === 'sort') savePopup({ [e.target.id]: e.target.value });
});

app.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.set) return savePopup({ [t.dataset.set]: t.dataset.val });
  if (t.dataset.collect) { settings.collect = t.dataset.collect; render(); return setSettings({ collect: settings.collect }); }
  if (t.dataset.kindone) return savePopup({ kinds: [t.dataset.kindone] });
  if (t.dataset.plat) {
    const id = t.dataset.plat;
    let plats = settings.popup.plats.filter((x) => x !== 'all');
    if (id === 'all') plats = ['all'];
    else plats = plats.includes(id) ? plats.filter((x) => x !== id) : plats.concat(id);
    return savePopup({ plats: plats.length ? plats : ['all'] });
  }
  if (t.id === 'openPanel') {
    const win = await chrome.windows.getCurrent();
    try { await chrome.sidePanel.open({ windowId: win.id }); window.close(); } catch (err) { toast('사이드바를 열 수 없어요: ' + err.message, 'error'); }
    return;
  }
  if (t.id === 'openOptions' || t.id === 'editRules') { chrome.runtime.openOptionsPage(); return; }
  if ((t.id === 'doCopy' || t.id === 'doSave') && !busy) {
    busy = true;
    const label = t.innerHTML;
    t.disabled = true;
    t.textContent = '수집 중…';
    const p = settings.popup;
    const res = await send({ type: 'pl:collectTabs', action: t.id === 'doCopy' ? 'copy' : 'save', scope: p.scope, plats: p.plats, kinds: p.kinds, after: p.after, sort: p.sort, mode: settings.collect });
    if (res.ok && res.copyPayload && !(await writeClipboard(res.copyPayload.text, res.copyPayload.html))) { res.ok = false; res.message = '클립보드에 복사하지 못했어요'; }
    busy = false;
    t.disabled = false;
    t.innerHTML = label;
    toast(res.ok ? res.message + (res.note ? ` (${res.note})` : '') : res.message, res.ok ? (res.note ? 'warning' : 'success') : 'error');
    linkCount = (await getLinks()).length;
    const b = document.getElementById('linkCount');
    if (b) b.textContent = linkCount;
  }
});

(async function init() {
  settings = await getSettings();
  if (!settings.popup.kinds || !settings.popup.kinds.length) settings.popup.kinds = ['post'];
  linkCount = (await getLinks()).length;
  const [all, win] = await Promise.all([chrome.tabs.query({}), chrome.tabs.query({ currentWindow: true })]);
  tabCounts = { current: 1, window: win.length, all: all.length };
  await themeReady;
  render();
})();
