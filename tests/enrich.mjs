// 유튜브 정보 자동 수집 검증 (API는 가짜 응답). 실행: PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tests/enrich.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
const DIR = fileURLToPath(new URL('./', import.meta.url));
import http from 'http'; import fs from 'fs';
const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
http.createServer((q, r) => { r.writeHead(200, {'content-type':'text/html; charset=utf-8'}); r.end(fs.readFileSync(DIR + 'yt.html')); }).listen(8771);
const ctx = await chromium.launchPersistentContext('/tmp/pl-prof-' + Date.now(), { headless: false, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'], viewport: { width: 1200, height: 800 } });
const calls = [];
await ctx.route('https://www.googleapis.com/youtube/v3/**', async (route) => {
  const u = new URL(route.request().url()); const path = u.pathname.split('/').pop(); calls.push(path + ':' + (u.searchParams.get('id') || u.searchParams.get('playlistId') || u.searchParams.get('forHandle') || ''));
  await new Promise(r => setTimeout(r, 800)); // slow API
  let body = { items: [] };
  if (path === 'videos') body = { items: (u.searchParams.get('id') || '').split(',').filter(Boolean).map((id, i) => ({ id, snippet: { title: 'API 제목 ' + id.slice(-1), channelId: 'UCchan1', categoryId: '22', publishedAt: '2026-09-01T00:00:00Z', thumbnails: {} }, statistics: { viewCount: '12345', likeCount: '100', commentCount: '7' }, contentDetails: { duration: 'PT8M2S' } })) };
  if (path === 'channels') body = { items: [{ id: 'UCchan1', snippet: { title: '테스트채널', publishedAt: '2020-01-01T00:00:00Z', thumbnails: {} }, statistics: { subscriberCount: '5000', videoCount: '10' }, contentDetails: { relatedPlaylists: { uploads: 'UUchan1' } } }] };
  if (path === 'playlistItems') body = { items: [], pageInfo: { totalResults: 3 } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await new Promise(r=>setTimeout(r,1500));
const id = sw.url().split('/')[2];
await sw.evaluate(async () => chrome.storage.local.set({ pl_ytApiKey: 'TESTKEY' }));
const sp = await ctx.newPage(); sp.on('pageerror', e => console.log('SPERR', e.message));
await sp.setViewportSize({ width: 340, height: 760 });
await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await sp.waitForTimeout(500);
await sp.click('[data-act="view"][data-val="detail"]');
const page = await ctx.newPage(); await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://localhost:8771'});
await page.goto('http://localhost:8771/'); await page.waitForTimeout(700);
const t0 = Date.now();
await page.keyboard.down('Alt'); await page.mouse.move(5,5); await page.mouse.down({button:'right'});
for (const p of [[990,5],[990,200],[5,200]]) await page.mouse.move(p[0],p[1],{steps:8});
await page.mouse.up({button:'right'}); await page.keyboard.up('Alt');
// how fast do links appear (before API finishes)?
let first = null;
for (let i=0;i<40;i++){ const n = (await sw.evaluate(async()=> ((await chrome.storage.local.get('pl_links')).pl_links||[]).length)); if (n && first===null) { first = Date.now()-t0; break; } await new Promise(r=>setTimeout(r,50)); }
console.log('links stored after ms', first);
await sp.bringToFront(); await sp.waitForTimeout(150);
await sp.waitForTimeout(4000);
let L = await sw.evaluate(async()=> (await chrome.storage.local.get('pl_links')).pl_links.map(l=>[l.title,!!l.enrichedAt,l.detail?.views]));
console.log('after', JSON.stringify(L)); console.log('calls1', calls.length, calls.join(' '));
const c1 = calls.length;
// re-collect the same links and reopen the panel: no new API calls expected
await page.bringToFront();
await page.keyboard.down('Alt'); await page.mouse.move(5,5); await page.mouse.down({button:'right'});
for (const p of [[990,5],[990,200],[5,200]]) await page.mouse.move(p[0],p[1],{steps:8});
await page.mouse.up({button:'right'}); await page.keyboard.up('Alt'); await page.waitForTimeout(1500);
await page.keyboard.down('Control'); await page.mouse.move(5,5); await page.mouse.down({button:'right'}); await page.mouse.move(990,200,{steps:8}); await page.mouse.up({button:'right'}); await page.keyboard.up('Control'); await page.waitForTimeout(1500);
await sp.reload(); await sp.waitForTimeout(2000);
console.log('extra calls after recollect/reopen', calls.length - c1);
L = await sw.evaluate(async()=> (await chrome.storage.local.get('pl_links')).pl_links.map(l=>[l.title,!!l.enrichedAt]));
console.log('final', JSON.stringify(L));
await ctx.close(); process.exit(0);
