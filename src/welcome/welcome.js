// Power Link — first-run guide: try each mouse rule on sample links (practice mode, nothing is sent).
// Opened once after install (background onInstalled) and from 설정 › 일반 › 사용법 다시 보기.
import { getSettings } from '../shared/storage.js';
import { ACTIONS, MODIFIERS } from '../shared/constants.js';
import { esc } from '../shared/util.js';
import { icon, logo, toast } from '../ui/ui.js';
import { themeReady } from '../ui/theme.js';

const app = document.getElementById('app');
const done = new Set(); // actions tried in the practice area
let rules = [];

const SAMPLES = [
  ['쇼츠 알고리즘, 첫 48시간이 전부다', '크리에이터랩 · 조회 12만'], ['썸네일 글자 3개만 쓰는 이유', '썸네일공방 · 조회 48만'],
  ['조회수 10배 올린 제목 공식', '채널분석가 · 조회 3.1만'], ['업로드 시간, 정말 중요할까?', '데이터로 보는 유튜브 · 조회 9.4만'],
  ['롱폼과 쇼츠 같이 운영하는 법', '1인 미디어 · 조회 6.2만'], ['구독자 1만까지 한 일 5가지', '성장일지 · 조회 21만']
];

function render() {
  const steps = rules.map((r) => {
    const keys = `${MODIFIERS[r.mod] ? `<kbd class="pl-kbd pl-kbd--md">${MODIFIERS[r.mod]}</kbd> + ` : ''}${r.button === 'left' ? '왼쪽' : '오른쪽'} 버튼 드래그`;
    const how = r.shape === 'lasso' ? '마우스가 지나간 선에 걸친 링크를 모아요' : '박스 안에 걸친 링크를 모아요';
    return `<li class="pl-wstep ${done.has(r.action) ? 'is-done' : ''}" data-step="${esc(r.action)}">
      <span class="pl-wstep__mark" aria-hidden="true">${done.has(r.action) ? icon('check', 'pl-i--sm') : ''}</span>
      <div><div class="pl-wstep__title">${keys} → <b>${esc(ACTIONS[r.action]?.label || r.action)}</b></div><div class="pl-caption">${how}${done.has(r.action) ? ' · 완료' : ''}</div></div>
    </li>`;
  }).join('');
  const left = rules.filter((r) => !done.has(r.action)).length;
  app.innerHTML = `
  <div class="pl-welcome__wrap">
    <header class="pl-welcome__head">${logo(40, 1.1)}<div><h1 class="pl-h1">Power Link 시작하기</h1><p class="pl-lead">키를 누른 채 마우스로 그리면 그 안의 링크를 한 번에 모아요. 아래 연습 칸에서 직접 해 보세요.</p></div></header>
    <section class="pl-card pl-card--pad">
      <div class="pl-h2">1. 마우스로 모으기 ${left ? `<span class="pl-caption" style="font-weight:400">· 남은 연습 ${left}개</span>` : '<span class="pl-caption" style="font-weight:400">· 모두 해 봤어요</span>'}</div>
      <ol class="pl-wsteps">${steps}</ol>
      <div class="pl-wdemo pl-demo" aria-label="연습 칸">${SAMPLES.map(([t, m], i) => `<a class="pl-wcard" href="https://example.com/practice/${i}"><span class="pl-wcard__thumb"></span><span class="pl-wcard__t">${t}</span><span class="pl-caption">${m}</span></a>`).join('')}</div>
      <p class="pl-caption">연습이라 실제로 복사·저장하지 않아요. 드래그 중 Esc를 누르면 취소돼요.</p>
    </section>
    <section class="pl-card pl-card--pad">
      <div class="pl-h2">2. 모은 링크 보기</div>
      <p class="pl-desc">사이드바에서 목록·썸네일로 보고, 복사·엑셀·컬렉션으로 정리해요. 단축키 <kbd class="pl-kbd">Alt</kbd> + <kbd class="pl-kbd">Shift</kbd> + <kbd class="pl-kbd">L</kbd></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="pl-btn pl-btn--ink" id="openPanel">${icon('sidebar', 'pl-i--md')}사이드바 열기</button><button type="button" class="pl-btn" id="openOptions">${icon('sliders', 'pl-i--md')}규칙 바꾸기</button></div>
    </section>
    <section class="pl-card pl-card--pad">
      <div class="pl-h2">3. 알아 두면 좋은 것</div>
      <ul class="pl-wtips">
        <li>툴바의 퍼즐 아이콘 → Power Link 옆 핀을 눌러 고정하면 팝업을 바로 열 수 있어요.</li>
        <li>이미 모은 링크에는 테두리가 남아요. 같은 곳을 다시 드래그하면 선택이 풀리고 목록에서도 빠져요.</li>
        <li>테두리 보이기/숨기기: <kbd class="pl-kbd">Alt</kbd> + <kbd class="pl-kbd">Shift</kbd> + <kbd class="pl-kbd">M</kbd> · 사이드바 검색: <kbd class="pl-kbd">/</kbd></li>
        <li>설치 전에 열려 있던 탭은 한 번 새로고침해야 마우스 수집이 동작해요.</li>
      </ul>
    </section>
  </div>`;
}

globalThis.addEventListener('pl-demo-result', (e) => {
  const a = e.detail && e.detail.action;
  if (!a || done.has(a)) return;
  done.add(a);
  render();
  if (rules.every((r) => done.has(r.action))) toast('모든 연습을 마쳤어요!');
});
app.addEventListener('click', async (e) => {
  if (e.target.closest('.pl-wdemo a')) { e.preventDefault(); return; }
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'openOptions') chrome.runtime.openOptionsPage();
  if (t.id === 'openPanel') {
    try { const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id }); } catch (err) { toast('사이드바를 열 수 없어요: ' + err.message, 'error'); }
  }
}, true);

(async function init() {
  const s = await getSettings();
  // one step per action (the first enabled rule for it)
  const seen = new Set();
  rules = (s.rules || []).filter((r) => r.enabled !== false && !seen.has(r.action) && seen.add(r.action));
  await themeReady;
  render();
})();
