// 성능 측정(벤치마크). 실행: node tests/perf.mjs  → 결과 표 출력 + tests/screens/perf.json 저장
// 1) 웹페이지(링크 3,000개): 드래그 중 긴 작업(>50ms)·스크립트 시간·메모리, 드래그 후 1분 유휴 비용
// 2) 사이드바(링크 1,000개): 첫 화면 시간, 검색 한 글자 처리 시간, DOM 노드, 메모리, 썸네일 요청 수
// 3) 백그라운드: 탭 5개 열기 → 최근 화면 저장 횟수
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const M = {};

const cells = Array.from({ length: 3000 }, (_, i) => `<a href="https://www.youtube.com/watch?v=V${String(i).padStart(9, '0')}" style="display:inline-block;width:110px;height:22px;margin:2px;overflow:hidden">영상 제목 ${i}</a>`).join('');
const srv = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(q.url.startsWith('/big') ? `<title>big</title><body style="margin:8px;font:12px sans-serif">${cells}</body>` : `<title>p${q.url}</title><h1>${q.url}</h1>`);
}).listen(8795);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-perf-')), { headless: false, viewport: { width: 1280, height: 800 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
await ctx.route(/i\.ytimg\.com/, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' }));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${id}/src/offscreen/offscreen.html`);
await ext.evaluate(async () => { const { pl_settings: s = {} } = await chrome.storage.sync.get('pl_settings'); await chrome.storage.sync.set({ pl_settings: Object.assign(s, { notify: false }) }); });

async function metrics(page) {
  const c = await ctx.newCDPSession(page);
  await c.send('Performance.enable');
  const get = async () => Object.fromEntries((await c.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  return { get, cdp: c };
}

// ---- 1) web page with 3,000 links
const page = await ctx.newPage();
await page.goto('http://localhost:8795/big'); await wait(1500);
await page.evaluate(() => { window.__long = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: false }); });
const pm = await metrics(page);
let a = await pm.get();
await page.keyboard.down('Alt'); await page.mouse.move(20, 20); await page.mouse.down({ button: 'right' });
for (let i = 0; i < 40; i++) await page.mouse.move(20 + i * 25, 20 + i * 18);
await page.mouse.move(20, 700, { steps: 20 }); await page.mouse.move(20, 22, { steps: 20 });
await page.mouse.up({ button: 'right' }); await page.keyboard.up('Alt'); await wait(1500);
let b = await pm.get();
const longs = await page.evaluate(() => window.__long);
M.page = {
  dragScriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000),
  dragTaskMs: Math.round((b.TaskDuration - a.TaskDuration) * 1000),
  longTasks: longs.length, longestMs: Math.round(Math.max(0, ...longs)),
  heapMB: +(b.JSHeapUsedSize / 1048576).toFixed(1), nodes: b.Nodes
};
a = await pm.get(); await wait(10000); b = await pm.get();
M.page.idle10sTaskMs = Math.round((b.TaskDuration - a.TaskDuration) * 1000);
await page.close();

// ---- 2) side panel with 1,000 links
const links = Array.from({ length: 1000 }, (_, i) => ({
  id: 'L' + i, url: `https://www.youtube.com/watch?v=V${String(i).padStart(9, '0')}`, title: `영상 제목 ${i} 알고리즘 쇼츠 분석`, platform: 'yt', kind: 'post', domain: 'youtube.com',
  ids: { videoId: `V${String(i).padStart(9, '0')}` }, thumb: `https://i.ytimg.com/vi/V${String(i).padStart(9, '0')}/hqdefault.jpg`, createdAt: new Date(Date.now() - i * 60000).toISOString(),
  detail: { views: 1000 * i, likes: i, comments: i, uploadedAt: new Date(Date.now() - i * 3600000).toISOString(), duration: 60 + i },
  account: { name: '채널 ' + (i % 50), avatar: '', followers: 1000 + i }, outlier: (i % 30) / 10, enrichedAt: new Date().toISOString(), memo: i % 7 ? '' : '메모 ' + i
}));
await ext.evaluate(async (l) => { await chrome.storage.local.set({ pl_links: l }); }, links);
for (const view of ['list', 'thumb']) {
  await ext.evaluate(async (v) => { const { pl_settings: s = {} } = await chrome.storage.sync.get('pl_settings'); await chrome.storage.sync.set({ pl_settings: Object.assign(s, { sidepanel: { view: v } }) }); }, view);
  let imgReq = 0;
  const sp = await ctx.newPage();
  sp.on('request', (r) => { if (r.url().includes('i.ytimg.com')) imgReq++; });
  await sp.setViewportSize({ width: 400, height: 860 });
  const t0 = Date.now();
  await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`);
  await sp.waitForSelector(view === 'thumb' ? '.pl-tile' : '.pl-lrow');
  const firstMs = Date.now() - t0;
  await wait(1500);
  const spm = await metrics(sp);
  let x = await spm.get();
  await sp.click('#q');
  const k0 = Date.now();
  for (const ch of '알고리즘') await sp.keyboard.type(ch);
  await sp.waitForFunction(() => document.querySelector('#q') && document.querySelector('#q').value === '알고리즘');
  await wait(400);
  const typeMs = Date.now() - k0;
  let y = await spm.get();
  M['panel_' + view] = {
    firstRenderMs: firstMs, type4charsMs: typeMs, type4charsTaskMs: Math.round((y.TaskDuration - x.TaskDuration) * 1000),
    nodes: y.Nodes, heapMB: +(y.JSHeapUsedSize / 1048576).toFixed(1), thumbRequests: imgReq
  };
  await sp.close();
}

// ---- 3) background: storage writes while opening 5 tabs
await ext.evaluate(() => { window.__w = 0; chrome.storage.onChanged.addListener((c) => { if (c.pl_recent) window.__w++; }); });
for (let i = 0; i < 5; i++) { const p = await ctx.newPage(); await p.goto('http://localhost:8795/t' + i); await wait(300); }
await wait(2500);
M.background = { recentWritesFor5Tabs: await ext.evaluate(() => window.__w) };

fs.writeFileSync(path.join(OUT, `perf${process.env.TAG ? '-' + process.env.TAG : ''}.json`), JSON.stringify(M, null, 2));
console.log(JSON.stringify(M, null, 2));
await Promise.race([ctx.close(), wait(5000)]); srv.close();
process.exit(0);
