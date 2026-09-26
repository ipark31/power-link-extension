// Power Link — options page
import { getSettings, setSettings, resetSettings, getApiKey, setApiKey, getLinks, setLinks } from '../shared/storage.js';
import { FIELDS, PLATFORMS, ACTIONS, RULE_COLORS, DEFAULT_SETTINGS } from '../shared/constants.js';
import { esc, uid } from '../shared/util.js';
import { icon, version, send, toast } from '../ui/ui.js';

const app = document.getElementById('app');
let settings, apiKey = '', showKey = false, keyStatus = null, quota = 0, linkCount = 0, fieldPlat = 'yt', lastDemo = null, catDraft = '';
let tab = (location.hash || '#rules').slice(1);

const NAV = [
  ['rules', '수집 규칙', 'rules', '링크 추출 방법과 단축키, 수집 항목을 정해요.'],
  ['collect', '수집 정보', 'lines', '링크를 모을 때 어떤 정보까지 가져올지 정해요.'],
  ['api', 'API · 연동', 'play', '유튜브는 API 키로, 다른 플랫폼은 링크와 제목을 모아요.'],
  ['general', '일반', 'gear', '열기 방식, 알림, 데이터 관리를 정해요.']
];

const sw = (key, on) => `<button type="button" role="switch" class="pl-switch" aria-checked="${!!on}" data-toggle="${key}" aria-label="${key}"></button>`;
const row = (title, desc, control, danger) => `<div class="pl-row"><div class="pl-row__main"><div class="pl-row__title ${danger ? 'pl-row__title--danger' : ''}">${title}</div><div class="pl-row__desc">${desc}</div></div>${control}</div>`;

function conflictIds() {
  const seen = {}, bad = new Set();
  settings.rules.forEach((r) => {
    if (r.enabled === false) return;
    const k = r.mod + ':' + r.button;
    if (seen[k]) { bad.add(r.id); bad.add(seen[k]); } else seen[k] = r.id;
  });
  return bad;
}

function viewRules() {
  const bad = conflictIds();
  const cols = '56px 226px 150px 1fr 118px 36px';
  const F = FIELDS[fieldPlat];
  const off = settings.fieldsOff || {};
  const col = (key, title) => {
    const list = F[key];
    const on = list.filter(([id]) => !off[fieldPlat + ':' + id]).length;
    return `<div style="padding:14px 18px 18px;display:flex;flex-direction:column;gap:10px;${key === 'account' ? 'border-left:1px solid var(--pl-divider);' : ''}">
      <div class="pl-head"><span class="pl-title-xs" style="font-size:12.5px;">${title}</span><span class="pl-caption">${on} / ${list.length}</span><button type="button" class="pl-btn pl-btn--soft pl-btn--xs pl-u-push" data-fields-all="${key}">전체 선택</button></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${list.map(([id, label]) => {
        const tag = id === 'power' ? '베타' : id === 'outlier' ? '신규' : id === 'category' ? (fieldPlat === 'yt' ? 'API' : fieldPlat === 'blog' ? '규칙 분류' : '규칙 분류') : '';
        return `<button type="button" class="pl-choice pl-choice--soft" aria-pressed="${!off[fieldPlat + ':' + id]}" data-field="${id}" style="font-weight:500;font-size:12px;"><span class="pl-check"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span>${label}${tag ? `<span class="pl-badge pl-badge--sq" data-tone="warning" style="height:16px;font-size:10px;">${tag}</span>` : ''}</button>`;
      }).join('')}</div></div>`;
  };
  return `
  <section class="pl-card pl-card--lg pl-card--clip">
    <div class="pl-table-head" style="grid-template-columns:${cols};"><span>사용</span><span>단축키</span><span>선택 방식</span><span>동작</span><span>색상</span><span></span></div>
    ${settings.rules.map((r, i) => `
    <div class="pl-table-row" style="grid-template-columns:${cols};${bad.has(r.id) ? 'background:var(--pl-danger-bg);' : ''}">
      <button type="button" role="switch" class="pl-switch" aria-checked="${r.enabled !== false}" data-rule="${i}" data-rk="enabled" aria-label="규칙 사용"></button>
      <div style="display:flex;align-items:center;gap:4px;">
        <select class="pl-select" data-rule="${i}" data-rk="mod" aria-label="수정 키" style="width:82px;">${['ctrl', 'shift', 'alt'].map((m) => `<option value="${m}" ${r.mod === m ? 'selected' : ''}>${m === 'ctrl' ? 'Ctrl' : m === 'shift' ? 'Shift' : 'Alt'}</option>`).join('')}</select>
        <span class="pl-kbd-plus">+</span>
        <select class="pl-select" data-rule="${i}" data-rk="button" aria-label="마우스 버튼" style="width:128px;"><option value="right" ${r.button === 'right' ? 'selected' : ''}>우클릭 드래그</option><option value="left" ${r.button === 'left' ? 'selected' : ''}>좌클릭 드래그</option></select>
      </div>
      <div class="pl-seg">
        <button type="button" class="pl-seg__item" aria-pressed="${r.shape === 'box'}" data-rule="${i}" data-rk="shape" data-val="box">${icon('box', 'pl-i--sm')}박스</button>
        <button type="button" class="pl-seg__item" aria-pressed="${r.shape === 'lasso'}" data-rule="${i}" data-rk="shape" data-val="lasso">${icon('lasso', 'pl-i--sm')}자유</button>
      </div>
      <select class="pl-select" data-rule="${i}" data-rk="action" aria-label="동작">${Object.entries(ACTIONS).map(([k, a]) => `<option value="${k}" ${r.action === k ? 'selected' : ''}>${a.label}</option>`).join('')}</select>
      <div style="display:flex;gap:6px;">${RULE_COLORS.map((c) => `<button type="button" class="pl-swatch ${r.color === c ? 'is-on' : ''}" data-rule="${i}" data-rk="color" data-val="${c}" aria-label="색상 ${c}" style="border:0;cursor:pointer;background:${c};color:${c};"></button>`).join('')}</div>
      <button type="button" class="pl-icon-btn" data-rule-del="${i}" aria-label="규칙 삭제" data-tip="삭제" data-tip-align="end">${icon('trash')}</button>
    </div>`).join('')}
    <div class="pl-head" style="padding:12px 18px;gap:12px;">
      <button type="button" class="pl-btn pl-btn--dashed" id="addRule">${icon('plus', 'pl-i--sm')}규칙 추가</button>
      <span class="pl-desc">${bad.size ? '<b class="pl-u-danger">빨간 줄의 규칙은 단축키가 겹쳐요. 하나만 켜 두세요.</b>' : '같은 단축키는 규칙 하나에만 쓸 수 있어요. 수정 키 없이 드래그하면 아무 동작도 하지 않아요.'}</span>
    </div>
  </section>

  <section class="pl-card pl-card--lg pl-card--pad-lg pl-card--stack" style="gap:12px;">
    <div class="pl-head"><div class="pl-u-grow"><div class="pl-row__title">연습 영역</div><div class="pl-row__desc">위 규칙대로 이 칸의 링크를 드래그해 보세요. 실제 동작은 하지 않아요.</div></div>
      <span class="pl-caption" style="font-size:12px;">마지막 결과: <b class="pl-u-strong" id="demoResult">${lastDemo ? esc(lastDemo) : '-'}</b></span></div>
    <div class="pl-demo">${[['쇼츠 기획서', 40, 30], ['썸네일 공식', 60, 74], ['업로드 시간', 30, 118], ['채널 분석', 330, 50], ['키워드 도구', 380, 100], ['대본 템플릿', 600, 70]].map(([t, x, y], i) => `<a href="https://example.com/demo/${i}" style="left:${x}px;top:${y}px;">예시 링크 · ${t}</a>`).join('')}</div>
  </section>

  <section class="pl-card pl-card--lg">
    ${row('중복 링크 제거', '같은 주소는 한 번만 수집해요 (썸네일·제목 링크가 겹치는 영상 목록에 유용).', sw('dedupe', settings.dedupe))}
    ${row('드래그 중 링크 강조', '선택 영역에 들어온 링크에 테두리를 표시해요.', sw('highlight', settings.highlight))}
    ${row('가장자리 자동 스크롤', '화면 끝으로 끌면 페이지가 따라 스크롤돼요.', sw('autoscroll', settings.autoscroll))}
    ${row('같은 사이트 링크만', '현재 페이지와 도메인이 같은 링크만 수집해요.', sw('sameSite', settings.sameSite))}
  </section>

  <section class="pl-card pl-card--lg pl-card--clip">
    <div class="pl-head" style="padding:16px 18px 0;align-items:flex-start;gap:12px;">
      <div class="pl-u-grow"><div class="pl-row__title">플랫폼별 수집 항목</div><div class="pl-row__desc">‘상세 정보’로 수집할 때 표·엑셀에 넣을 항목이에요. 게시물·영상과 채널·계정을 따로 골라요.</div></div>
      <span class="pl-badge" data-tone="${fieldPlat === 'yt' ? 'success' : ''}" style="height:24px;padding:0 9px;font-size:11.5px;">데이터: ${esc(F.source)}</span>
    </div>
    <div class="pl-tabs" style="padding:12px 14px 0;">${Object.keys(FIELDS).map((p) => `<button type="button" class="pl-tab pl-tab--sm" aria-selected="${fieldPlat === p}" data-fplat="${p}"><span class="pl-dot pl-dot--xs" data-tone="${p}"></span>${PLATFORMS[p].name}</button>`).join('')}</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));">${col('post', fieldPlat === 'blog' ? '글' : '게시물·영상')}${col('account', PLATFORMS[fieldPlat].account)}</div>
  </section>`;
}

function viewCollect() {
  const modes = [
    ['link', '링크만', '주소만 줄바꿈으로 모아요. 가장 가볍고 빨라요.', '', 'https://…/watch?v=kq8s…\nhttps://…/watch?v=Tq1m…'],
    ['title', '링크 + 제목', '링크 글자나 이미지 설명을 제목으로 함께 가져와요.', '', '쇼츠 알고리즘, 첫 48시간…\nhttps://…/watch?v=Tq1m…'],
    ['detail', '상세 정보', '유튜브는 조회수·구독자 등 지표까지, 다른 플랫폼은 제목·분류·카테고리를 표로 모아요.', apiKey ? 'API 연결됨' : 'API 키 필요', '플랫폼 | 제목 | 조회수 | 채널 | 구독자…']
  ];
  return `
  <section style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
    ${modes.map(([id, label, desc, badge, sample]) => `
    <button type="button" class="pl-choice pl-choice--card" aria-pressed="${settings.collect === id}" data-collect="${id}">
      <span class="pl-head" style="width:100%;gap:8px;"><span class="pl-radio"></span><span class="pl-title-md" style="color:var(--pl-text);">${label}</span>${badge ? `<span class="pl-badge pl-u-push" data-tone="${apiKey ? 'success' : 'warning'}">${badge}</span>` : ''}</span>
      <span class="pl-desc">${desc}</span>
      <span class="pl-u-mono" style="font-size:11.5px;color:var(--pl-text-3);background:var(--pl-surface-2);border:1px solid var(--pl-divider);border-radius:6px;padding:6px 8px;white-space:pre-line;width:100%;font-weight:400;">${sample}</span>
    </button>`).join('')}
  </section>

  <section class="pl-card pl-card--lg">
    ${row('복사 형식', '‘복사’ 동작이 클립보드에 넣는 모양이에요. 상세 정보는 항상 표로 복사돼요.', `<div class="pl-seg pl-seg--inline">${[['text', '텍스트'], ['card', '카드 (삼성노트·Word)'], ['table', '표 (엑셀)']].map(([id, l]) => `<button type="button" class="pl-seg__item" aria-pressed="${settings.copyFormat === id}" data-copyfmt="${id}" style="flex:none;padding:0 12px;font-size:12px;">${l}</button>`).join('')}</div>`)}
    ${row('모든 수집 결과를 목록에도 저장', '복사하거나 탭으로 열 때도 사이드바 목록에 쌓여요.', sw('alsoSave', settings.alsoSave))}
  </section>

  <section class="pl-card pl-card--lg pl-card--clip">
    <div style="padding:16px 18px 12px;"><div class="pl-row__title">카테고리</div><div class="pl-row__desc">유튜브는 영상 카테고리를 그대로 가져오고, 나머지는 아래 키워드 규칙으로 자동 분류해요. 사이드바 상세 보기에서 직접 바꿀 수도 있어요.</div></div>
    <div style="padding:14px 18px;border-top:1px solid var(--pl-divider);display:flex;flex-direction:column;gap:10px;">
      <div class="pl-head" style="gap:8px;"><span class="pl-title-xs" style="font-size:12.5px;">내 카테고리</span><span class="pl-caption">사이드바에서 고를 수 있는 목록이에요</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
        ${settings.categories.map((c, i) => `<span class="pl-badge" data-tone="violet" style="height:28px;padding:0 4px 0 10px;font-size:12px;gap:4px;">${esc(c)}<button type="button" class="pl-icon-btn pl-icon-btn--xs" data-cat-del="${i}" aria-label="삭제" style="width:20px;height:20px;border-radius:50%;color:var(--pl-violet);">${icon('close', 'pl-i--xs')}</button></span>`).join('')}
        <input type="text" class="pl-input pl-input--sm pl-input--pill" id="catDraft" value="${esc(catDraft)}" placeholder="+ 새 카테고리 (Enter)" aria-label="새 카테고리" style="width:160px;">
      </div>
      <div class="pl-card" style="background:var(--pl-surface-2);border-color:var(--pl-divider);border-radius:10px;display:flex;flex-direction:column;gap:8px;padding:10px 12px;">
        <span class="pl-label">자동 분류 키워드 규칙 (제목·태그에 쉼표로 구분한 단어가 있으면 → 카테고리)</span>
        ${settings.catRules.map((r, i) => `<div class="pl-head" style="gap:8px;">
          <input type="text" class="pl-input pl-input--sm" data-crule="${i}" data-ck="k" value="${esc(r.k)}" aria-label="키워드" style="flex:1;">
          <span class="pl-u-faint">→</span>
          <select class="pl-select pl-select--sm" data-crule="${i}" data-ck="c" aria-label="카테고리" style="width:150px;height:28px;">${settings.categories.map((c) => `<option ${c === r.c ? 'selected' : ''}>${esc(c)}</option>`).join('')}${settings.categories.includes(r.c) ? '' : `<option selected>${esc(r.c)}</option>`}</select>
          <button type="button" class="pl-icon-btn pl-icon-btn--sm" data-crule-del="${i}" aria-label="규칙 삭제">${icon('close', 'pl-i--sm')}</button>
        </div>`).join('')}
        <button type="button" class="pl-text-link" id="addCatRule" style="border:0;background:none;cursor:pointer;align-self:flex-start;padding:0;">+ 규칙 추가</button>
      </div>
    </div>
  </section>

  <section class="pl-card pl-card--lg">
    ${row('메모', '모든 링크에 한 줄 메모를 남길 수 있어요. 사이드바에서 메모 아이콘을 누르세요.', '')}
    ${row('복사·엑셀에 메모 포함', '내보낼 때 ‘메모’ 열을 함께 넣어요.', sw('memoExport', settings.memoExport))}
    ${row('검색에 메모 포함', '사이드바 검색이 메모 내용까지 찾아요.', sw('memoSearch', settings.memoSearch))}
  </section>

  <section class="pl-card pl-card--lg pl-card--pad-lg pl-head" style="gap:20px;">
    <div class="pl-u-grow" style="display:flex;flex-direction:column;gap:6px;">
      <div class="pl-head" style="gap:8px;"><span class="pl-row__title">채널력</span><span class="pl-badge" data-tone="warning">베타 · 현재 임의 점수</span></div>
      <div class="pl-desc">지금은 채널마다 고정된 1~10 임의 점수예요. 산정 공식이 정해지면 구독자 대비 조회수, 최근 30일 업로드, 참여율, 운영 기간에 가중치를 매겨 계산하도록 바꿀 수 있게 코드에 자리를 만들어 뒀어요 (youtube.js · computeChannelPower).</div>
    </div>
  </section>`;
}

function viewApi() {
  const tone = keyStatus ? (keyStatus.ok ? 'success' : 'danger') : apiKey ? 'muted' : 'muted';
  return `
  <section class="pl-card pl-card--lg pl-card--pad-lg pl-card--stack" style="gap:14px;">
    <div class="pl-head" style="gap:10px;">
      <span style="width:36px;height:36px;border-radius:10px;background:var(--pl-danger-bg);color:var(--pl-p-yt);display:grid;place-items:center;">${icon('play', 'pl-i--lg')}</span>
      <div class="pl-u-grow"><div class="pl-row__title">YouTube Data API v3 키</div><div class="pl-row__desc">키는 이 컴퓨터에만 저장되고 동기화되지 않아요.</div></div>
      <span class="pl-badge" data-tone="${apiKey ? 'success' : 'warning'}" style="height:26px;padding:0 10px;font-size:12px;">${apiKey ? '저장됨' : '미설정'}</span>
    </div>
    <div style="display:flex;gap:8px;">
      <label class="pl-input-group pl-input-group--lg pl-u-grow">${icon('key')}
        <input type="${showKey ? 'text' : 'password'}" id="apiKey" value="${esc(apiKey)}" placeholder="AIza…" aria-label="API 키" class="pl-u-mono" style="font-size:13px;" autocomplete="off" spellcheck="false">
        <button type="button" class="pl-btn pl-btn--ghost pl-btn--xs" id="toggleKey">${showKey ? '숨기기' : '보기'}</button>
      </label>
      <button type="button" class="pl-btn pl-btn--xl" id="testKey">연결 테스트</button>
      <button type="button" class="pl-btn pl-btn--primary pl-btn--xl" id="saveKey">저장</button>
    </div>
    <div class="pl-head" style="gap:10px;">
      <span class="pl-status" data-tone="${tone}">${keyStatus ? esc(keyStatus.message) : apiKey ? '저장된 키가 있어요. ‘연결 테스트’로 확인할 수 있어요.' : '키를 넣으면 유튜브 조회수·구독자 등을 가져와요.'}</span>
      <span class="pl-u-push pl-u-mono" style="font-size:12px;color:var(--pl-text-3);">오늘 약 ${quota.toLocaleString()} / 10,000 units</span>
    </div>
    <div class="pl-progress"><div class="pl-progress__fill" style="width:${Math.min(100, quota / 100)}%;"></div></div>
  </section>

  <section class="pl-card pl-card--lg pl-card--clip">
    <div style="padding:14px 18px;border-bottom:1px solid var(--pl-divider);"><div class="pl-row__title">다른 플랫폼</div><div class="pl-row__desc">공식 API가 없거나 막혀 있어서, 이번 버전은 링크·제목·플랫폼·종류(게시물/계정)·카테고리 규칙까지 모아요.</div></div>
    ${[['tt', '틱톡'], ['ig', '인스타그램'], ['x', 'X'], ['blog', '블로그']].map(([p, n]) => `<div class="pl-head" style="padding:11px 18px;border-bottom:1px solid var(--pl-divider);gap:12px;"><span class="pl-dot" data-tone="${p}"></span><span class="pl-u-strong" style="width:90px;font-size:13px;">${n}</span><span class="pl-desc pl-u-grow">링크 · 제목 · 게시물/계정 구분 · 카테고리</span><span class="pl-badge">기본 수집</span></div>`).join('')}
    <div class="pl-head" style="padding:11px 18px;gap:12px;"><span class="pl-dot" data-tone="violet"></span><span class="pl-u-strong" style="width:90px;font-size:13px;">AI 요약</span><span class="pl-desc pl-u-grow">자막·본문 요약은 다음 버전에서 제공할 예정이에요</span><span class="pl-badge">준비 중</span></div>
  </section>

  <section style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
    <div class="pl-card pl-card--lg pl-card--pad-lg pl-card--stack" style="gap:12px;">
      <div class="pl-row__title">키 발급 방법</div>
      ${['Google Cloud 콘솔에서 프로젝트를 만들어요.', '‘YouTube Data API v3’를 찾아 사용 설정해요.', '사용자 인증 정보 → API 키 만들기 후, 키를 위 칸에 붙여넣고 저장해요.'].map((t, i) => `<div style="display:flex;gap:10px;"><span class="pl-step" style="width:22px;height:22px;border-radius:50%;font-size:12px;">${i + 1}</span><span style="font-size:12.5px;color:var(--pl-text-2);">${t}</span></div>`).join('')}
      <a class="pl-text-link" style="font-size:12.5px;" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud 콘솔 열기 →</a>
    </div>
    <div class="pl-card pl-card--lg pl-card--pad-lg pl-card--stack">
      <div class="pl-row__title">사용량 (하루 10,000 units 무료)</div>
      ${[['영상 50개까지 기본 정보', '1 unit'], ['채널 정보 (구독자·개설일)', '1 unit'], ['롱폼·숏폼 수 (채널당)', '2 units'], ['최근 30일 영상 수 (채널당)', '1~3 units']].map(([k, v]) => `<div class="pl-head" style="font-size:12.5px;color:var(--pl-text-2);padding:6px 0;border-bottom:1px solid var(--pl-divider);"><span>${k}</span><span class="pl-u-push pl-u-mono pl-u-strong">${v}</span></div>`).join('')}
      <span class="pl-caption">채널 정보는 6시간 동안 저장해 두고 다시 써서, 같은 채널을 여러 번 수집해도 사용량이 늘지 않아요.</span>
    </div>
  </section>`;
}

function viewGeneral() {
  return `
  <section class="pl-card pl-card--lg">
    ${row('새 탭을 뒤에서 열기', '지금 보는 탭을 유지한 채 뒤쪽에 순서대로 열어요.', sw('bgTabs', settings.bgTabs))}
    ${row('완료 알림', '수집이 끝나면 페이지 오른쪽 아래에 결과를 보여줘요.', sw('notify', settings.notify))}
    ${row('많이 열 때 확인', '이 개수를 넘으면 열기 전에 한 번 물어봐요.', `<select class="pl-select" id="confirmOver" style="width:100px;">${[10, 20, 50, 100].map((n) => `<option value="${n}" ${settings.confirmOver === n ? 'selected' : ''}>${n}개</option>`).join('')}</select>`)}
    ${row('사이드바 열기 단축키', '기본값은 Alt + Shift + L 이에요. 크롬 단축키 설정에서 바꿀 수 있어요.', `<span class="pl-head" style="gap:4px;"><span class="pl-kbd pl-kbd--md">Alt</span><span class="pl-kbd-plus">+</span><span class="pl-kbd pl-kbd--md">Shift</span><span class="pl-kbd-plus">+</span><span class="pl-kbd pl-kbd--md">L</span></span><button type="button" class="pl-text-link" id="shortcuts" style="border:0;background:none;cursor:pointer;">변경</button>`)}
  </section>
  <section class="pl-card pl-card--lg">
    ${row('설정 내보내기 / 가져오기', '규칙과 옵션을 JSON 파일로 옮겨요. API 키는 포함되지 않아요.', `<button type="button" class="pl-btn" id="exportSettings">내보내기</button><button type="button" class="pl-btn" id="importSettings">가져오기</button><input type="file" id="importFile" accept="application/json" hidden>`)}
    ${row('설정 초기화', '규칙과 옵션을 처음 상태로 돌려요. 수집 목록과 API 키는 그대로예요.', `<button type="button" class="pl-btn" id="resetSettings">초기화</button>`)}
    ${row('수집 목록 모두 지우기', `사이드바 목록 ${linkCount}개가 삭제돼요. 되돌릴 수 없어요.`, `<button type="button" class="pl-btn pl-btn--danger" id="clearLinks">모두 지우기</button>`, true)}
  </section>
  <section class="pl-card pl-card--lg pl-card--pad-lg pl-head" style="gap:12px;">
    <span class="pl-brand__mark pl-brand__mark--lg">${icon('link')}</span>
    <div class="pl-u-grow"><div class="pl-row__title">Power Link v${version()}</div><div class="pl-row__desc">링크 수집 · 카드 복사 · 유튜브 분석 확장 프로그램</div></div>
    <a class="pl-btn" href="https://github.com/ipark31/power-link-extension/releases" target="_blank" rel="noopener">릴리스 노트</a>
  </section>`;
}

function render() {
  const cur = NAV.find((n) => n[0] === tab) || NAV[0];
  app.innerHTML = `
  <aside class="pl-options__aside">
    <div class="pl-brand" style="padding:0 8px 20px;gap:10px;">
      <span class="pl-brand__mark pl-brand__mark--lg">${icon('link')}</span>
      <div style="display:flex;flex-direction:column;"><span style="font-size:15px;">Power Link</span><span class="pl-caption" style="font-weight:400;">설정</span></div>
    </div>
    <nav class="pl-nav">${NAV.map(([id, label, ic]) => `<button type="button" class="pl-nav__item" aria-current="${tab === id ? 'page' : 'false'}" data-nav="${id}">${icon(ic)}${label}${id === 'api' && apiKey ? '<span class="pl-badge" data-tone="success">연결됨</span>' : ''}</button>`).join('')}</nav>
    <span class="pl-u-grow"></span>
    <div class="pl-card pl-card--pad pl-caption" style="background:var(--pl-surface-2);border-color:var(--pl-divider);display:flex;flex-direction:column;gap:4px;">
      <span class="pl-u-strong pl-u-mono" style="color:var(--pl-text-2);">버전 ${version()}</span><span>설정은 바뀌는 즉시 저장돼요.</span>
    </div>
  </aside>
  <main class="pl-options__main">
    <div class="pl-options__content">
      <div style="display:flex;align-items:flex-end;gap:12px;">
        <div style="display:flex;flex-direction:column;gap:4px;"><h1 class="pl-title-xl">${cur[1]}</h1><p class="pl-desc" style="font-size:13px;">${cur[3]}</p></div>
        <span class="pl-u-push pl-u-success" id="saved" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:0;transition:opacity .2s;">${icon('check', 'pl-i--sm')}저장됨</span>
      </div>
      ${tab === 'rules' ? viewRules() : tab === 'collect' ? viewCollect() : tab === 'api' ? viewApi() : viewGeneral()}
    </div>
  </main>`;
}

let savedTimer = 0;
async function save(patch) {
  settings = await setSettings(patch);
  render();
  const s = document.getElementById('saved');
  if (s) { s.style.opacity = '1'; clearTimeout(savedTimer); savedTimer = setTimeout(() => { const el = document.getElementById('saved'); if (el) el.style.opacity = '0'; }, 1400); }
}
const setRule = (i, patch) => save({ rules: settings.rules.map((r, j) => (j === i ? Object.assign({}, r, patch) : r)) });

app.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-nav]');
  if (!t) return;
  const d = t.dataset;
  if (d.nav) { tab = d.nav; history.replaceState(null, '', '#' + tab); keyStatus = null; render(); return; }
  if (d.toggle) return save({ [d.toggle]: !settings[d.toggle] });
  if (d.rule !== undefined && d.rk && t.tagName === 'BUTTON') {
    const i = +d.rule;
    if (d.rk === 'enabled') return setRule(i, { enabled: settings.rules[i].enabled === false });
    return setRule(i, { [d.rk]: d.val });
  }
  if (d.ruleDel !== undefined) { if (settings.rules.length <= 1) return toast('규칙은 하나 이상 있어야 해요', 'warning'); return save({ rules: settings.rules.filter((_, j) => j !== +d.ruleDel) }); }
  if (t.id === 'addRule') {
    const used = new Set(settings.rules.map((r) => r.mod + ':' + r.button));
    const free = ['ctrl', 'shift', 'alt'].flatMap((m) => ['right', 'left'].map((b) => [m, b])).find(([m, b]) => !used.has(m + ':' + b)) || ['ctrl', 'left'];
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
  if (t.id === 'shortcuts') { chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); return; }
  if (t.id === 'exportSettings') {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `PowerLink-settings-v${version()}.json`; a.click();
    return;
  }
  if (t.id === 'importSettings') { document.getElementById('importFile').click(); return; }
  if (t.id === 'resetSettings') { if (!confirm('설정을 처음 상태로 되돌릴까요?')) return; await resetSettings(); settings = await getSettings(); render(); toast('설정을 초기화했어요'); return; }
  if (t.id === 'clearLinks') { if (!confirm(`수집 목록 ${linkCount}개를 모두 지울까요? 되돌릴 수 없어요.`)) return; await setLinks([]); linkCount = 0; render(); toast('목록을 비웠어요'); }
});

app.addEventListener('change', async (e) => {
  const t = e.target, d = t.dataset;
  if (d.rule !== undefined && d.rk && t.tagName === 'SELECT') return setRule(+d.rule, { [d.rk]: t.value });
  if (d.crule !== undefined) return save({ catRules: settings.catRules.map((r, i) => (i === +d.crule ? Object.assign({}, r, { [d.ck]: t.value }) : r)) });
  if (t.id === 'confirmOver') return save({ confirmOver: +t.value });
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

(async function init() {
  settings = await getSettings();
  apiKey = await getApiKey();
  linkCount = (await getLinks()).length;
  quota = (await send({ type: 'pl:quota' })).units || 0;
  render();
})();
