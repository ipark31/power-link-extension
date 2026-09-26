// 선택 테두리가 레이아웃 변화(창 크기 · 확대 · 안쪽 스크롤 · 링크 다시 그리기)를 따라가는지 검증.
// 실행: node tests/relayout.mjs
// 오버레이는 닫힌 shadow DOM이라, 링크의 실제 위치(DOM)와 화면 캡처 픽셀을 비교한다:
// 링크 바깥 3px(왼쪽·오른쪽·위·아래 가운데 점)이 테두리 색(파랑)이면 맞게 붙어 있는 것.
// (테두리 상자 = 링크 + 2px, 선은 그 바깥 2px → 링크에서 2~4px 떨어진 곳이 파랑)
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const cards = Array.from({ length: 8 }, (_, i) => `<a class="card" href="https://example.com/c${i}">카드 ${i}</a>`).join('');
const inner = Array.from({ length: 12 }, (_, i) => `<p style="margin:0;height:34px"><a class="in" href="https://example.com/in${i}">안쪽 링크 ${i}</a></p>`).join('');
const html = `<title>relayout</title><style>
  body{margin:0;font:14px sans-serif;background:#fff}
  #wrap{margin:20px 0 0 20%;width:60%;display:flex;flex-wrap:wrap;gap:12px}
  .card{display:block;width:calc(50% - 6px);height:60px;background:#eee;color:#333}
  #box{margin:16px 0 0 20%;width:300px;height:140px;overflow:auto;border:1px solid #ccc}
</style><div id="wrap">${cards}</div><div id="box">${inner}</div>`;
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); }).listen(8779);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-relayout-')), { headless: false, viewport: { width: 1000, height: 700 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now(); const step = (m) => process.stderr.write(`  [${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);
step('launched'); let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); step('service worker');
// storage goes through an extension page: a service-worker handle goes stale once Chrome idles or
// restarts the worker, and evaluating on it then never returns
const extPage = await ctx.newPage();
await extPage.goto(`chrome-extension://${sw.url().split('/')[2]}/src/offscreen/offscreen.html`);
await extPage.evaluate(async () => { const { pl_settings: s = {} } = await chrome.storage.sync.get('pl_settings'); await chrome.storage.sync.set({ pl_settings: Object.assign(s, { notify: false }) }); });
step('settings');
const page = await ctx.newPage();
await page.goto('http://localhost:8779/'); await wait(800); step('page loaded');

// outline check: 4 points just outside each link must be outline-blue (#2F6BFF ≈ r47 g107 b255)
async function aligned(selector, name, within) {
  const rects = await page.$$eval(selector, (els, within) => { const box = within ? document.querySelector(within).getBoundingClientRect() : { top: 0, bottom: innerHeight }; return els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }).filter((r) => r.w && r.y > box.top + 8 && r.y + r.h < box.bottom - 8); }, within);
  const png = (await page.screenshot({ path: path.join(OUT, `relayout-${name}.png`) })).toString('base64');
  const dpr = await page.evaluate(() => devicePixelRatio);
  return page.evaluate(async ([png, rects, dpr]) => {
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + png; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const blue = (x, y) => { const d = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return d[2] > 180 && d[0] < 120; };
    const bad = [];
    for (const r of rects) {
      const pts = [[r.x - 3, r.y + r.h / 2], [r.x + r.w + 3, r.y + r.h / 2], [r.x + r.w / 2, r.y - 3], [r.x + r.w / 2, r.y + r.h + 3]];
      if (!pts.every(([x, y]) => blue(x, y))) bad.push(Math.round(r.x) + ',' + Math.round(r.y));
    }
    return { n: rects.length, bad };
  }, [png, rects, dpr]);
}
async function blueAt(x, y) {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async ([png, x, y]) => {
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + png; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio), 1, 1).data; return d[2] > 180 && d[0] < 120;
  }, [png, x, y]);
}
const res = (r) => `${r.n}개 중 어긋남 ${r.bad.length}${r.bad.length ? ' ' + r.bad.join(' ') : ''}`;
const drag = async (x1, y1, x2, y2) => {
  await page.keyboard.down('Control'); await page.mouse.move(x1, y1); await page.mouse.down({ button: 'right' });
  await page.mouse.move(x2, y2, { steps: 12 }); await wait(100); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Control');
  await wait(900); await page.mouse.move(5, 690); await wait(300);
};

// mark all cards and all inner links
const wr = await page.$eval('#wrap', (e) => e.getBoundingClientRect().toJSON());
const stored = () => extPage.evaluate(async () => ((await chrome.storage.local.get('pl_links')).pl_links || []).length);
await page.bringToFront();
// the content script may not be ready right after load: repeat the first drag until it lands
for (let i = 0; i < 3 && !(await stored()); i++) { await drag(wr.left - 5, wr.top - 5, wr.right + 5, wr.bottom + 5); if (!(await stored())) await wait(1500); }
const br = await page.$eval('#box', (e) => e.getBoundingClientRect().toJSON());
await drag(br.left - 5, br.top - 5, br.left + 150, br.bottom + 5);
step('marked'); let r = await aligned('.card', '1-marked'); ok('표시 직후 테두리가 링크에 맞음', r.n === 8 && !r.bad.length, res(r));

// 1) window narrower (= side panel wider / browser window resized): cards re-flow
await page.setViewportSize({ width: 760, height: 700 }); await wait(700);
r = await aligned('.card', '2-resized'); ok('창 크기가 바뀌면 테두리가 링크를 따라감', r.n === 8 && !r.bad.length, res(r));
// 2) the page re-lays out without any resize event (font size / margins change, content loads)
await page.evaluate(() => { document.body.style.fontSize = '18px'; const w = document.getElementById('wrap'); w.style.marginLeft = '8%'; w.querySelectorAll('.card').forEach((c) => { c.style.height = '76px'; }); }); await wait(1400);
r = await aligned('.card', '3-reflowed'); ok('창 크기 변화 없이 레이아웃만 바뀌어도 테두리가 따라감', r.n >= 4 && !r.bad.length, res(r));
// 3) inner scroller
await page.$eval('#box', (e) => { e.scrollTop = 60; }); await wait(600);
r = await aligned('#box .in', '4-inner-scroll', '#box'); ok('안쪽 영역을 스크롤하면 테두리가 따라감', r.n >= 2 && !r.bad.length, res(r));
const hidden = await page.evaluate(() => { const b = document.querySelector('#box').getBoundingClientRect(); const a = [...document.querySelectorAll('.in')].find((e) => e.getBoundingClientRect().top > b.bottom + 5); const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
ok('스크롤 영역에 가려진 링크는 테두리를 그리지 않음', !(await blueAt(hidden.x - 0, hidden.y - 12 - 3)) && !(await blueAt(hidden.x, hidden.y + 12 + 3)));
// 4) the site re-renders its cards (new elements, same URLs)
await page.evaluate(() => { for (const a of document.querySelectorAll('.card')) a.replaceWith(a.cloneNode(true)); }); await wait(1600);
r = await aligned('.card', '5-rerendered'); ok('링크를 다시 그려도(요소 교체) 테두리가 다시 붙음', r.n === 8 && !r.bad.length, res(r));

console.log(R.join('\n'));
await Promise.race([ctx.close(), wait(5000)]); srv.close();
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
