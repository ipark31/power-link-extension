// 사이드바 긴 목록(나눠 그리기) 검증. 실행: node tests/list.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-list-')), { headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
await ctx.route(/i\.ytimg\.com/, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' }));
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
const links = Array.from({ length: 300 }, (_, i) => ({ id: 'L' + i, url: `https://example.com/v${i}`, title: `항목 ${i}${i % 2 ? ' 짝' : ''}`, platform: 'web', kind: 'post', domain: 'example.com', ids: {}, createdAt: new Date(Date.now() - i * 60000).toISOString() }));
const sp = await ctx.newPage(); sp.on('pageerror', (e) => R.push('ERR ' + e.message));
await sp.setViewportSize({ width: 400, height: 800 });
await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await wait(500);
await sp.evaluate(async (l) => { await chrome.storage.local.set({ pl_links: l }); }, links); await wait(600);
const rows = () => sp.locator('.pl-lrow').count();
ok('처음에는 60개만 그림', (await rows()) === 60, `${await rows()}개`);
ok('표시 개수는 전체 기준', (await sp.locator('.pl-count').innerText()).includes('300'));
await sp.evaluate(() => { const s = document.querySelector('.pl-scroll'); s.scrollTop = s.scrollHeight; }); await wait(500);
ok('끝까지 스크롤하면 이어서 붙음', (await rows()) >= 120, `${await rows()}개`);
for (let i = 0; i < 6; i++) { await sp.evaluate(() => { const s = document.querySelector('.pl-scroll'); s.scrollTop = s.scrollHeight; }); await wait(300); }
ok('계속 스크롤하면 전부 표시', (await rows()) === 300, `${await rows()}개`);
// storage update (e.g. YouTube details arriving) keeps the scroll position
await sp.evaluate(() => { document.querySelector('.pl-scroll').scrollTop = 2000; }); await wait(200);
await sp.evaluate(async () => { const l = (await chrome.storage.local.get('pl_links')).pl_links; l[5].title = '바뀐 제목'; await chrome.storage.local.set({ pl_links: l }); }); await wait(500);
const top = await sp.evaluate(() => document.querySelector('.pl-scroll').scrollTop);
ok('목록이 갱신돼도 스크롤 위치 유지', Math.abs(top - 2000) < 5, `scrollTop ${top}`);
// select-all covers every filtered link, not only the rows rendered so far
await sp.click('[data-act="selAll"]'); await wait(300);
ok('전체 선택은 그려지지 않은 항목까지 포함', (await sp.locator('.pl-bar__count').innerText()).includes('300개 선택'), await sp.locator('.pl-bar__count').innerText());
await sp.click('[data-act="bClear"]');
// search → back to the top with a fresh first page (150 odd titles, one renamed above → 149)
await sp.fill('#q', '짝'); await wait(500);
const st = await sp.evaluate(() => document.querySelector('.pl-scroll').scrollTop);
ok('검색하면 맨 위에서 다시 60개', (await rows()) === 60 && st === 0 && (await sp.locator('.pl-count').innerText()).includes('149'), `${await rows()}개 · top ${st} · ${await sp.locator('.pl-count').innerText()}`);
console.log(R.join('\n'));
await Promise.race([ctx.close(), wait(5000)]);
process.exit(R.some((l) => l.startsWith('FAIL') || l.startsWith('ERR')) ? 1 : 0);
