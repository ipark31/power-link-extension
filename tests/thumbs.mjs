// 썸네일 압축 저장 검증. 실행: PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tests/thumbs.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs';
const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const ctx = await chromium.launchPersistentContext('/tmp/pl-prof-' + Date.now(), { headless: false, acceptDownloads: true, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const hits = [];
const jpg = Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]), Buffer.alloc(3000, 7)]);
await ctx.route('https://i.ytimg.com/**', (r) => { const u = r.request().url(); hits.push(u.replace('https://i.ytimg.com/vi/','')); if (u.includes('AAAAAAAAAA2/maxres')) return r.fulfill({ status: 404, body: '' }); return r.fulfill({ status: 200, contentType: 'image/jpeg', body: jpg }); });
await ctx.route('https://yt3.example/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: jpg }));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await new Promise(r=>setTimeout(r,1500));
const id = sw.url().split('/')[2];
await sw.evaluate(async () => { const now = new Date().toISOString(); await chrome.storage.local.set({ pl_links: [
  { id: 'a1', url: 'https://www.youtube.com/watch?v=AAAAAAAAAA1', title: '에어컨 틈에서 털이: "이것"?', platform: 'yt', kind: 'post', ids: { videoId: 'AAAAAAAAAA1' }, thumb: 'https://i.ytimg.com/vi/AAAAAAAAAA1/hqdefault.jpg', createdAt: now },
  { id: 'a2', url: 'https://www.youtube.com/watch?v=AAAAAAAAAA2', title: '같은 제목', platform: 'yt', kind: 'post', ids: { videoId: 'AAAAAAAAAA2' }, thumb: 'https://i.ytimg.com/vi/AAAAAAAAAA2/hqdefault.jpg', createdAt: now },
  { id: 'a3', url: 'https://www.youtube.com/watch?v=AAAAAAAAAA3', title: '같은 제목', platform: 'yt', kind: 'post', ids: { videoId: 'AAAAAAAAAA3' }, createdAt: now },
  { id: 'c1', url: 'https://www.youtube.com/@shortslab', title: '@shortslab', platform: 'yt', kind: 'account', ids: { handle: 'shortslab' }, account: { name: '쇼츠연구소' }, thumb: 'https://yt3.example/avatar.png', createdAt: now },
  { id: 'w1', url: 'https://example.com/x', title: '썸네일 없음', platform: 'web', kind: 'post', createdAt: now } ] }); });
const sp = await ctx.newPage(); sp.on('pageerror', e => console.log('ERR', e.message));
await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await sp.waitForTimeout(600);
await sp.click('[data-act="bThumbs"]'); await sp.waitForTimeout(3000);
const d = await sw.evaluate(async () => (await chrome.downloads.search({})).map(x => ({ f: x.filename, s: x.state, n: x.bytesReceived })));
console.log('downloads', JSON.stringify(d));
if (d[0]) fs.copyFileSync(d[0].f, 'thumbs-test.zip');
console.log('toast', await sp.evaluate(() => [...document.body.children].filter(e => e.tagName === 'DIV' && e.style.position === 'fixed').pop()?.innerText));
console.log('fetched', hits.join(' '));
await ctx.close(); process.exit(0);
