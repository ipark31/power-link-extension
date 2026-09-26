// 드래그 선택 토글 · 사이드바 목록 동기화 · 수정 키 없는 드래그 검증. 실행: node tests/marks.mjs
// 오버레이는 닫힌 shadow DOM이라 테두리는 화면 캡처(픽셀 수)로, 목록은 storage로 확인한다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const rows = Array.from({ length: 40 }, (_, i) => `<p style="margin:0;height:40px"><a href="https://example.com/${i}">링크 ${i}</a></p>`).join('');
// window.__eatRightUp: swallow the right-button mouseup before any other listener sees it —
// what Chrome's context menu does after Shift + right click
const guard = `<script>addEventListener('mouseup', (e) => { if (e.button === 2 && window.__eatRightUp) { window.__eatRightUp = false; e.stopImmediatePropagation(); } }, true);</script>`;
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<title>marks</title>${guard}<body style="margin:20px;font:14px sans-serif">${rows}</body>`); }).listen(8777);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-marks-')), { headless: false, viewport: { width: 900, height: 700 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
await sw.evaluate(async () => { const { pl_settings: s = {} } = await chrome.storage.sync.get('pl_settings'); await chrome.storage.sync.set({ pl_settings: Object.assign(s, { notify: false }) }); });
const listed = async () => (await sw.evaluate(async () => ((await chrome.storage.local.get('pl_links')).pl_links || []).map((l) => l.url))).map((u) => +u.split('/').pop()).sort((a, b) => a - b);
const page = await ctx.newPage();
await page.goto('http://localhost:8777/'); await wait(800);
const clip = { x: 0, y: 0, width: 400, height: 460 };
const snap = async (name) => { const b = await page.screenshot({ clip }); fs.writeFileSync(path.join(OUT, `marks-${name}.png`), b); return b; };
// count differing pixels in the browser (canvas): an outline changes hundreds of pixels
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
const park = async () => { await page.mouse.move(380, 20); await wait(400); }; // same pointer spot for every shot
const drag = async (mod, x1, y1, x2, y2, { esc = false } = {}) => {
  if (mod) await page.keyboard.down(mod);
  await page.mouse.move(x1, y1); await page.mouse.down({ button: 'right' });
  await page.mouse.move(x2, y2, { steps: 12 }); await wait(100);
  if (esc) await page.keyboard.press('Escape');
  await page.mouse.up({ button: 'right' }); if (mod) await page.keyboard.up(mod); await wait(900); await park();
};
const lasso = async (pts) => {
  await page.keyboard.down('Alt'); await page.mouse.move(...pts[0]); await page.mouse.down({ button: 'right' });
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 8 });
  await wait(100); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Alt'); await wait(900); await park();
};

const before = await snap('1-before');
// 1) select: Ctrl box over 링크 0~4 (copy, also saved to the list)
await drag('Control', 10, 15, 200, 205);
const s1 = await snap('2-select-box');
ok('드래그 → 선택된 링크에 테두리', !(await same(before, s1)), lastDiff + 'px');
ok('드래그 → 사이드바 목록에 추가', JSON.stringify(await listed()) === '[0,1,2,3,4]', JSON.stringify(await listed()));
// Alt lasso around 링크 6~8 (save)
await lasso([[40, 250], [40, 300], [40, 365]]); // 선 긋기: a vertical line through 링크 6~8
const s2 = await snap('3-select-lasso');
ok('다른 링크를 선택하면 그 테두리도 함께 남음', !(await same(s1, s2)), lastDiff + 'px');
ok('선 긋기 선택도 목록에 추가', JSON.stringify(await listed()) === '[0,1,2,3,4,6,7,8]', JSON.stringify(await listed()));

// 2) toggle: drag the outlined 링크 0~4 again → outlines off, removed from the list
await drag('Control', 10, 15, 200, 205);
const s3 = await snap('4-toggle-off');
ok('테두리 있는 링크를 다시 드래그 → 테두리 없어짐', !(await same(s2, s3)), lastDiff + 'px');
ok('다시 드래그 → 사이드바 목록에서 삭제', JSON.stringify(await listed()) === '[6,7,8]', JSON.stringify(await listed()));
// mixed: 링크 4~6 (4 off → select, 5 off → select, 6 on → deselect)
await drag('Control', 10, 175, 200, 285);
ok('섞인 영역은 링크마다 토글', JSON.stringify(await listed()) === '[4,5,7,8]', JSON.stringify(await listed()));

// 3) side panel deletes 링크 7 → its outline disappears on the page
const s4 = await snap('5-before-panel-delete');
await sw.evaluate(async () => { const l = (await chrome.storage.local.get('pl_links')).pl_links || []; await chrome.storage.local.set({ pl_links: l.filter((x) => !x.url.endsWith('/7')) }); });
await wait(500);
ok('사이드바에서 삭제 → 페이지 테두리도 없어짐', !(await same(s4, await snap('6-after-panel-delete'))), lastDiff + 'px');

// 4) scroll follows, Esc keeps nothing, reload clears
const s5 = await snap('7-now');
await page.mouse.wheel(0, 120); await wait(500);
ok('스크롤하면 테두리가 링크를 따라 움직임', !(await same(s5, await snap('8-scrolled'))), lastDiff + 'px');
await page.mouse.wheel(0, -120); await park();
ok('다시 올리면 같은 자리', await same(s5, await snap('9-back')), lastDiff + 'px');
await drag('Control', 10, 375, 200, 445, { esc: true });
ok('Esc로 취소한 드래그는 아무것도 바꾸지 않음', await same(s5, await snap('10-esc')) && JSON.stringify(await listed()) === '[4,5,8]', lastDiff + 'px · ' + JSON.stringify(await listed()));

// 5) no modifier → nothing happens (bug: a plain right drag opened tabs)
const pages0 = ctx.pages().length;
await drag(null, 10, 375, 200, 445);
ok('수정 키 없이 우클릭 드래그 → 아무 동작 없음', ctx.pages().length === pages0 && await same(s5, await snap('11-plain')) && JSON.stringify(await listed()) === '[4,5,8]', `탭 ${ctx.pages().length - pages0}개 · ${lastDiff}px`);
// Shift + right click whose mouseup is swallowed (context menu), then a plain right drag
await page.evaluate(() => { window.__eatRightUp = true; });
await page.keyboard.down('Shift'); await page.mouse.move(300, 380); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Shift');
await drag(null, 10, 375, 200, 445);
ok('Shift+우클릭 뒤 수정 키 없는 드래그 → 새 탭 안 열림', ctx.pages().length === pages0, `탭 ${ctx.pages().length - pages0}개`);
// the modifier released before the drag really starts → nothing
await page.keyboard.down('Shift'); await page.mouse.move(10, 375); await page.mouse.down({ button: 'right' }); await page.keyboard.up('Shift');
await page.mouse.move(200, 445, { steps: 12 }); await page.mouse.up({ button: 'right' }); await wait(900);
ok('드래그 시작 전에 Shift를 떼면 → 새 탭 안 열림', ctx.pages().length === pages0, `탭 ${ctx.pages().length - pages0}개`);

await page.reload(); await page.evaluate(() => document.fonts.ready); await wait(1500); await park();
ok('새로고침하면 테두리 사라짐', await same(before, await snap('12-reloaded')), lastDiff + 'px');
console.log(R.join('\n'));
await ctx.close(); srv.close();
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
