// 사이드바가 갱신돼도 마우스 아래 버튼이 유지되는지 검증. 실행: node tests/stable.mjs
// (탭 이동·다른 프로필 상태 갱신 때마다 목록이 통째로 바뀌면 hover가 풀려 버튼이 사라지고,
//  누르는 도중 교체되면 클릭이 사라진다.)
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<title>open</title>hi'); }).listen(8798);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-stable-')), { headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
await wait(1000);
const op = await ctx.newPage(); await op.goto('http://localhost:8798/open');
const sp = await ctx.newPage(); sp.on('pageerror', (e) => R.push('ERR ' + e.message));
await sp.setViewportSize({ width: 420, height: 700 });
await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await sp.bringToFront(); await wait(500);
const others = (n) => ({ at: Date.now(), profiles: [{ id: 'p2', name: '다른 프로필', online: true, items: [{ url: 'https://other.test/a', title: '다른 프로필 화면 ' + n, at: Date.now() - 5000, open: true }] }] });
await sp.evaluate(async (o) => {
  await chrome.storage.local.set({ pl_recent: [{ url: 'http://localhost:8798/open', title: '열린 화면', at: Date.now() }, { url: 'https://closed.test/', title: '닫힌 화면', at: Date.now() - 60000 }, { url: 'https://closed2.test/', title: '닫힌 화면 2', at: Date.now() - 70000 }], pl_recentOthers: o, pl_bridge: { connected: true, at: Date.now() } });
}, others(0));
await sp.click('[data-act="tab"][data-val="recent"]'); await wait(700);
// the panel keeps refreshing (other profile state every ~second)
let n = 0; const tick = setInterval(() => { n++; sp.evaluate(async (o) => { await chrome.storage.local.set({ pl_recentOthers: o }); }, others(n)).catch(() => {}); }, 150);

const del = '[data-act="rDel"][data-val="https://closed.test/"]';
await sp.hover(del); await wait(100);
await sp.evaluate((s) => { window.__btn = document.querySelector(s); }, del);
await wait(1200);
const kept = await sp.evaluate((s) => document.querySelector(s) === window.__btn && window.__btn.isConnected, del);
ok('목록이 갱신돼도 마우스 아래 버튼은 그대로(같은 요소)', kept);
const visible = await sp.evaluate((s) => getComputedStyle(document.querySelector(s).parentElement).opacity, del);
ok('마우스를 움직이지 않아도 버튼이 계속 보임(hover 유지)', visible === '1', 'opacity ' + visible);
const cursor = await sp.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2 + 9, b.top + b.height / 2 - 9); return e && e.closest('[data-act]') && getComputedStyle(e).cursor; }, del);
ok('원 안 가장자리도 손 모양', cursor === 'pointer', String(cursor));
// press, the panel refreshes while the button is held, release → the click still counts
await sp.mouse.down(); await wait(400); await sp.mouse.up();
// the row goes at once, without waiting for the background's storage write
await wait(60);
ok('삭제 클릭 즉시 목록에서 사라짐', await sp.evaluate(() => !document.querySelector('[data-row="https://closed.test/"]')));
await wait(700);
const sync = await sp.evaluate(() => { document.querySelector('[data-act="rDel"][data-val="https://closed2.test/"]').click(); return !document.querySelector('[data-row="https://closed2.test/"]'); });
ok('삭제 클릭과 동시에 행 제거(저장 대기 없음)', sync);
await wait(700);
clearInterval(tick); await wait(300);
const left = await sp.evaluate(async () => ((await chrome.storage.local.get('pl_recent')).pl_recent || []).map((r) => r.url));
ok('누르는 도중 갱신돼도 클릭이 됨(삭제됨)', !left.includes('https://closed.test/') && !left.includes('https://closed2.test/'), left.join(', ') + ` · 갱신 ${n}번`);

console.log(R.join('\n'));
await Promise.race([ctx.close(), wait(5000)]); srv.close();
process.exit(R.some((l) => l.startsWith('FAIL') || l.startsWith('ERR')) ? 1 : 0);
