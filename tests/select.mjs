// 부분 선택 · 유튜브 플레이어 선택 · 페이지 확인 모달 검증. 실행: node tests/select.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const big = `<a href="https://example.com/big" style="display:block;width:420px;height:160px;background:#ddd;margin:20px">큰 카드 링크</a>`
  + Array.from({ length: 6 }, (_, i) => `<p style="margin:0 20px;height:40px"><a href="https://example.com/n${i}">링크 ${i}</a></p>`).join('');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<title>select</title><body style="margin:0;font:14px sans-serif">${big}</body>`); }).listen(8778);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-select-')), { headless: false, viewport: { width: 1000, height: 700 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
// a fake YouTube watch page: player box without any link on it
await ctx.route(/^https:\/\/www\.youtube\.com\/watch\?v=TESTVIDEO01/, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
  body: '<title>(12) 테스트 영상 제목 - YouTube</title><body style="margin:0"><div id="movie_player" style="width:640px;height:360px;margin:20px;background:#111"></div><a href="https://www.youtube.com/watch?v=OTHER000001" style="display:block;margin:20px">다른 영상</a></body>' }));
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
await sw.evaluate(async () => { const { pl_settings: s = {} } = await chrome.storage.sync.get('pl_settings'); await chrome.storage.sync.set({ pl_settings: Object.assign(s, { notify: false, confirmOver: 2 }) }); });
const listed = () => sw.evaluate(async () => ((await chrome.storage.local.get('pl_links')).pl_links || []).map((l) => l.url + ' | ' + l.title));
const clearList = () => sw.evaluate(async () => { await chrome.storage.local.set({ pl_links: [] }); });
const lasso = async (page, pts) => {
  await page.keyboard.down('Alt'); await page.mouse.move(...pts[0]); await page.mouse.down({ button: 'right' });
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 8 });
  await wait(100); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Alt'); await wait(900);
};
const box = async (page, mod, x1, y1, x2, y2) => {
  await page.keyboard.down(mod); await page.mouse.move(x1, y1); await page.mouse.down({ button: 'right' });
  await page.mouse.move(x2, y2, { steps: 12 }); await wait(100); await page.mouse.up({ button: 'right' }); await page.keyboard.up(mod); await wait(700);
};

// 1) lasso over only the right-bottom corner of a big card link (its center stays outside)
const page = await ctx.newPage(); await page.goto('http://localhost:8778/'); await wait(800);
await lasso(page, [[330, 120], [520, 120], [520, 230], [330, 230], [330, 122]]);
ok('자유도형이 큰 링크의 일부만 덮어도 선택', (await listed()).some((u) => u.includes('/big')), JSON.stringify(await listed()));

// 2) YouTube player: drag over part of it → the video being watched is selected
await clearList();
const yt = await ctx.newPage(); await yt.goto('https://www.youtube.com/watch?v=TESTVIDEO01'); await wait(1000);
await box(yt, 'Control', 500, 250, 600, 330); // only a corner of the 640x360 player, no links inside
const got = await listed();
ok('유튜브 플레이어 일부만 드래그 → 지금 보는 영상 선택', got.length === 1 && got[0].includes('watch?v=TESTVIDEO01') && got[0].includes('테스트 영상 제목'), JSON.stringify(got));
await yt.screenshot({ path: path.join(OUT, 'select-player.png'), clip: { x: 0, y: 0, width: 700, height: 440 } });
await box(yt, 'Control', 500, 250, 600, 330);
ok('플레이어를 다시 드래그 → 선택 해제·목록에서 삭제', (await listed()).length === 0, JSON.stringify(await listed()));

// 3) opening more tabs than confirmOver asks in the page modal (not the browser confirm)
let dialogs = 0; page.on('dialog', (d) => { dialogs++; d.dismiss(); });
await page.bringToFront(); await page.reload(); await wait(900);
const n0 = ctx.pages().length;
await box(page, 'Shift', 20, 190, 200, 420); // 링크 0~5 → 6 tabs > confirmOver 2
await page.screenshot({ path: path.join(OUT, 'select-modal.png'), clip: { x: 0, y: 0, width: 1000, height: 700 } });
ok('많이 열 때 브라우저 confirm 대신 자체 모달', dialogs === 0 && ctx.pages().length === n0, `dialog ${dialogs} · 탭 +${ctx.pages().length - n0}`);
await page.keyboard.press('Escape'); await wait(600);
ok('모달에서 Esc → 탭 안 열림', ctx.pages().length === n0);
await page.reload(); await wait(900);
await box(page, 'Shift', 20, 190, 200, 420);
await page.keyboard.press('Enter'); await wait(1500);
ok('모달에서 Enter(열기) → 탭 열림', ctx.pages().length - n0 >= 6, `탭 +${ctx.pages().length - n0}`);

console.log(R.join('\n'));
await ctx.close(); srv.close();
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
