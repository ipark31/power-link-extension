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
const clip = { x: 0, y: 0, width: 400, height: 330 };
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
// Alt + right drag = lasso "save"; Ctrl + right drag = box "copy"
await page.keyboard.down('Control'); await page.mouse.move(10, 30); await page.mouse.down({ button: 'right' });
await page.mouse.move(300, 250, { steps: 12 }); await wait(100); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Control');
await wait(900);
const afterBox = await snap('2-after-box');
ok('드래그를 끝낸 뒤에도 박스가 남음', !(await same(before, afterBox)), lastDiff + 'px 차이');
await page.keyboard.down('Alt'); await page.mouse.move(60, 60); await page.mouse.down({ button: 'right' });
for (const [x, y] of [[200, 70], [220, 200], [70, 210], [60, 70]]) await page.mouse.move(x, y, { steps: 8 });
await wait(100); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Alt');
await wait(900);
const afterLasso = await snap('3-after-lasso');
ok('두 번째 드래그(자유도형)도 함께 남음', !(await same(afterBox, afterLasso)), lastDiff + 'px 차이');
await page.mouse.wheel(0, 120); await wait(500);
const scrolled = await snap('4-scrolled');
ok('스크롤하면 표시가 페이지를 따라 움직임', !(await same(afterLasso, scrolled)), lastDiff + 'px 차이');
await page.mouse.wheel(0, -120); await wait(500);
ok('다시 올리면 같은 자리', await same(afterLasso, await snap('5-back')), lastDiff + 'px 차이');
// Esc during a drag → nothing new is kept
await page.keyboard.down('Control'); await page.mouse.move(250, 20); await page.mouse.down({ button: 'right' });
await page.mouse.move(390, 320, { steps: 8 }); await page.keyboard.press('Escape'); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Control');
await page.mouse.move(60, 70); await wait(500); // same pointer spot as the reference shot
ok('Esc로 취소한 드래그는 남지 않음', await same(afterLasso, await snap('6-esc')), lastDiff + 'px 차이');
await page.reload(); await wait(1000);
ok('새로고침하면 사라짐', await same(before, await snap('7-reloaded')), lastDiff + 'px 차이');
console.log(R.join('\n'));
await ctx.close(); srv.close();
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
