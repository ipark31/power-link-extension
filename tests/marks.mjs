// 드래그를 끝낸 뒤 선택 영역이 페이지에 남는지 검증. 실행: node tests/marks.mjs
// 오버레이는 닫힌 shadow DOM이라 화면 캡처를 비교한다: 드래그 전 / 후 / 스크롤 후 / 새로고침 후.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const rows = Array.from({ length: 40 }, (_, i) => `<p style="margin:0;height:40px"><a href="https://example.com/${i}">링크 ${i}</a></p>`).join('');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<title>marks</title><body style="margin:20px;font:14px sans-serif">${rows}</body>`); }).listen(8777);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-marks-')), { headless: false, viewport: { width: 900, height: 700 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
await sw.evaluate(async () => { const { pl_settings: s = {} } = await chrome.storage.sync.get('pl_settings'); await chrome.storage.sync.set({ pl_settings: Object.assign(s, { notify: false }) }); });
const page = await ctx.newPage();
await page.goto('http://localhost:8777/'); await wait(800);
const clip = { x: 0, y: 0, width: 400, height: 460 };
const snap = async (name) => { const b = await page.screenshot({ clip }); fs.writeFileSync(path.join(OUT, `marks-${name}.png`), b); return b; };
// count differing pixels in the browser (canvas) — a kept box/lasso changes hundreds of pixels,
// re-rasterized dashes only a handful
const diffPx = (a, b) => page.evaluate(async ([a, b]) => {
  const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
  const da = px(ia), db = px(ib);
  let n = 0;
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 30) n++;
  return n;
}, [a.toString('base64'), b.toString('base64')]);
let lastDiff = 0;
const same = async (a, b) => (lastDiff = await diffPx(a, b)) < 40;

const before = await snap('1-before');
const park = async () => { await page.mouse.move(380, 20); await wait(400); }; // same pointer spot for every shot
const box = async (mod, x1, y1, x2, y2, esc) => {
  await page.keyboard.down(mod); await page.mouse.move(x1, y1); await page.mouse.down({ button: 'right' });
  await page.mouse.move(x2, y2, { steps: 12 }); await wait(100);
  if (esc) await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'right' }); await page.keyboard.up(mod); await wait(900); await park();
};
// Ctrl + right drag (box, copy) over 링크 0~4
await box('Control', 10, 15, 200, 205);
const afterBox = await snap('2-after-box');
ok('드래그가 끝나면 선택된 링크마다 테두리가 남음', !(await same(before, afterBox)), lastDiff + 'px 차이');
// Alt + right drag (lasso, save) around 링크 6~8
await page.keyboard.down('Alt'); await page.mouse.move(10, 255); await page.mouse.down({ button: 'right' });
for (const [x, y] of [[180, 255], [180, 375], [10, 375], [10, 258]]) await page.mouse.move(x, y, { steps: 8 });
await wait(100); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Alt'); await wait(900); await park();
const afterLasso = await snap('3-after-lasso');
ok('다른 링크를 선택하면 그 테두리도 함께 남음', !(await same(afterBox, afterLasso)), lastDiff + 'px 차이');
// select 링크 0~4 again with the same rule → no second outline (nothing changes)
await box('Control', 10, 15, 200, 205);
ok('이미 선택한 링크는 테두리를 겹쳐 그리지 않음', await same(afterLasso, await snap('4-again')), lastDiff + 'px 차이');
await page.mouse.wheel(0, 120); await wait(500);
ok('스크롤하면 테두리가 링크를 따라 움직임', !(await same(afterLasso, await snap('5-scrolled'))), lastDiff + 'px 차이');
await page.mouse.wheel(0, -120); await park();
ok('다시 올리면 같은 자리', await same(afterLasso, await snap('6-back')), lastDiff + 'px 차이');
// Esc during a drag over 링크 9~10 → no outlines
await box('Control', 10, 375, 200, 445, true);
ok('Esc로 취소한 드래그의 링크는 표시하지 않음', await same(afterLasso, await snap('7-esc')), lastDiff + 'px 차이');
await page.reload(); await wait(1000); await park();
ok('새로고침하면 사라짐', await same(before, await snap('8-reloaded')), lastDiff + 'px 차이');console.log(R.join('\n'));
await ctx.close(); srv.close();
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
