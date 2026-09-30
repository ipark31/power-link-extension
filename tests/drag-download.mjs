// 우클릭 드래그(수정키 없음) → 영상 다운로드 목록창 → [다운로드] 검증. 실행: node tests/drag-download.mjs
// 다운로더 서버는 목(/batch, /batch/:id)으로 대신한다. 목록창은 닫힌 shadow root 안이라 DOM 으로 못 보므로
// 저장소(pl_links)·목 서버가 받은 요청·화면 좌표 클릭으로 확인한다.
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
const until = async (fn, ms = 10000, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await wait(step); } try { return !!(await fn()); } catch (e) { return false; } };

// 썸네일 링크 안의 배지: 다른 확장(vidIQ 등)이 넣는 통계. 제목으로 쓰이면 안 된다
const BADGES = ['<img alt="" style="width:40px;height:20px"><span>29.7K VPH</span>', '<span>306 VPH 7.5x</span>', '<img alt="" style="width:40px;height:20px"><span>12:34</span><span>1.2M VPH</span>'];
// 페이지: 유튜브 카드 3개 + 블로그 링크 1개
const PAGE = `<!doctype html><meta charset="utf-8"><title>drag test</title><body style="margin:0;padding:40px;font-family:sans-serif">
<div style="display:flex;gap:20px;">
${[1, 2, 3].map((i) => `<div style="width:220px"><a href="https://www.youtube.com/watch?v=VIDEO000000${i}" style="display:block;height:120px;background:#ccc">${BADGES[i - 1]}</a><a href="https://www.youtube.com/watch?v=VIDEO000000${i}" style="display:block;padding:6px 0">영상 제목 ${i}</a></div>`).join('')}
<div style="width:220px"><a href="https://blog.naver.com/x/${1}" style="display:block;height:120px;background:#dde"></a><a href="https://blog.naver.com/x/1" style="display:block;padding:6px 0">블로그 글</a></div>
</div></body>`;
const posted = [];
let polls = 0;
const batch = { batch_id: 'b1', status: 'running', save_dir: 'D:\\PL', mode: 'both', total: 0, progress: 0, counts: {}, items: [] };
const server = http.createServer((q, r) => {
  const json = (code, obj) => { r.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); r.end(JSON.stringify(obj)); };
  if (q.url === '/page') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(PAGE); }
  if (q.url === '/api/health') return json(200, { status: 'ok' });
  if (q.url === '/api/batch' && q.method === 'POST') {
    let body = ''; q.on('data', (c) => (body += c)); q.on('end', () => {
      const req = JSON.parse(body); posted.push(req);
      batch.total = req.urls.length; batch.items = req.urls.map((u, i) => ({ url: u, task_id: 't' + i, status: 'pending', progress: 0 }));
      batch.counts = { pending: batch.total, downloading: 0, completed: 0, error: 0 };
      json(202, batch);
    });
    return;
  }
  if (q.url.startsWith('/api/batch/')) {
    polls++;
    if (polls >= 2) { batch.items.forEach((it) => Object.assign(it, { status: 'completed', progress: 100, file_path: 'D:\\PL\\' + it.url.slice(-12) + '.mp4' })); batch.progress = 100; batch.counts = { pending: 0, downloading: 0, completed: batch.total, error: 0 }; batch.status = 'done'; }
    else { batch.items[0].status = 'downloading'; batch.items[0].progress = 40; batch.progress = 20; batch.counts = { pending: batch.total - 1, downloading: 1, completed: 0, error: 0 }; }
    return json(200, batch);
  }
  json(404, {});
}).listen(8781);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-drag-'));
const ctx = await chromium.launchPersistentContext(work, { headless: false, viewport: { width: 1200, height: 800 }, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
  // 기존 사용자 이관: 규칙 3개만 저장된 상태에서 onInstalled 가 r4 를 붙였는지
  const rules = await sw.evaluate(async () => (await chrome.storage.sync.get('pl_settings')).pl_settings?.rules);
  ok('설치 시 기본 규칙에 우클릭 드래그=영상 다운로드 포함', !rules || rules.some((r) => r.mod === 'none' && r.button === 'right' && r.action === 'download'), JSON.stringify(rules && rules.map((r) => r.mod + ':' + r.button + '=' + r.action)));
  await sw.evaluate(async () => {
    const s = (await chrome.storage.sync.get('pl_settings')).pl_settings || {};
    s.dl = { server: 'http://127.0.0.1:8781/api', saveDir: 'D:\\PL', mode: 'both', quality: '', concurrency: 2 };
    await chrome.storage.sync.set({ pl_settings: s });
    await chrome.storage.local.set({ pl_links: [] });
  });

  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8781/page'); await wait(800);
  // 수정키 없이 우클릭 드래그: 카드 3개 + 블로그 1개를 모두 감싼다
  await page.mouse.move(20, 20); await page.mouse.down({ button: 'right' });
  await page.mouse.move(600, 100, { steps: 6 }); await page.mouse.move(1000, 220, { steps: 10 }); await wait(150);
  await page.mouse.up({ button: 'right' }); await wait(900);

  const links = await sw.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links || []);
  ok('드래그 후 영상 링크 3개가 목록에 담김 (블로그 제외)', links.length === 3 && links.every((l) => l.platform === 'yt'), links.map((l) => l.url.slice(-12)).join(','));
  ok('썸네일의 통계 배지(VPH)가 아니라 영상 제목이 담김', links.every((l, i) => l.title === '영상 제목 ' + (i + 1)), links.map((l) => l.title).join(' | '));
  ok('요청은 아직 안 보냄 (목록창만 뜸)', posted.length === 0);

  // 목록창의 [다운로드 3개] 버튼: 창 오른쪽 아래 (right 24 · bottom 24 · 푸터 padding 12 · 버튼 30px)
  await page.mouse.click(1200 - 24 - 12 - 48, 800 - 24 - 12 - 15); await wait(600);
  ok('[다운로드] 클릭 → 서버에 POST /batch', await until(() => posted.length === 1, 4000), String(posted.length));
  const req = posted[0] || {};
  ok('요청 URL 3개 · referer 는 페이지 주소 · save_dir 전달', Array.isArray(req.urls) && req.urls.length === 3 && req.referer === 'http://127.0.0.1:8781/page' && req.save_dir === 'D:\\PL', JSON.stringify({ n: req.urls && req.urls.length, referer: req.referer, save_dir: req.save_dir }));
  ok('진행 폴링 후 완료', await until(() => polls >= 2, 8000), 'polls=' + polls);

  // 목록창에서 다시 우클릭 드래그(빈 곳): 영상 링크 없음 → 목록 그대로
  await page.mouse.move(20, 400); await page.mouse.down({ button: 'right' }); await page.mouse.move(300, 500, { steps: 6 }); await wait(100); await page.mouse.up({ button: 'right' }); await wait(600);
  const links2 = await sw.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links || []);
  ok('빈 곳 드래그: 목록 변화 없음', links2.length === 3);
  // 단순 우클릭(드래그 없음)은 아무 것도 하지 않는다
  await page.mouse.click(600, 300, { button: 'right' }); await page.keyboard.press('Escape'); await wait(400);
  ok('단순 우클릭: 요청/목록 변화 없음', posted.length === 1 && (await sw.evaluate(async () => ((await chrome.storage.local.get('pl_links')).pl_links || []).length)) === 3);
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
