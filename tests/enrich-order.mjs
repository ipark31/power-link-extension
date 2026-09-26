// 유튜브 정보 조회 순서(위→아래) 검증. 실행: PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tests/enrich-order.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const ctx = await chromium.launchPersistentContext('/tmp/pl-prof-' + Date.now(), { headless: false, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const calls = [];
await ctx.route('https://www.googleapis.com/youtube/v3/**', (r) => { const u = new URL(r.request().url()); if (u.pathname.endsWith('videos')) calls.push(u.searchParams.get('id')); r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }); });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await new Promise(r=>setTimeout(r,1500));
const id = sw.url().split('/')[2];
await sw.evaluate(async () => { const t = (i) => new Date(Date.now() - i * 60000).toISOString();
  await chrome.storage.local.set({ pl_ytApiKey: 'K', pl_links: Array.from({ length: 45 }, (_, i) => ({ id: 'v' + i, url: 'https://www.youtube.com/watch?v=VID' + String(i).padStart(8, '0'), title: 't' + i, platform: 'yt', kind: 'post', ids: { videoId: 'VID' + String(i).padStart(8, '0') }, createdAt: t(i) })) }); });
const sp = await ctx.newPage(); await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await sp.waitForTimeout(2500);
const shown = await sp.$$eval('.pl-row-item a[href]', (as) => [...new Set(as.map(a => a.href.split('v=')[1]))].slice(0, 3));
console.log('screen top 3:', shown.join(','));
console.log('API batches:', calls.map(c => c.split(',')[0] + '…' + c.split(',').pop() + ' (' + c.split(',').length + ')').join(' | '));
await ctx.close(); process.exit(0);
