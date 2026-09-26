// Power Link — popup
import { getSettings, setSettings, getLinks, getApiKey } from '../shared/storage.js';
import { ACTIONS, MODIFIERS } from '../shared/constants.js';
import { esc } from '../shared/util.js';
import { icon, version, send, toast, writeClipboard } from '../ui/ui.js';

const app = document.getElementById('app');
let settings, linkCount = 0, hasKey = false, tabCount = 0, busy = false;

const PLATS = [['all', '전체'], ['yt', '유튜브'], ['tt', '틱톡'], ['ig', '인스타'], ['x', 'X'], ['blog', '블로그']];
const PLAT_NAME = { yt: '유튜브', tt: '틱톡', ig: '인스타그램', x: 'X', blog: '블로그' };
const KINDS = [['post', '게시물·영상'], ['account', '채널·계정'], ['all', '모든 링크']];
const SCOPES = [['current', '현재 탭'], ['window', '현재 창'], ['all', '모든 창']];
const CONTENT = [['link', '링크만'], ['title', '링크+제목'], ['detail', '상세 정보']];
const CONTENT_HINT = { link: '주소만 모아요', title: '제목 함께', detail: '항목은 설정에서' };
const AFTER = [['keep', '그대로'], ['close', '탭 닫기'], ['move', '새 창으로']];
const SORT = [['none', '안 함'], ['domain', '도메인별 창'], ['one', '한 창으로']];
const SHAPE = { box: '박스', lasso: '자유도형' };

const seg = (list, cur, key) => `<div class="pl-seg pl-seg--grow">${list.map(([id, l]) => `<button type="button" class="pl-seg__item" aria-pressed="${cur === id}" data-set="${key}" data-val="${id}">${l}</button>`).join('')}</div>`;

function summary(p) {
  const scope = { current: '현재 탭', window: '현재 창의 모든 탭', all: '모든 창의 모든 탭' }[p.scope];
  if (!p.kinds.length) return '수집할 대상을 하나 이상 골라 주세요';
  if (p.kinds.includes('all')) return `${scope}에서 ${p.plats.includes('all') ? '' : p.plats.map((x) => PLAT_NAME[x]).join('·') + ' '}모든 링크를 모아요`;
  const plat = p.plats.includes('all') ? '' : p.plats.map((x) => PLAT_NAME[x]).join('·') + ' ';
  const kinds = p.kinds.map((k) => (k === 'post' ? '게시물·영상' : '채널·계정')).join('·');
  return `${scope}에서 ${plat}${kinds} 링크를 모아요`;
}

function render() {
  const p = settings.popup;
  const rules = settings.rules.filter((r) => r.enabled !== false);
  app.innerHTML = `
  <header class="pl-popup__header">
    <span class="pl-brand"><span class="pl-brand__mark"><img class="pl-brand__logo" src="../../icons/icon.svg" alt=""></span>Power Link</span>
    <span class="pl-u-grow"></span>
    <button type="button" class="pl-btn pl-btn--soft pl-btn--sm" id="openPanel">${icon('sidebar', 'pl-i--sm')}수집 링크 <b class="pl-u-mono pl-u-accent">${linkCount}</b></button>
    <button type="button" class="pl-icon-btn" id="openOptions" aria-label="설정" data-tip="설정" data-tip-align="end" data-tip-pos="below">${icon('sliders')}</button>
  </header>
  <main class="pl-popup__main">
    <section class="pl-card pl-card--pad pl-card--stack">
      <div class="pl-head"><span class="pl-step">1</span><h2 class="pl-title-xs">수집 방법</h2></div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;">
        <button type="button" class="pl-choice pl-choice--xl" aria-pressed="${p.method === 'window'}" data-set="method" data-val="window">${icon('window')}창에서 링크 추출</button>
        <button type="button" class="pl-choice pl-choice--xl" aria-pressed="${p.method === 'mouse'}" data-set="method" data-val="mouse">${icon('mouse')}마우스로 링크 추출</button>
      </div>
      ${p.method === 'window' ? `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="pl-field-row"><span class="pl-label">범위</span>${seg(SCOPES, p.scope, 'scope')}</div>
        <div class="pl-field-row"><span class="pl-label">플랫폼</span><div class="pl-u-grow" style="display:flex;gap:3px;">
          ${PLATS.map(([id, l]) => `<button type="button" class="pl-choice pl-choice--compact pl-choice--flex" aria-pressed="${p.plats.includes(id)}" data-plat="${id}"><span class="pl-dot pl-dot--sm" data-tone="${id === 'all' ? 'none' : id}"></span>${l}</button>`).join('')}
        </div></div>
        <div class="pl-field-row"><span class="pl-label">대상</span><div class="pl-u-grow" style="display:flex;gap:6px;">
          ${KINDS.map(([id, l]) => `<button type="button" class="pl-choice pl-choice--flex" aria-pressed="${p.kinds.includes(id)}" data-kind="${id}"><span class="pl-check"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span>${l}</button>`).join('')}
        </div></div>
        <div class="pl-note">${icon('info', 'pl-i--sm')}<span>${esc(summary(p))}</span></div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="pl-btn pl-btn--primary pl-btn--lg pl-btn--flex" id="doCopy" ${p.kinds.length ? '' : 'disabled'}>${icon('copy')}수집해서 복사</button>
          <button type="button" class="pl-btn pl-btn--lg pl-btn--flex" id="doSave" ${p.kinds.length ? '' : 'disabled'}>${icon('plus')}목록에 저장</button>
        </div>
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="pl-card pl-card--clip" style="border-radius:10px;">
          ${rules.length ? rules.map((r) => `
          <div style="height:34px;padding:0 10px;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--pl-text-2);border-bottom:1px solid var(--pl-divider);">
            <span class="pl-dot" style="background:${esc(r.color)}"></span>
            ${r.mod !== 'none' ? `<span class="pl-kbd">${MODIFIERS[r.mod]}</span><span class="pl-kbd-plus">+</span>` : ''}
            <span class="pl-kbd">${r.button === 'left' ? '좌클릭' : '우클릭'} 드래그</span>
            <span class="pl-u-muted" style="font-size:11px;">${SHAPE[r.shape]}</span>
            <span class="pl-u-push pl-u-strong">${ACTIONS[r.action]?.label || ''}</span>
          </div>`).join('') : '<div class="pl-caption" style="padding:12px;">켜진 규칙이 없어요</div>'}
        </div>
        <div class="pl-head"><span class="pl-caption">페이지에서 바로 드래그하세요. Esc로 취소.</span><button type="button" class="pl-text-link pl-u-push" id="editRules" style="border:0;background:none;cursor:pointer;">단축키 변경</button></div>
        <div class="pl-caption">설치 전부터 열려 있던 탭은 한 번 새로고침해야 마우스 수집이 동작해요.</div>
      </div>`}
    </section>
    <section class="pl-card pl-card--pad pl-card--stack">
      <div class="pl-head"><span class="pl-step">2</span><h2 class="pl-title-xs">수집 내용</h2><span class="pl-head__aside">${CONTENT_HINT[settings.collect]}</span></div>
      <div class="pl-seg pl-seg--lg">${CONTENT.map(([id, l]) => `<button type="button" class="pl-seg__item" aria-pressed="${settings.collect === id}" data-collect="${id}">${l}</button>`).join('')}</div>
    </section>
    <section class="pl-card pl-card--pad pl-card--stack" style="--pl-label-w:64px;gap:9px;">
      <div class="pl-head"><span class="pl-step">3</span><h2 class="pl-title-xs">탭 관리</h2><span class="pl-head__aside">열린 탭 ${tabCount}개</span></div>
      <div class="pl-field-row"><span class="pl-label">수집 후</span>${seg(AFTER, p.after, 'after')}</div>
      <div class="pl-field-row"><span class="pl-label">탭 정렬</span>${seg(SORT, p.sort, 'sort')}</div>
    </section>
  </main>
  <footer class="pl-popup__footer">
    <span class="pl-dot pl-dot--xs" ${hasKey ? 'data-tone="success"' : ''}></span>${hasKey ? 'YouTube API 연결됨' : 'YouTube API 미설정'}
    <span class="pl-u-push pl-u-faint pl-u-mono" title="Power Link 버전">v${version()}</span>
  </footer>`;
}

async function savePopup(patch) {
  settings.popup = Object.assign({}, settings.popup, patch);
  render();
  await setSettings({ popup: settings.popup });
}

app.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.set) return savePopup({ [t.dataset.set]: t.dataset.val });
  if (t.dataset.collect) { settings.collect = t.dataset.collect; render(); return setSettings({ collect: settings.collect }); }
  if (t.dataset.plat) {
    const id = t.dataset.plat;
    let plats = settings.popup.plats.filter((x) => x !== 'all');
    if (id === 'all') plats = ['all'];
    else plats = plats.includes(id) ? plats.filter((x) => x !== id) : plats.concat(id);
    return savePopup({ plats: plats.length ? plats : ['all'] });
  }
  if (t.dataset.kind) {
    const id = t.dataset.kind;
    let kinds = settings.popup.kinds;
    if (id === 'all') kinds = kinds.includes('all') ? [] : ['all'];
    else { kinds = kinds.filter((x) => x !== 'all'); kinds = kinds.includes(id) ? kinds.filter((x) => x !== id) : kinds.concat(id); }
    return savePopup({ kinds });
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
    t.innerHTML = '수집 중…';
    const p = settings.popup;
    const res = await send({ type: 'pl:collectTabs', action: t.id === 'doCopy' ? 'copy' : 'save', scope: p.scope, plats: p.plats, kinds: p.kinds, after: p.after, sort: p.sort, mode: settings.collect });
    if (res.ok && res.copyPayload && !(await writeClipboard(res.copyPayload.text, res.copyPayload.html))) { res.ok = false; res.message = '클립보드에 복사하지 못했어요'; }
    busy = false;
    t.disabled = false;
    t.innerHTML = label;
    toast(res.ok ? res.message + (res.note ? ` (${res.note})` : '') : res.message, res.ok ? (res.note ? 'warning' : 'success') : 'error');
    linkCount = (await getLinks()).length;
    const b = document.querySelector('#openPanel b');
    if (b) b.textContent = linkCount;
  }
});

(async function init() {
  [settings, hasKey] = await Promise.all([getSettings(), getApiKey().then(Boolean)]);
  linkCount = (await getLinks()).length;
  tabCount = (await chrome.tabs.query({})).length;
  render();
})();
