// 테마 일관성 검증. 실행: node tests/theme.mjs
// 테마 선택(chrome.storage.local 'pl_theme' = light | dark | device)을 바꾸면 팝업 · 사이드바 · 설정 · 페이지 위 다운로드 목록창이
// 모두 같은 테마로, 새로 열지 않아도 바로 바뀌는지 본다. 목록창은 닫힌 shadow root 안이라 화면을 찍어 바탕색으로 확인한다.
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

const PAGE = `<!doctype html><meta charset="utf-8"><title>theme test</title><body style="margin:0;padding:40px;background:#777;font-family:sans-serif">
<div style="width:220px"><a href="https://www.youtube.com/watch?v=VIDEO0000001" style="display:block;height:120px;background:#ccc"></a><a href="https://www.youtube.com/watch?v=VIDEO0000001" style="display:block;padding:6px 0">영상 제목 1</a></div></body>`;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGE); }).listen(8783);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-theme-'));
const ctx = await chromium.launchPersistentContext(work, { headless: false, viewport: { width: 1200, height: 800 }, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
  const id = new URL(sw.url()).host;
  const setTheme = async (t) => { await sw.evaluate(async (t) => chrome.storage.local.set({ pl_theme: t }), t); await wait(500); };
  await setTheme('light');

  const pages = {};
  for (const [name, file] of [['팝업', 'popup/popup.html'], ['사이드바', 'sidepanel/sidepanel.html'], ['설정', 'options/options.html']]) {
    pages[name] = await ctx.newPage();
    await pages[name].goto(`chrome-extension://${id}/src/${file}`); await wait(700);
  }
  // 페이지 위 목록창: 우클릭 드래그로 연다
  const web = await ctx.newPage();
  await web.goto('http://127.0.0.1:8783/'); await wait(800);
  await web.bringToFront();
  await web.mouse.move(20, 20); await web.mouse.down({ button: 'right' });
  await web.mouse.move(200, 100, { steps: 6 }); await web.mouse.move(320, 240, { steps: 8 }); await wait(150);
  await web.mouse.up({ button: 'right' }); await wait(900);

  // 밝기(0~255): 확장 화면은 body 바탕색, 목록창은 창 아래 여백의 실제 화소
  const lumOfPage = (p) => p.evaluate(() => {
    const pick = (el) => { const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number); return m.length > 3 && m[3] === 0 ? null : m; };
    const c = pick(document.querySelector('.pl-app') || document.body) || pick(document.body) || pick(document.documentElement) || [255, 255, 255];
    return Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
  });
  const helper = await ctx.newPage(); await helper.setContent('<canvas></canvas>');
  const lumOfPanel = async () => {
    await web.bringToFront();
    // 창은 오른쪽 아래 24px 띄움, 너비 424px. 아래 여백(12px)의 가운데 화소를 읽는다
    const png = (await web.screenshot({ clip: { x: 1200 - 24 - 212, y: 800 - 24 - 6, width: 4, height: 2 } })).toString('base64');
    return helper.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.querySelector('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, 1, 1).data;
      return Math.round(0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]);
    }, png);
  };
  const hostTheme = () => web.evaluate(() => { const h = document.querySelector('power-link-overlay'); return h ? h.dataset.theme || '' : '(없음)'; });

  const expect = async (label, want) => {
    const light = want === 'light';
    for (const [name, p] of Object.entries(pages)) {
      await p.bringToFront(); await wait(250);   // 사용자가 그 화면을 볼 때의 상태: 가려진 탭은 화면 갱신(기기 테마 변화 포함)을 미룬다
      const attr = await p.evaluate(() => document.documentElement.dataset.theme);
      const lum = await lumOfPage(p);
      ok(`${label}: ${name}`, attr === want && (light ? lum > 200 : lum < 70), `data-theme=${attr}, 바탕 밝기 ${lum}`);
    }
    const attr = await hostTheme(), lum = await lumOfPanel();
    ok(`${label}: 다운로드 목록창`, attr === want && (light ? lum > 200 : lum < 70), `data-theme=${attr}, 바탕 밝기 ${lum}`);
  };

  await expect('밝은 테마', 'light');
  await setTheme('dark');   // 열어 둔 채로 바꾼다
  await expect('어두운 테마로 전환 (새로 열지 않음)', 'dark');
  await setTheme('light');
  await expect('다시 밝은 테마로 전환', 'light');
  // 기기 설정 따르기: 기기가 어두우면 모두 어둡게
  for (const p of [...Object.values(pages), web]) await p.emulateMedia({ colorScheme: 'dark' });
  await setTheme('device');
  await expect('기기 설정 따르기 (기기 어두움)', 'dark');
  for (const p of [...Object.values(pages), web]) await p.emulateMedia({ colorScheme: 'light' });
  await wait(400);
  await expect('기기 설정 따르기 (기기 밝음)', 'light');
} catch (e) {
  R.push('FAIL  예외 ' + (e.stack || e));
} finally {
  await ctx.close().catch(() => {});
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
