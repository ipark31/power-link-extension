// Power Link — options page (design/graphite/Settings.dc.html)
import { getSettings, setSettings, resetSettings, getApiKey, setApiKey, getLinks, setLinks } from '../shared/storage.js';
import { FIELDS, PLATFORMS, ACTIONS, RULE_COLORS, DEFAULT_SETTINGS, STORAGE } from '../shared/constants.js';
import { esc, uid } from '../shared/util.js';
import { icon, logo, version, send, toast, confirmModal } from '../ui/ui.js';
import { themeChoice, setTheme, themeReady } from '../ui/theme.js';

const app = document.getElementById('app');
let settings, apiKey = '', showKey = false, keyStatus = null, quota = 0, linkCount = 0, fieldPlat = 'yt', lastDemo = null, catDraft = '';
let profileName = ''; // storage.local — sync에 두면 같은 계정의 프로필끼리 이름이 겹쳐 써짐
let bridge = null, ruleEdit = -1;
let collections = [], collCounts = {}; // 컬렉션 (storage.local) and how many links each holds
const LEGACY = { collect: 'fields' };
let tab = (location.hash || '#rules').slice(1);
tab = LEGACY[tab] || tab;

const NAV = [
  ['rules', '수집 규칙', 'mouse', '키를 누른 채 마우스로 영역을 그리면 그 안의 링크를 모아요.'],
  ['fields', '수집 항목', 'fields', '링크를 모을 때 어떤 정보까지 담을지 정해요.'],
  ['cats', '카테고리', 'tag', '링크를 나눌 카테고리와 자동 분류 규칙이에요.'],
  ['api', 'YouTube API', 'key', '유튜브 조회수·구독자 등은 YouTube Data API 키로 가져와요.'],
  ['download', '영상 다운로드', 'filmDown', '수집한 영상 링크를 다운로더 서버로 보내 정한 폴더에 내려받아요.'],
  ['recent', '최근 화면', 'clock', '사이드바 ‘최근 화면’ 기록과 다른 크롬 프로필 연동이에요.'],
  ['general', '일반', 'sliders', '열기 방식, 알림, 데이터 관리를 정해요.'],
  ['design', '디자인', 'palette', '사이드바, 팝업, 설정 화면의 모양을 정해요.']
];
if (!NAV.some((n) => n[0] === tab)) tab = 'rules';

const sw = (key, on, label) => `<button type="button" role="switch" class="pl-switch" aria-checked="${!!on}" data-toggle="${key}" aria-label="${esc(label || key)}"></button>`;
const row = (title, desc, control) => `<div class="pl-row"><div class="pl-row__main"><span class="pl-row__title">${title}</span>${desc ? `<span class="pl-row__desc">${desc}</span>` : ''}</div>${control ? `<div class="pl-row__ctl">${control}</div>` : ''}</div>`;
const toggleRow = (key, title, desc) => row(title, desc, sw(key, settings[key], title));
const segBtns = (list, cur, attr, label, lg = true) => `<div class="pl-seg ${lg ? 'pl-seg--lg' : ''}" role="group" aria-label="${label}">${list.map(([id, l]) => `<button type="button" class="pl-seg__item" aria-pressed="${cur === id}" ${attr}="${id}">${l}</button>`).join('')}</div>`;
const selectBox = (attrs, list, cur, label, w = 0) => `<select class="pl-select" ${attrs} aria-label="${label}"${w ? ` style="width:${w}px"` : ''}>${list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

function conflictIds() {
  const seen = {}, bad = new Set();
  settings.rules.forEach((r) => {
    if (r.enabled === false) return;
    const k = r.mod + ':' + r.button;
    if (seen[k]) { bad.add(r.id); bad.add(seen[k]); } else seen[k] = r.id;
  });
  return bad;
}

// ------------------------------------------------------------------ 수집 규칙
function viewRules() {
  const bad = conflictIds();
  const MOD = { none: '', ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt' };
  return `
  <section class="pl-card pl-card--clip">
    ${settings.rules.map((r, i) => `
    <div class="pl-rule ${bad.has(r.id) ? 'is-conflict' : ''}">
      <div class="pl-rule__line">
        <button type="button" role="switch" class="pl-switch" aria-checked="${r.enabled !== false}" data-rule="${i}" data-rk="enabled" aria-label="규칙 사용"></button>
        <span class="pl-rule__keys">${r.mod === 'none' ? '' : `<kbd class="pl-kbd pl-kbd--md">${MOD[r.mod] || r.mod}</kbd><span class="pl-muted">+</span>`}<span>${r.button === 'left' ? '좌클릭' : '우클릭'} 드래그</span></span>
        <span class="pl-rule__shape"><span class="pl-rule__mark ${r.shape === 'lasso' ? 'pl-rule__mark--lasso' : ''}" style="border-color:${esc(r.color)}" title="규칙 색"></span>${r.shape === 'lasso' ? '선 긋기' : '박스'}</span>
        ${icon('arrow', 'pl-muted')}
        <span class="pl-rule__action">${ACTIONS[r.action]?.label || ''}${bad.has(r.id) ? '<span class="pl-caption" style="font-weight:400;"> · 단축키가 겹쳐요</span>' : ''}</span>
        <button type="button" class="pl-ibtn pl-ibtn--lg ${ruleEdit === i ? 'is-on' : ''}" data-rule-edit="${i}" aria-label="규칙 편집" aria-expanded="${ruleEdit === i}" title="규칙 편집">${icon('more', 'pl-i--lg')}</button>
      </div>
      ${ruleEdit === i ? `
      <div class="pl-rule__edit">
        <span class="pl-label">키</span>${selectBox(`data-rule="${i}" data-rk="mod"`, [['none', '없음'], ['ctrl', 'Ctrl'], ['shift', 'Shift'], ['alt', 'Alt']], r.mod, '수정 키', 90)}
        <span class="pl-label">버튼</span>${selectBox(`data-rule="${i}" data-rk="button"`, [['right', '우클릭 드래그'], ['left', '좌클릭 드래그']], r.button, '마우스 버튼', 140)}
        <span class="pl-label">모양</span><div class="pl-seg" role="group" aria-label="모양">${[['box', '박스'], ['lasso', '선 긋기']].map(([v, l]) => `<button type="button" class="pl-seg__item" aria-pressed="${r.shape === v}" data-rule="${i}" data-rk="shape" data-val="${v}">${l}</button>`).join('')}</div>
        <span class="pl-label">동작</span>${selectBox(`data-rule="${i}" data-rk="action"`, Object.entries(ACTIONS).map(([k, a]) => [k, a.label]), r.action, '동작', 140)}
        <span class="pl-label">색</span><span style="display:flex;gap:8px;">${RULE_COLORS.map((c) => `<button type="button" class="pl-swatch ${r.color === c ? 'is-on' : ''}" data-rule="${i}" data-rk="color" data-val="${c}" aria-label="규칙 색 ${c}" style="background:${c}"></button>`).join('')}</span>
        <button type="button" class="pl-btn pl-btn--outline pl-btn--sm pl-push" data-rule-del="${i}">${icon('trash', 'pl-i--sm')}규칙 삭제</button>
      </div>` : ''}
    </div>`).join('')}
  </section>
  <section class="pl-card">
    ${toggleRow('highlight', '드래그 중 링크 강조', '영역에 들어온 링크에 테두리를 표시해요.')}
    ${toggleRow('autoscroll', '가장자리 자동 스크롤', '화면 끝까지 끌면 페이지가 따라 내려가요.')}
    ${toggleRow('dedupe', '중복 링크 제거', '같은 주소는 한 번만 수집해요 (썸네일·제목 링크가 겹치는 영상 목록에 유용).')}
    ${toggleRow('sameSite', '같은 사이트 링크만', '현재 페이지와 도메인이 같은 링크만 수집해요.')}
  </section>
  <section class="pl-card pl-card--pad">
    <div style="display:flex;align-items:flex-end;gap:12px;">
      <div class="pl-grow"><div class="pl-h2">연습 영역</div><p class="pl-desc" style="margin-top:4px;">위 규칙대로 이 칸의 링크를 드래그해 보세요. 실제 동작은 하지 않아요.</p></div>
      <span class="pl-caption">마지막 결과: <b id="demoResult" style="color:var(--pl-text)">${lastDemo ? esc(lastDemo) : '-'}</b></span>
    </div>
    <div class="pl-demo">${[['쇼츠 기획서', 40, 30], ['썸네일 공식', 60, 74], ['업로드 시간', 30, 118], ['채널 분석', 330, 50], ['키워드 도구', 380, 100], ['대본 템플릿', 560, 70]].map(([t, x, y], i) => `<a href="https://example.com/demo/${i}" style="left:${x}px;top:${y}px;">예시 링크 · ${t}</a>`).join('')}</div>
  </section>`;
}

// ------------------------------------------------------------------ 수집 항목
function viewFields() {
  const modes = [
    ['link', '링크만', '주소만 줄바꿈으로 모아요. 가장 가볍고 빨라요.', 'https://…/watch?v=kq8s…\nhttps://…/watch?v=Tq1m…'],
    ['title', '링크 + 제목', '링크 글자나 이미지 설명을 제목으로 함께 가져와요.', '쇼츠 알고리즘, 첫 48시간…\nhttps://…/watch?v=Tq1m…'],
    ['detail', '상세 정보', '유튜브는 조회수·구독자 등 지표까지, 다른 플랫폼은 제목·분류를 표로 모아요.', '플랫폼 | 제목 | 조회수 | 채널…']
  ];
  const F = FIELDS[fieldPlat];
  const off = settings.fieldsOff || {};
  const col = (key, title) => {
    const list = F[key];
    const on = list.filter(([id]) => !off[fieldPlat + ':' + id]).length;
    return `<div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;"><span class="pl-row__title" style="font-size:14px;">${title}</span><span class="pl-caption">${on} / ${list.length}</span><button type="button" class="pl-btn pl-btn--ghost pl-btn--sm pl-push" data-fields-all="${key}">전체 선택</button></div>
      <div class="pl-fields">${list.map(([id, label]) => {
        const tag = id === 'power' ? ' · 베타' : '';
        const pressed = !off[fieldPlat + ':' + id];
        return `<button type="button" class="pl-chip" aria-pressed="${pressed}" data-field="${id}">${pressed ? icon('check', 'pl-i--xs') : ''}${label}${tag}</button>`;
      }).join('')}</div></div>`;
  };
  return `
  <section class="pl-choices" role="radiogroup" aria-label="담을 정보">
    ${modes.map(([id, label, desc, sample]) => `
    <button type="button" class="pl-choice" aria-pressed="${settings.collect === id}" data-collect="${id}">
      <span class="pl-choice__head"><span class="pl-radio"></span>${label}${id === 'detail' ? `<span class="pl-caption pl-push" style="font-weight:400;">${apiKey ? 'API 연결됨' : 'API 키 필요'}</span>` : ''}</span>
      <span class="pl-desc">${desc}</span>
      <span class="pl-choice__sample">${sample}</span>
    </button>`).join('')}
  </section>
  <section class="pl-card">
    ${row('복사 형식', '‘복사’ 동작이 클립보드에 넣는 모양이에요. 상세 정보는 항상 표로 복사돼요.', segBtns([['text', '텍스트'], ['card', '카드'], ['table', '표 (엑셀)']], settings.copyFormat, 'data-copyfmt', '복사 형식'))}
    ${toggleRow('alsoSave', '모든 수집 결과를 목록에도 저장', '복사하거나 탭으로 열 때도 사이드바 목록에 쌓여요.')}
  </section>
  <section class="pl-card pl-card--pad">
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div class="pl-grow"><div class="pl-h2">플랫폼별 수집 항목</div><p class="pl-desc" style="margin-top:4px;">‘상세 정보’로 수집할 때 표·엑셀에 넣을 항목이에요.</p></div>
      <span class="pl-caption">데이터: ${esc(F.source)}</span>
    </div>
    ${segBtns(Object.keys(FIELDS).map((p) => [p, PLATFORMS[p].name]), fieldPlat, 'data-fplat', '플랫폼')}
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;">${col('post', fieldPlat === 'blog' ? '글' : '게시물·영상')}${col('account', PLATFORMS[fieldPlat].account)}</div>
  </section>
  <section class="pl-card">
    ${row('메모', '모든 링크에 한 줄 메모를 남길 수 있어요. 사이드바에서 메모 버튼을 누르세요.', '')}
    ${toggleRow('memoExport', '복사·엑셀에 메모 포함', '내보낼 때 ‘메모’ 열을 함께 넣어요.')}
    ${toggleRow('memoSearch', '검색에 메모 포함', '사이드바 검색이 메모 내용까지 찾아요.')}
    ${row('채널력 (베타)', '지금은 채널마다 고정된 1~10 임의 점수예요. 산정 공식이 정해지면 구독자 대비 조회수, 최근 30일 업로드, 참여율, 운영 기간으로 계산하도록 바꿀 수 있어요.', '')}
  </section>`;
}

// ------------------------------------------------------------------ 카테고리
function viewCats() {
  return `
  <section class="pl-card pl-card--pad">
    <div><div class="pl-h2">내 카테고리</div><p class="pl-desc" style="margin-top:4px;">사이드바 상세 보기에서 고를 수 있는 목록이에요. 유튜브는 영상 카테고리를 그대로 가져와요.</p></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
      ${settings.categories.map((c, i) => `<span class="pl-tag">${esc(c)}<button type="button" class="pl-ibtn pl-ibtn--xs pl-ibtn--muted" data-cat-del="${i}" aria-label="${esc(c)} 삭제" title="삭제">${icon('close', 'pl-i--xs')}</button></span>`).join('')}
      <input type="text" class="pl-input pl-input--sm" id="catDraft" value="${esc(catDraft)}" placeholder="+ 새 카테고리 (Enter)" aria-label="새 카테고리" style="width:170px;border-radius:15px;">
    </div>
  </section>
  <section class="pl-card pl-card--pad">
    <div><div class="pl-h2">자동 분류 규칙</div><p class="pl-desc" style="margin-top:4px;">제목·태그에 쉼표로 구분한 단어가 있으면 그 카테고리로 분류해요.</p></div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${settings.catRules.map((r, i) => `<div style="display:flex;align-items:center;gap:8px;">
        <input type="text" class="pl-input pl-input--sm" data-crule="${i}" data-ck="k" value="${esc(r.k)}" aria-label="키워드" style="flex:1;">
        ${icon('arrow', 'pl-muted')}
        <select class="pl-select pl-select--sm" data-crule="${i}" data-ck="c" aria-label="카테고리" style="width:160px;">${settings.categories.map((c) => `<option ${c === r.c ? 'selected' : ''}>${esc(c)}</option>`).join('')}${settings.categories.includes(r.c) ? '' : `<option selected>${esc(r.c)}</option>`}</select>
        <button type="button" class="pl-ibtn pl-ibtn--sm pl-ibtn--muted" data-crule-del="${i}" aria-label="규칙 삭제" title="규칙 삭제">${icon('close', 'pl-i--sm')}</button>
      </div>`).join('')}
    </div>
    <button type="button" class="pl-btn pl-btn--sm" id="addCatRule" style="align-self:flex-start;">${icon('plus', 'pl-i--sm')}규칙 추가</button>
  </section>
  <section class="pl-card pl-card--pad">
    <div><div class="pl-h2">컬렉션</div><p class="pl-desc" style="margin-top:4px;">프로젝트처럼 링크를 묶는 폴더예요. 사이드바에서 링크를 고른 뒤 아래 바의 폴더 버튼으로 넣어요.</p></div>
    ${collections.length ? `<div style="display:flex;flex-direction:column;gap:8px;">${collections.map((c, i) => `<div style="display:flex;align-items:center;gap:8px;">
        ${icon('folder', 'pl-muted')}
        <input type="text" class="pl-input pl-input--sm" data-coll-name="${i}" value="${esc(c.name)}" maxlength="40" aria-label="컬렉션 이름" style="flex:1;">
        <span class="pl-caption" style="width:56px;text-align:right;">${collCounts[c.id] || 0}개</span>
        <button type="button" class="pl-ibtn pl-ibtn--sm pl-ibtn--muted" data-coll-del="${i}" aria-label="${esc(c.name)} 컬렉션 삭제" title="컬렉션 삭제 (링크는 남아요)">${icon('trash', 'pl-i--sm')}</button>
      </div>`).join('')}</div>` : '<p class="pl-caption">아직 컬렉션이 없어요.</p>'}
  </section>`;
}

// ------------------------------------------------------------------ YouTube API
function viewApi() {
  return `
  <section class="pl-card pl-card--pad">
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="pl-grow"><div class="pl-h2">YouTube Data API v3 키</div><p class="pl-desc" style="margin-top:4px;">키는 이 컴퓨터에만 저장되고 동기화되지 않아요.</p></div>
      <span class="pl-caption">${apiKey ? '<span class="pl-odot" style="margin-right:6px;"></span>저장됨' : '미설정'}</span>
    </div>
    <div style="display:flex;gap:8px;">
      <label class="pl-search pl-grow" style="border-radius:8px;">${icon('key')}
        <input type="${showKey ? 'text' : 'password'}" id="apiKey" value="${esc(apiKey)}" placeholder="AIza…" aria-label="API 키" autocomplete="off" spellcheck="false">
        <button type="button" class="pl-btn pl-btn--ghost pl-btn--sm" id="toggleKey">${showKey ? '숨기기' : '보기'}</button>
      </label>
      <button type="button" class="pl-btn pl-btn--lg" id="testKey">연결 테스트</button>
      <button type="button" class="pl-btn pl-btn--lg pl-btn--ink" id="saveKey">저장</button>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <span class="pl-desc pl-grow" style="${keyStatus && keyStatus.ok === false ? 'color:var(--pl-text);' : ''}">${keyStatus ? esc(keyStatus.message) : apiKey ? '저장된 키가 있어요. ‘연결 테스트’로 확인할 수 있어요.' : '키를 넣으면 유튜브 조회수·구독자 등을 가져와요.'}</span>
      <span class="pl-caption">오늘 약 ${quota.toLocaleString()} / 10,000 units</span>
    </div>
    <div class="pl-meter"><span style="width:${Math.min(100, quota / 100)}%"></span></div>
  </section>
  <section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">
    <div class="pl-card pl-card--pad">
      <div class="pl-h2">키 발급 방법</div>
      <ol class="pl-steps" style="margin:0;padding:0;list-style:none;">${['Google Cloud 콘솔에서 프로젝트를 만들어요.', '‘YouTube Data API v3’를 찾아 사용 설정해요.', '사용자 인증 정보 → API 키 만들기 후, 키를 위 칸에 붙여넣고 저장해요.'].map((t, i) => `<li><b>${i + 1}</b><span>${t}</span></li>`).join('')}</ol>
      <a class="pl-link" style="align-self:flex-start;font-size:13px;" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud 콘솔 열기</a>
    </div>
    <div class="pl-card pl-card--pad">
      <div class="pl-h2">사용량 (하루 10,000 units 무료)</div>
      <table class="pl-table">${[['영상 50개까지 기본 정보', '1 unit'], ['채널 정보 (구독자·개설일)', '1 unit'], ['롱폼·숏폼 수 (채널당)', '2 units'], ['최근 30일 영상 수 (채널당)', '1~3 units']].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      <span class="pl-caption">채널 정보는 6시간 동안 저장해 두고 다시 써요.</span>
    </div>
  </section>
  <section class="pl-card">
    ${row('다른 플랫폼', '틱톡·인스타그램·X·블로그는 공식 API가 없거나 막혀 있어서 링크·제목·게시물/계정 구분·카테고리 규칙까지 모아요.', '')}
    ${row('AI 요약', '자막·본문 요약은 다음 버전에서 제공할 예정이에요.', '<span class="pl-caption">준비 중</span>')}
  </section>`;
}

// ------------------------------------------------------------------ 영상 다운로드
let dlStatus = null; // { ok, message } — 연결 확인 결과
function viewDownload() {
  const dl = settings.dl || {};
  const dot = dlStatus ? `<span class="pl-odot ${dlStatus.ok ? '' : 'pl-odot--off'}" style="margin-right:6px;"></span>${esc(dlStatus.message)}` : '확인 전';
  return `
  <section class="pl-card pl-card--pad">
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="pl-grow"><div class="pl-h2">다운로더 서버 주소</div><p class="pl-desc" style="margin-top:4px;">universal-downloader 서버의 API 주소예요. 기본값이면 이 PC 의 서버(8000, 8020)를 자동으로 찾아요. 클라우드 서버는 주소를 직접 넣으세요.</p></div>
      <span class="pl-caption" style="display:inline-flex;align-items:center;">${dot}</span>
    </div>
    <div style="display:flex;gap:8px;">
      <label class="pl-search pl-grow" style="border-radius:8px;">${icon('link')}
        <input type="text" id="dlServer" value="${esc(dl.server || '')}" placeholder="http://localhost:8000/api" aria-label="다운로더 서버 주소" autocomplete="off" spellcheck="false">
      </label>
      <label class="pl-search" style="border-radius:8px;width:260px;">${icon('key')}
        <input type="password" id="dlKey" value="${esc(dl.apiKey || '')}" placeholder="API 키 (원격 서버)" aria-label="API 키" autocomplete="off" spellcheck="false">
      </label>
      <button type="button" class="pl-btn pl-btn--lg" id="dlTest">연결 확인</button>
    </div>
    <span class="pl-caption">원격(클라우드) 서버는 API 키(서버의 UD_API_KEY)가 필요해요. 이 PC 에서 돌리는 서버(localhost)는 비워 두면 돼요.</span>
  </section>
  <section class="pl-card">
    ${row('저장 폴더', '받은 파일을 넣을 폴더(절대경로)예요. 비우면 서버의 기본 다운로드 폴더에 저장돼요. 서버가 이 PC에서 돌 때만 의미가 있어요.', `<input type="text" class="pl-input" id="dlSaveDir" value="${esc(dl.saveDir || '')}" placeholder="예: D:\\Videos\\PowerLink" spellcheck="false" style="width:260px;">`)}
    ${row('받을 트랙', '영상+음성이 기본이에요. 음성만 고르면 m4a/mp3 로 받아요.', selectBox('id="dlMode"', [['both', '영상 + 음성'], ['video', '영상만'], ['audio', '음성만']], dl.mode || 'both', '받을 트랙', 130))}
    ${row('최대 화질', '이 해상도 이하에서 가장 좋은 화질을 골라요.', selectBox('id="dlQuality"', [['', '최고 화질'], ['2160', '2160p (4K)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']], String(dl.quality || ''), '최대 화질', 130))}
    ${row('동시 다운로드', '한 번에 몇 개씩 받을지 정해요. 많으면 빨라지지만 사이트가 차단할 수 있어요.', selectBox('id="dlConc"', [1, 2, 3, 4].map((n) => [String(n), n + '개']), String(dl.concurrency || 2), '동시 다운로드', 110))}
    ${row('완료 파일 내 PC 로 가져오기', '서버가 다 받으면 크롬 다운로드 폴더의 PowerLink/ 에 저장하고 서버 사본은 지워요. ‘자동’은 서버가 이 PC(localhost)가 아닐 때만 가져와요.', selectBox('id="dlFetch"', [['auto', '자동 (원격 서버일 때)'], ['on', '항상'], ['off', '안 함']], dl.fetch || 'auto', '완료 파일 가져오기', 180))}
  </section>
  <section class="pl-card pl-card--pad">
    <div class="pl-h2">사용 방법</div>
    <ol class="pl-steps" style="margin:0;padding:0;list-style:none;">${[
      '다운로더 서버를 켜요 (universal-downloader 폴더의 run-server, 또는 클라우드 주소).',
      '페이지에서 <b>우클릭 드래그</b>로 영상 링크를 감싸면 다운로드 목록창이 떠요. 체크를 조정한 뒤 [다운로드]를 누르면 서버가 위 폴더에 받아요. (수집 규칙에서 키 조합을 바꿀 수 있어요)',
      '사이드바 ‘수집 링크’에서도 영상을 체크한 뒤 하단 바의 ‘영상 다운로드’(필름 아이콘)로 받을 수 있어요. 진행률은 사이드바 아래에 표시돼요.'
    ].map((t, i) => `<li><b>${i + 1}</b><span>${t}</span></li>`).join('')}</ol>
    <span class="pl-caption">유튜브·틱톡·비메오·빌리빌리 게시물 링크만 보내고, 채널/계정·블로그·X 링크는 건너뛰어요. 로그인이 필요한 영상은 서버 쪽 쿠키 설정을 따라요.</span>
  </section>`;
}

// ------------------------------------------------------------------ 최근 화면
function viewRecent() {
  const on = !!(bridge && bridge.connected);
  return `
  <section class="pl-card">
    ${row('최근 작업 화면 기록 수', '사이드바 ‘최근 화면’에 남길 탭 개수예요. 넘으면 오래된 것부터 지워요.', selectBox('id="recentMax"', [20, 50, 100, 200, 500].map((n) => [n, n + '개']), settings.recentMax || 50, '기록 수', 110))}
    ${row('이 프로필 이름', '다른 크롬 프로필의 ‘최근 화면’에 이 이름이 표시돼요.', `<input type="text" class="pl-input" id="profileName" value="${esc(profileName)}" placeholder="예: 업무용" maxlength="30" style="width:180px;">`)}
    ${row('다른 프로필 연동', on ? '도우미에 연결되어 있어요. 다른 프로필의 최근 화면이 사이드바에 함께 보여요.' : '도우미가 설치되지 않았거나 연결이 끊겼어요. native-host\\install.bat 을 한 번 실행한 뒤 다시 연결하세요.',
      `<span class="pl-caption" style="display:inline-flex;align-items:center;gap:6px;"><span class="pl-odot ${on ? '' : 'pl-odot--off'}"></span>${on ? '연결됨' : '연결 안 됨'}</span>${on ? '' : '<button type="button" class="pl-btn pl-btn--sm" id="bridgeRetry">다시 연결</button>'}`)}
  </section>`;
}

// ------------------------------------------------------------------ 일반
function viewGeneral() {
  return `
  <section class="pl-card">
    ${toggleRow('bgTabs', '새 탭을 뒤에서 열기', '지금 보는 탭을 유지한 채 뒤쪽에 순서대로 열어요.')}
    ${toggleRow('notify', '완료 알림', '수집이 끝나면 페이지 오른쪽 아래에 결과를 보여줘요.')}
    ${row('많이 열 때 확인', '이 개수를 넘으면 열기 전에 한 번 물어봐요.', selectBox('id="confirmOver"', [10, 20, 50, 100].map((n) => [n, n + '개']), settings.confirmOver, '확인 개수', 110))}
    ${row('사용법 다시 보기', '마우스 드래그 3가지를 직접 따라 해 보는 안내 페이지를 열어요.', '<button type="button" class="pl-btn pl-btn--sm" id="openWelcome">열기</button>')}
    ${row('사이드바 열기 단축키', '크롬 단축키 설정에서 바꿀 수 있어요. 페이지 선택 표시 켜기/끄기는 Alt + Shift + M.', `<span style="display:inline-flex;gap:4px;align-items:center;"><kbd class="pl-kbd pl-kbd--md">Alt</kbd><span class="pl-muted">+</span><kbd class="pl-kbd pl-kbd--md">Shift</kbd><span class="pl-muted">+</span><kbd class="pl-kbd pl-kbd--md">L</kbd></span><button type="button" class="pl-btn pl-btn--sm" id="shortcuts">변경</button>`)}
  </section>
  <section class="pl-card">
    ${row('설정 내보내기 / 가져오기', '규칙과 옵션을 JSON 파일로 옮겨요. API 키는 포함되지 않아요.', `<button type="button" class="pl-btn pl-btn--sm" id="exportSettings">내보내기</button><button type="button" class="pl-btn pl-btn--sm" id="importSettings">가져오기</button><input type="file" id="importFile" accept="application/json" hidden>`)}
    ${row('설정 초기화', '규칙과 옵션을 처음 상태로 돌려요. 수집 목록과 API 키는 그대로예요.', `<button type="button" class="pl-btn pl-btn--sm" id="resetSettings">초기화</button>`)}
    ${row('수집 목록 모두 지우기', `사이드바 목록 ${linkCount}개가 삭제돼요. 되돌릴 수 없어요.`, `<button type="button" class="pl-btn pl-btn--sm pl-btn--outline" id="clearLinks">${icon('trash', 'pl-i--sm')}모두 지우기</button>`)}
  </section>
  <section class="pl-card">
    <div class="pl-row">${logo(30, 1.1)}<div class="pl-row__main"><span class="pl-row__title">Power Link v${version()}</span><span class="pl-row__desc">링크 수집 · 카드 복사 · 유튜브 분석 확장 프로그램</span></div>
      <a class="pl-btn pl-btn--sm" href="https://github.com/ipark31/power-link-extension/releases" target="_blank" rel="noopener">릴리스 노트</a></div>
  </section>`;
}

// ------------------------------------------------------------------ 디자인
function viewDesign() {
  const L = { bg: '#FFFFFF', strong: '#CFCFCF', line: '#E6E6E6', thumb: '#9AA0A8', edge: 'transparent' };
  const D = { bg: '#0F0F0F', strong: '#4A4A4A', line: '#2E2E2E', thumb: '#3A3F47', edge: '#3A3A3A' };
  const half = (h) => `<div class="pl-theme__half" style="background:${h.bg}">
    <div style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;background:#111317;box-shadow:0 0 0 1px ${h.edge}"></span><span style="width:34px;height:5px;background:${h.strong}"></span><span style="width:22px;height:5px;background:${h.line}"></span></div>
    ${[60, 45].map((w) => `<div style="display:flex;gap:6px;"><span style="width:34px;height:20px;border-radius:4px;background:${h.thumb}"></span><div style="flex:1;display:flex;flex-direction:column;gap:4px;padding-top:2px;"><span style="height:5px;background:${h.strong}"></span><span style="width:${w}%;height:5px;background:${h.line}"></span></div></div>`).join('')}
  </div>`;
  const choice = themeChoice();
  const opts = [['device', '기기 테마 사용', [L, D]], ['dark', '어두운 테마', [D]], ['light', '밝은 테마', [L]]];
  return `
  <section class="pl-card pl-card--pad">
    <div><div class="pl-h2">테마</div><p class="pl-desc" style="margin-top:4px;">이 브라우저에만 설정이 적용돼요.</p></div>
    <div class="pl-choices" role="radiogroup" aria-label="테마">
      ${opts.map(([id, label, halves]) => `<button type="button" role="radio" class="pl-theme" aria-checked="${choice === id}" data-theme-pick="${id}">
        <div class="pl-theme__art">${halves.map(half).join('')}</div>
        <span class="pl-theme__label"><span class="pl-radio"></span>${label}</span>
      </button>`).join('')}
    </div>
  </section>
  <section class="pl-card">
    ${row('글꼴', '유튜브와 같은 Roboto, 한글은 Noto Sans KR로 보여요.', '<span style="font-size:13px;color:var(--pl-text2)">Roboto · Noto Sans KR</span>')}
    ${row('목록 기본 보기', '사이드바를 열 때 처음 보이는 모양이에요.', segBtns([['list', '목록'], ['detail', '상세'], ['thumb', '썸네일']], settings.sidepanel?.view || 'list', 'data-defview', '목록 기본 보기'))}
    ${row('떡상 점수 강조', '채널 평균보다 1.5배 이상 조회된 영상만 초록색으로 표시해요.', sw('outlierHighlight', settings.outlierHighlight !== false, '떡상 점수 강조'))}
  </section>`;
}

// ------------------------------------------------------------------ frame
function render() {
  const cur = NAV.find((n) => n[0] === tab) || NAV[0];
  const views = { rules: viewRules, fields: viewFields, cats: viewCats, api: viewApi, download: viewDownload, recent: viewRecent, general: viewGeneral, design: viewDesign };
  const main = app.querySelector('.pl-opt__main');
  const scroll = main ? main.scrollTop : 0;
  app.innerHTML = `
  <nav class="pl-opt__nav" aria-label="설정 메뉴">
    <div class="pl-opt__brand">${logo(30, 1.1)}<div style="display:flex;flex-direction:column;"><span class="pl-opt__brand-name">Power Link</span><span class="pl-caption">설정 · v${version()}</span></div></div>
    ${NAV.map(([id, label, ic]) => `<button type="button" class="pl-nav__item" aria-current="${tab === id ? 'page' : 'false'}" data-nav="${id}">${icon(ic, 'pl-i--xl')}${label}</button>`).join('')}
    <div class="pl-nav__foot">사이드바 열기 <span>Alt + Shift + L</span></div>
  </nav>
  <main class="pl-opt__main">
    <div class="pl-opt__content">
      <div class="pl-opt__title">
        <div class="pl-grow"><h1 class="pl-h1">${cur[1]}</h1><p class="pl-lead">${cur[3]}</p></div>
        <span class="pl-saved" id="saved">${icon('check', 'pl-i--sm')}저장됨</span>
        ${tab === 'rules' ? `<button type="button" class="pl-btn pl-btn--lg pl-btn--ink" id="addRule">${icon('plus')}규칙 추가</button>` : ''}
      </div>
      ${views[tab]()}
    </div>
  </main>`;
  const m2 = app.querySelector('.pl-opt__main');
  if (m2 && scroll) m2.scrollTop = scroll;
}

let savedTimer = 0;
function flashSaved() {
  const s = document.getElementById('saved');
  if (s) { s.style.opacity = '1'; clearTimeout(savedTimer); savedTimer = setTimeout(() => { const el = document.getElementById('saved'); if (el) el.style.opacity = '0'; }, 1400); }
}
async function save(patch) {
  settings = await setSettings(patch);
  render();
  flashSaved();
}
const setRule = (i, patch) => save({ rules: settings.rules.map((r, j) => (j === i ? Object.assign({}, r, patch) : r)) });

app.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-nav]');
  if (!t) return;
  const d = t.dataset;
  if (d.nav) { tab = d.nav; history.replaceState(null, '', '#' + tab); keyStatus = null; ruleEdit = -1; render(); app.querySelector('.pl-opt__main').scrollTop = 0; return; }
  if (d.toggle) return save({ [d.toggle]: !(d.toggle === 'outlierHighlight' ? settings.outlierHighlight !== false : settings[d.toggle]) });
  if (d.themePick) { await setTheme(d.themePick); render(); flashSaved(); return; }
  if (d.defview) return save({ sidepanel: Object.assign({}, settings.sidepanel, { view: d.defview }) });
  if (d.ruleEdit !== undefined) { ruleEdit = ruleEdit === +d.ruleEdit ? -1 : +d.ruleEdit; render(); return; }
  if (d.rule !== undefined && d.rk && t.tagName === 'BUTTON') {
    const i = +d.rule;
    if (d.rk === 'enabled') return setRule(i, { enabled: settings.rules[i].enabled === false });
    return setRule(i, { [d.rk]: d.val });
  }
  if (d.ruleDel !== undefined) { if (settings.rules.length <= 1) return toast('규칙은 하나 이상 있어야 해요', 'warning'); ruleEdit = -1; return save({ rules: settings.rules.filter((_, j) => j !== +d.ruleDel) }); }
  if (t.id === 'addRule') {
    const used = new Set(settings.rules.map((r) => r.mod + ':' + r.button));
    const free = ['ctrl', 'shift', 'alt', 'none'].flatMap((m) => ['right', 'left'].map((b) => [m, b])).filter(([m, b]) => !(m === 'none' && b === 'left')).find(([m, b]) => !used.has(m + ':' + b)) || ['ctrl', 'left'];
    ruleEdit = settings.rules.length;
    return save({ rules: settings.rules.concat({ id: uid(), enabled: true, mod: free[0], button: free[1], shape: 'box', action: 'save', color: RULE_COLORS[settings.rules.length % RULE_COLORS.length] }) });
  }
  if (d.fplat) { fieldPlat = d.fplat; render(); return; }
  if (d.field) { const k = fieldPlat + ':' + d.field; const off = Object.assign({}, settings.fieldsOff); off[k] ? delete off[k] : (off[k] = 1); return save({ fieldsOff: off }); }
  if (d.fieldsAll) { const off = Object.assign({}, settings.fieldsOff); FIELDS[fieldPlat][d.fieldsAll].forEach(([id]) => delete off[fieldPlat + ':' + id]); return save({ fieldsOff: off }); }
  if (d.collect) return save({ collect: d.collect });
  if (d.copyfmt) return save({ copyFormat: d.copyfmt });
  if (d.catDel !== undefined) return save({ categories: settings.categories.filter((_, i) => i !== +d.catDel) });
  if (d.cruleDel !== undefined) return save({ catRules: settings.catRules.filter((_, i) => i !== +d.cruleDel) });
  if (t.id === 'addCatRule') return save({ catRules: settings.catRules.concat({ k: '', c: settings.categories[0] || '' }) });
  if (t.id === 'toggleKey') { showKey = !showKey; apiKey = document.getElementById('apiKey').value; render(); return; }
  if (t.id === 'saveKey') { apiKey = document.getElementById('apiKey').value.trim(); await setApiKey(apiKey); keyStatus = { ok: true, message: apiKey ? '키를 저장했어요' : '키를 지웠어요' }; render(); return; }
  if (t.id === 'testKey') {
    const k = document.getElementById('apiKey').value.trim();
    keyStatus = { ok: null, message: '확인하는 중…' }; render();
    keyStatus = await send({ type: 'pl:testKey', key: k });
    if (keyStatus.ok) { apiKey = k; await setApiKey(k); keyStatus.message = '연결됐어요 · 키를 저장했어요'; }
    quota = (await send({ type: 'pl:quota' })).units || quota;
    render(); return;
  }
  if (t.id === 'dlTest') {
    const server = (document.getElementById('dlServer') || {}).value;
    const apiKey = (document.getElementById('dlKey') || {}).value;
    dlStatus = { ok: false, message: '확인 중…' }; render();
    dlStatus = await send({ type: 'pl:dlHealth', server, apiKey }); render(); return;
  }
  if (t.id === 'bridgeRetry') {
    await send({ type: 'pl:bridgeReconnect' });
    setTimeout(async () => { bridge = (await chrome.storage.local.get(STORAGE.bridge))[STORAGE.bridge] || null; render(); if (!bridge || !bridge.connected) toast('연결하지 못했어요 — install.bat 실행 여부를 확인해 주세요', 'error'); }, 1500);
    return;
  }
  if (t.id === 'shortcuts') { chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); return; }
  if (t.id === 'openWelcome') { chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html') }); return; }
  if (d.collDel !== undefined) {
    const c = collections[+d.collDel];
    if (!c || !(await confirmModal({ title: '컬렉션 삭제', message: `‘${c.name}’ 컬렉션을 삭제할까요?\n안에 있던 링크 ${collCounts[c.id] || 0}개는 목록에 그대로 남아요.`, ok: '삭제' }))) return;
    const all = await getLinks();
    await setLinks(all.map((l) => (l.coll === c.id ? Object.assign({}, l, { coll: '' }) : l)));
    collections = collections.filter((x) => x.id !== c.id);
    await chrome.storage.local.set({ [STORAGE.collections]: collections });
    await loadCollections(); render(); flashSaved(); return;
  }
  if (t.id === 'exportSettings') {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `PowerLink-settings-v${version()}.json`; a.click();
    return;
  }
  if (t.id === 'importSettings') { document.getElementById('importFile').click(); return; }
  if (t.id === 'resetSettings') { if (!(await confirmModal({ title: '설정 초기화', message: '규칙과 옵션을 처음 상태로 되돌릴까요?\n수집 목록과 API 키는 그대로예요.', ok: '초기화' }))) return; await resetSettings(); settings = await getSettings(); render(); toast('설정을 초기화했어요'); return; }
  if (t.id === 'clearLinks') { if (!(await confirmModal({ title: '수집 목록 모두 지우기', message: `수집 목록 ${linkCount}개를 모두 지울까요?\n되돌릴 수 없어요.`, ok: '모두 지우기' }))) return; await setLinks([]); linkCount = 0; render(); toast('목록을 비웠어요'); }
});

app.addEventListener('change', async (e) => {
  const t = e.target, d = t.dataset;
  if (d.rule !== undefined && d.rk && t.tagName === 'SELECT') return setRule(+d.rule, { [d.rk]: t.value });
  if (d.crule !== undefined) return save({ catRules: settings.catRules.map((r, i) => (i === +d.crule ? Object.assign({}, r, { [d.ck]: t.value }) : r)) });
  if (t.id === 'confirmOver') return save({ confirmOver: +t.value });
  if (t.id === 'dlServer') { dlStatus = null; return save({ dl: Object.assign({}, settings.dl, { server: t.value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.dl.server }) }); }
  if (t.id === 'dlSaveDir') return save({ dl: Object.assign({}, settings.dl, { saveDir: t.value.trim() }) });
  if (t.id === 'dlKey') { dlStatus = null; return save({ dl: Object.assign({}, settings.dl, { apiKey: t.value.trim() }) }); }
  if (t.id === 'dlFetch') return save({ dl: Object.assign({}, settings.dl, { fetch: t.value }) });
  if (t.id === 'dlMode') return save({ dl: Object.assign({}, settings.dl, { mode: t.value }) });
  if (t.id === 'dlQuality') return save({ dl: Object.assign({}, settings.dl, { quality: t.value }) });
  if (t.id === 'dlConc') return save({ dl: Object.assign({}, settings.dl, { concurrency: +t.value }) });
  if (d.collName !== undefined) {
    const name = t.value.trim().slice(0, 40);
    if (!name) { render(); return; }
    collections = collections.map((c, i) => (i === +d.collName ? Object.assign({}, c, { name }) : c));
    await chrome.storage.local.set({ [STORAGE.collections]: collections }); flashSaved(); return;
  }
  if (t.id === 'recentMax') return save({ recentMax: +t.value });
  if (t.id === 'profileName') {
    profileName = t.value.trim().slice(0, 30);
    await chrome.storage.local.set({ [STORAGE.profileName]: profileName });
    render();
    flashSaved();
    return;
  }
  if (t.id === 'importFile' && t.files[0]) {
    try {
      const data = JSON.parse(await t.files[0].text());
      if (!data || !Array.isArray(data.rules)) throw new Error();
      await save(Object.assign({}, DEFAULT_SETTINGS, data));
      toast('설정을 가져왔어요');
    } catch (err) { toast('올바른 설정 파일이 아니에요', 'error'); }
  }
});
app.addEventListener('click', (e) => { if (e.target.closest('.pl-demo a')) e.preventDefault(); }, true);
app.addEventListener('input', (e) => { if (e.target.id === 'catDraft') catDraft = e.target.value; });
app.addEventListener('keydown', (e) => {
  if (e.target.id === 'catDraft' && e.key === 'Enter') {
    const v = catDraft.trim();
    catDraft = '';
    if (v && !settings.categories.includes(v)) save({ categories: settings.categories.concat(v) });
    else render();
  }
});

globalThis.addEventListener('pl-demo-result', (e) => {
  lastDemo = `링크 ${e.detail.count}개 · ${ACTIONS[e.detail.action]?.label || ''}`;
  const el = document.getElementById('demoResult');
  if (el) el.textContent = lastDemo;
});
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.pl_theme && tab === 'design') render();
  if (area === 'local' && ch[STORAGE.bridge]) { bridge = ch[STORAGE.bridge].newValue || null; if (tab === 'recent') render(); }
});

async function loadCollections() {
  collections = (await chrome.storage.local.get(STORAGE.collections))[STORAGE.collections] || [];
  collCounts = {};
  for (const l of await getLinks()) if (l.coll) collCounts[l.coll] = (collCounts[l.coll] || 0) + 1;
}

(async function init() {
  settings = await getSettings();
  await loadCollections();
  apiKey = await getApiKey();
  profileName = (await chrome.storage.local.get(STORAGE.profileName))[STORAGE.profileName] || '';
  bridge = (await chrome.storage.local.get(STORAGE.bridge))[STORAGE.bridge] || null;
  linkCount = (await getLinks()).length;
  quota = (await send({ type: 'pl:quota' })).units || 0;
  await themeReady;
  render();
})();
