// Graphite 화면 캡처. 실행: node tests/screens.mjs
// 사이드바(썸네일/목록/상세/최근 화면) · 팝업 · 설정(디자인/수집 규칙)을 밝은/어두운 테마 ×
// 배율 1, 1.25 로 찍어 tests/screens/ 에 저장한다. 결과 이미지는 design/graphite 보드와 눈으로 비교한다.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const { chromium } = await import('playwright');
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<title>${decodeURIComponent(q.url.slice(1))}</title><h1>${q.url}</h1>`); }).listen(8776);

// muted placeholder "thumbnails" so captures never depend on the network
const TONES = ['#2E3238', '#3A3834', '#31363B', '#262A30', '#34302E', '#2D3136', '#3B3530', '#2B2F36'];
const svgThumb = (seed) => {
  const c = TONES[[...seed].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TONES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="${c}"/><rect x="24" y="118" width="170" height="14" rx="4" fill="#fff" fill-opacity=".22"/><rect x="24" y="140" width="110" height="10" rx="4" fill="#fff" fill-opacity=".14"/><circle cx="260" cy="60" r="26" fill="#fff" fill-opacity=".08"/></svg>`;
};

const now = Date.now();
const ago = (h) => new Date(now - h * 3600e3).toISOString();
const ch = (name, extra) => Object.assign({ name, channelId: 'UC' + name.length, accountUrl: 'https://www.youtube.com/@x', created: '2019-03-14T00:00:00Z', followers: 234000, total: 412, longCount: 188, shortCount: 224, recent30: 9, avgViews: 228000, views: 93800000, power: 7.4 }, extra || {});
const vid = (n, title, chan, views, upH, dur, outlier, extra) => Object.assign({
  id: 'v' + n, url: `https://www.youtube.com/watch?v=VIDEO0000${n}`, title, platform: 'yt', kind: 'post', domain: 'youtube.com',
  ids: { videoId: `VIDEO0000${n}` }, thumb: `https://i.ytimg.com/vi/VIDEO0000${n}/hqdefault.jpg`, createdAt: ago(1),
  detail: { views, likes: Math.round(views / 40), comments: Math.round(views / 550), uploadedAt: ago(upH), duration: dur },
  account: chan, outlier, enrichedAt: ago(1)
}, extra || {});
const LINKS = [
  vid(1, '전세계 유일하게 한글을 공용문자로 쓰는 해외도시 입국기', ch('상가의 안녕히살아보기'), 480000, 120, 2538, 2.1, { category: '여행/이벤트', memo: '한글 간판 장면으로 쇼츠 컷 만들기' }),
  vid(2, '[충격단독] 장사의신 은현장이 집 산다니까 75억짜리를 100억에 내놨네?', ch('장사의 신', { followers: 1120000, power: 8.1 }), 120000, 72, 724, 0.6, { category: '인물/블로그', memo: '부동산 썸네일 구도 참고' }),
  vid(3, '사진은 기세다 ㅋㅋㅋ | KBS 방송', ch('KBS COMEDY: 크크티비'), 31000, 170, 861, 0.2),
  { id: 'v4', url: 'https://www.youtube.com/watch?v=VIDEO00004', title: '유시민 끔찍한 예언 적중! "지지층이 000 할 수도".. 추석 밥상', platform: 'yt', kind: 'post', domain: 'youtube.com', ids: { videoId: 'VIDEO00004' }, thumb: 'https://i.ytimg.com/vi/VIDEO00004/hqdefault.jpg', createdAt: ago(0.02) },
  { id: 'c1', url: 'https://www.youtube.com/@knowmedia', title: '언론 알아야 바꾼다', platform: 'yt', kind: 'account', domain: 'youtube.com', ids: { handle: '@knowmedia' }, account: ch('언론 알아야 바꾼다', { followers: 210000, total: 1204 }), createdAt: ago(2), enrichedAt: ago(2) },
  vid(5, '편의점 알바가 본 진상 손님 유형 TOP 5', ch('알바몬 스토리'), 210000, 96, 58, 3.4),
  vid(6, '옛날 옛적 한양에 소문난 구두쇠가 살았는데', ch('밤마다 야담'), 77000, 144, 3764, 1.1, { memo: '도입 훅 좋음' }),
  { id: 'w1', url: 'https://brunch.co.kr/@writer/12', title: '나레이션 잘 쓰는 법 — 초보 유튜버를 위한 대본 가이드', platform: 'blog', kind: 'post', domain: 'brunch.co.kr', ids: {}, createdAt: ago(30), category: '노하우/스타일' }
];
const RECENT = [
  ['https://www.youtube.com/watch?v=VIDEO00005', '편의점 알바가 본 진상 손님 유형 TOP 5', 0.01],
  ['http://localhost:8776/유튜브 수익화 필수 조건 정리', '(1995) 유튜브 수익화 필수 조건 정리', 0.2],
  ['https://www.youtube.com/shorts/VIDEO00006', '옛날 옛적 한양에 소문난 구두쇠가 살았는데 #shorts', 0.4],
  ['https://dealbank.com/youtube', 'Youtube Channels for Sale | 채널 매매', 1],
  ['https://myaccount.google.com/data', '데이터 및 개인 정보 보호', 3],
  ['https://console.cloud.google.com/apis/credentials', '사용자 인증 정보 – API 및 서비스', 26]
].map(([url, title, h]) => ({ url, title, at: now - h * 3600e3, favIconUrl: '' }));
const OTHERS = { at: now, profiles: [
  { id: 'pwork', name: '업무용', online: true, items: [
    { url: 'https://www.notion.so/narration', title: '나레이션 잘 쓰는 법 | Notion', at: now - 3 * 60e3 },
    { url: 'https://docs.google.com/spreadsheets/d/1', title: '유튜브 계정목록 - Google Sheets', at: now - 41 * 60e3 },
    { url: 'https://www.youtube.com/watch?v=VIDEO00002', title: '(6530) 무료 Seedance 영상 생성', at: now - 5 * 3600e3 }] },
  { id: 'pyt', name: '유튜브 작업', online: false, items: [
    { url: 'https://www.youtube.com/watch?v=VIDEO00003', title: '(1996) 클로드 코드에서 유튜브 자동화하기', at: now - 25 * 60e3 },
    { url: 'https://www.youtube.com/watch?v=VIDEO00001', title: '(1992) 크레딧 이펙트로 조회수 올리기', at: now - 2 * 3600e3 }] }
] };

async function capture(dpr) {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-screens-')), {
    headless: false, deviceScaleFactor: dpr, executablePath: process.env.CHROME || undefined,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox']
  });
  await ctx.route(/i\.ytimg\.com|yt3\.ggpht\.com/, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svgThumb(r.request().url()) }));
  await ctx.route(/www\.googleapis\.com\/youtube/, () => { /* never answer: keeps "불러오는 중…" visible */ });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  await wait(1200);
  const id = sw.url().split('/')[2];
  const open = await ctx.newPage(); await open.goto('http://localhost:8776/' + encodeURIComponent('유튜브 수익화 필수 조건 정리'));
  await wait(1500); // let the service worker finish recording the open tab before seeding
  await sw.evaluate(async ({ LINKS, RECENT, OTHERS }) => {
    await chrome.storage.local.set({ pl_links: LINKS, pl_recent: RECENT, pl_recentOthers: OTHERS, pl_bridge: { connected: true, at: Date.now() }, pl_ytApiKey: 'SCREENSHOT-KEY', pl_profileName: '개인용' });
  }, { LINKS, RECENT, OTHERS });
  const saved = [];
  const shot = async (page, name) => { const f = path.join(OUT, `${name}@${dpr}x.png`); await page.screenshot({ path: f }); saved.push(f); };

  for (const theme of ['light', 'dark']) {
    await sw.evaluate(async (t) => { await chrome.storage.local.set({ pl_theme: t }); }, theme);
    // side panel
    const sp = await ctx.newPage();
    sp.on('pageerror', (e) => console.log('ERR sidepanel', e.message));
    await sp.setViewportSize({ width: 400, height: 860 });
    await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await wait(900);
    await sp.click('[data-act="view"][data-val="thumb"]'); await wait(700);
    await shot(sp, `sidepanel-thumb-${theme}`);
    await sp.click('[data-act="view"][data-val="list"]'); await wait(300);
    await sp.click('[data-act="sel"][data-id="v1"]'); await sp.click('[data-act="sel"][data-id="v3"]'); await wait(300);
    await shot(sp, `sidepanel-list-${theme}`);
    await sp.click('[data-act="bClear"]');
    await sp.click('[data-act="view"][data-val="detail"]'); await wait(300);
    await sp.click('[data-act="expand"][data-id="v1"]'); await wait(300);
    await shot(sp, `sidepanel-detail-${theme}`);
    await sp.click('[data-act="tab"][data-val="recent"]'); await wait(900);
    await sp.hover('.pl-recent:has(.pl-recent__open)'); await wait(200); // open row: [탭 닫기] [+] [삭제]
    await shot(sp, `sidepanel-recent-${theme}`);
    await sp.close();
    // popup
    const pop = await ctx.newPage();
    await pop.setViewportSize({ width: 380, height: 600 });
    await pop.goto(`chrome-extension://${id}/src/popup/popup.html`); await wait(700);
    await shot(pop, `popup-${theme}`);
    await pop.close();
    // options
    const op = await ctx.newPage();
    await op.setViewportSize({ width: 1200, height: 820 });
    await op.goto(`chrome-extension://${id}/src/options/options.html#design`); await wait(900);
    await shot(op, `settings-design-${theme}`);
    await op.click('[data-nav="rules"]'); await wait(400);
    await shot(op, `settings-rules-${theme}`);
    await op.close();
  }
  await sw.evaluate(async () => { await chrome.storage.local.set({ pl_theme: 'device' }); });
  await ctx.close();
  return saved;
}

const all = [];
for (const dpr of [1, 1.25]) all.push(...await capture(dpr));
server.close();
console.log(all.map((f) => 'saved ' + path.relative(process.cwd(), f)).join('\n'));
process.exit(0);
