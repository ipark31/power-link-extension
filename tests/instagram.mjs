// 인스타그램 영상(링크가 없는 <video>) 수집 검증. 실행: node tests/instagram.mjs
// 인스타그램 페이지는 가짜(route)로 대신한다. 다운로더 서버는 목(/batch).
//   릴스 보기(/reels/코드)  : 영상 위를 드래그하면 주소창의 릴스가 잡힌다 (옆의 음원 링크·다음 릴스는 아님)
//   우클릭           → 다운로드 창 → [다운로드] 요청에 인스타 쿠키는 그 링크에만 붙는다
//   우클릭 + Ctrl    → 사이드바 목록에 추가 / 다시 하면 빠짐 (제목은 캡션 첫 줄)
//   우클릭 + Shift   → 릴스가 새 탭으로 열림 / 다시 하면 닫힘
//   홈 피드(/)       : 영상마다 감싼 게시물의 링크로 주소를 만든다
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const R = [];
const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await wait(step); } try { return !!(await fn()); } catch (e) { return false; } };

const REEL = 'https://www.instagram.com/reel/Daxy8JyyuST/';
// 릴스 보기: 가운데 영상(x 400~737, y 60~660) + 영상 위 가입 안내 링크(로그인 안 했을 때 뜨는 창) + 오른쪽 음원·계정·댓글 링크
// + 화면 아래에 미리 받아 둔 다음 릴스
const REELS = `<!doctype html><meta charset="utf-8"><title>Instagram</title>
<meta property="og:url" content="https://www.instagram.com/song_ping7/reel/Daxy8JyyuST/">
<meta property="og:title" content='Instagram의 송대표님 : "컴맹도 클로드 덕분에 캐러셀 공장 돌아갑니다
프롬프트 공유해드릴게요"'>
<body style="margin:0;background:#fff"><main><div style="position:relative;height:1600px">
<div style="position:absolute;left:400px;top:60px;width:337px;height:600px"><video muted style="width:337px;height:600px;background:#000;display:block"></video></div>
<a href="/accounts/emailsignup/" style="position:absolute;left:470px;top:400px;width:200px;height:40px;background:#4f46e5;color:#fff">가입하기</a>
<div style="position:absolute;left:820px;top:420px;width:200px">
  <a href="/reels/audio/286684845235185/" style="display:block">원본 오디오</a>
  <a href="/song_ping7/" style="display:block">song_ping7</a>
  <a href="/p/Daxy8JyyuST/c/18134788099659508/" style="display:block">댓글 보기</a>
</div>
<div style="position:absolute;left:400px;top:900px;width:337px;height:600px"><video muted style="width:337px;height:600px;background:#111;display:block"></video></div>
</div></main></body>`;
// 홈 피드: 게시물 2개. 영상에는 링크가 없고, 아래 시간 표시가 게시물 링크다
const article = (x, user, href) => `<article style="position:absolute;left:${x}px;top:40px;width:400px">
  <header style="height:30px"><a href="/${user}/">${user}</a></header>
  <div><video muted style="width:400px;height:480px;background:#222;display:block"></video></div>
  <a href="${href}" style="display:block;padding:4px 0"><time>1시간</time></a></article>`;
const FEED = `<!doctype html><meta charset="utf-8"><title>Instagram</title><body style="margin:0"><main style="position:relative;height:1200px">
${article(40, 'user_a', '/p/FEEDAAAAA1/')}${article(520, 'user_b', '/user_b/p/FEEDBBBBB2/')}</main></body>`;

const posted = [];
const batch = { batch_id: 'b1', status: 'running', total: 0, progress: 0, counts: {}, items: [] };
const server = http.createServer((q, r) => {
  const json = (code, obj) => { r.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); r.end(JSON.stringify(obj)); };
  if (q.url === '/api/health') return json(200, { status: 'ok' });
  if (q.url === '/api/batch' && q.method === 'POST') {
    let body = ''; q.on('data', (c) => (body += c)); q.on('end', () => {
      const req = JSON.parse(body); posted.push(req);
      batch.total = req.urls.length; batch.items = req.urls.map((u, i) => ({ url: u, task_id: 't' + i, status: 'completed', progress: 100, file_path: 'D:\\PL\\' + i + '.mp4' }));
      batch.counts = { pending: 0, downloading: 0, completed: batch.total, error: 0 }; batch.status = 'done'; batch.progress = 100;
      json(202, batch);
    });
    return;
  }
  if (q.url.startsWith('/api/batch/')) return json(200, batch);
  json(404, {});
}).listen(8785);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-ig-'));
const ctx = await chromium.launchPersistentContext(work, { headless: false, viewport: { width: 1200, height: 800 }, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
  await sw.evaluate(async () => {
    const s = (await chrome.storage.sync.get('pl_settings')).pl_settings || {};
    s.dl = { server: 'http://127.0.0.1:8785/api', saveDir: 'D:\\PL', mode: 'both', quality: '', concurrency: 2 };
    await chrome.storage.sync.set({ pl_settings: s });
    await chrome.storage.local.set({ pl_links: [] });
  });
  await ctx.route('https://www.instagram.com/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: p === '/' ? FEED : REELS });
  });
  await ctx.addCookies([{ name: 'sessionid', value: 'test-session', domain: '.instagram.com', path: '/' }]);

  const page = await ctx.newPage();
  await page.goto('https://www.instagram.com/reels/Daxy8JyyuST/'); await wait(800);
  await page.mouse.move(600, 300); await page.mouse.move(610, 310); await wait(700);   // 드래그 엔진을 미리 올린다
  const stored = () => sw.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links || []);
  const urls = async () => (await stored()).map((l) => l.url).sort().join(' | ');
  const postUrls = async () => (await stored()).map((l) => l.url).filter((u) => /\/(reel|p)\//.test(u)).sort().join(' | ');   // 목록 모드는 영역 안의 다른 링크(가입 안내)도 담는다
  const drag = async (x0, y0, x1, y1, key) => {
    await page.bringToFront();
    if (key) await page.keyboard.down(key);
    await page.mouse.move(x0, y0); await page.mouse.down({ button: 'right' });
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 5 }); await page.mouse.move(x1, y1, { steps: 6 }); await wait(150);
    await page.mouse.up({ button: 'right' });
    if (key) await page.keyboard.up(key);
    await wait(900);
  };
  const overReel = (key) => drag(450, 120, 690, 560, key);   // 가운데 영상 안쪽만 감싼다

  // ---- 1) 우클릭: 다운로드 창 → [다운로드]
  await overReel();
  await page.mouse.click(1200 - 24 - 12 - 48, 800 - 24 - 12 - 15); await wait(600);   // [다운로드 N개]
  ok('릴스 영상 위 우클릭 드래그 → [다운로드] → 서버에 POST /batch', await until(() => posted.length === 1, 5000), String(posted.length));
  const req = posted[0] || {};
  ok('요청 주소는 주소창의 릴스 하나 (가입 안내·음원·다음 릴스 아님)', JSON.stringify(req.urls) === JSON.stringify([REEL]), JSON.stringify(req.urls));
  ok('인스타 로그인 쿠키가 그 링크에 붙음', /sessionid=test-session/.test((req.item_cookies || {})[REEL] || ''), JSON.stringify(Object.keys(req.item_cookies || {})));
  ok('요청 전체 쿠키(cookies)는 보내지 않음', !req.cookies, String(req.cookies));
  await overReel();   // 다운로드 창에서 빼서 원래대로
  await ctx.clearCookies();   // 가짜 로그인 쿠키가 실제 인스타그램으로 나가지 않게

  // ---- 2) 우클릭 + Ctrl: 사이드바 목록
  await overReel('Control');
  ok('Ctrl+드래그 → 사이드바 목록에 릴스 추가', await until(async () => (await postUrls()) === REEL), await urls());
  const t = (await stored()).find((l) => l.url === REEL) || {};
  ok('목록 제목은 캡션 첫 줄', t.title === '컴맹도 클로드 덕분에 캐러셀 공장 돌아갑니다', t.title);
  ok('목록 항목은 인스타그램 게시물로 분류', t.platform === 'ig', `${t.platform}/${t.kind}`);
  await overReel('Control');
  ok('다시 Ctrl+드래그 → 목록에서 빠짐', await until(async () => (await postUrls()) === ''), await urls());

  // ---- 3) 우클릭 + Shift: 새 탭. 확장이 만든 탭의 첫 요청은 route 로 못 막을 때가 있어, 연 주소는 tabs.create 인자로 본다
  await sw.evaluate(() => { const orig = chrome.tabs.create.bind(chrome.tabs); globalThis.__created = []; chrome.tabs.create = (o) => { globalThis.__created.push(o.url); return orig(o); }; });
  const n0 = ctx.pages().length;
  await overReel('Shift');
  const created = await sw.evaluate(() => globalThis.__created);
  ok('Shift+드래그 → 릴스가 새 탭으로 열림', await until(() => ctx.pages().length >= n0 + 1) && created.includes(REEL), JSON.stringify(created));
  await overReel('Shift');
  ok('다시 Shift+드래그 → 연 탭이 닫힘', await until(() => ctx.pages().length === n0), `탭 ${ctx.pages().length - n0}개`);

  // ---- 4) 홈 피드: 영상 2개를 한 번에 → [목록에 추가]
  await sw.evaluate(async () => { await chrome.storage.local.set({ pl_links: [] }); });   // 새 탭 규칙이 목록에도 저장했을 수 있다
  await page.goto('https://www.instagram.com/'); await wait(800);
  await page.mouse.move(600, 300); await page.mouse.move(610, 310); await wait(500);
  await drag(60, 90, 900, 520);   // 두 영상만 감싼다 (아래 시간 링크는 제외)
  await page.mouse.click(1200 - 24 - 12 - 238, 800 - 24 - 12 - 15); await wait(700);   // [목록에 추가]
  const want = ['https://www.instagram.com/reel/FEEDAAAAA1/', 'https://www.instagram.com/reel/FEEDBBBBB2/'].join(' | ');
  ok('피드 영상 2개 → 각 게시물 링크로 목록에 추가', await until(async () => (await urls()) === want), await urls());
  const titles = (await stored()).map((l) => l.title).sort().join(' | ');
  ok('피드 제목은 @계정', titles === '@user_a 인스타그램 영상 | @user_b 인스타그램 영상', titles);
} catch (e) {
  R.push('FAIL  예외 ' + (e.stack || e));
} finally {
  await ctx.close().catch(() => {});
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(R.join('\n'));
const fails = R.filter((l) => l.startsWith('FAIL')).length;
console.log(`\n${R.length - fails}/${R.length} passed`);
process.exit(fails ? 1 : 0);
