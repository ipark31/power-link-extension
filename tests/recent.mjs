// 최근 작업 화면 검증. 실행: node tests/recent.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import http from 'http';
const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
http.createServer((q, r) => { r.writeHead(200, {'content-type':'text/html; charset=utf-8'}); r.end(`<title>페이지 ${q.url.slice(1)}</title><h1>${q.url}</h1>`); }).listen(8772);
const ctx = await chromium.launchPersistentContext('/tmp/pl-prof-' + Date.now(), { headless: false, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const R = []; const ok = (n, c, i='') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await new Promise(r=>setTimeout(r,1500));
const id = sw.url().split('/')[2];
const recent = () => sw.evaluate(async () => (await chrome.storage.local.get('pl_recent')).pl_recent || []);
const pages = [];
for (const n of ['alpha', 'beta', 'gamma', 'delta']) { const p = await ctx.newPage(); await p.goto('http://localhost:8772/' + n); await p.bringToFront(); await p.waitForTimeout(300); pages.push(p); }
await pages[1].bringToFront(); await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8772/beta' }); await chrome.tabs.update(t.id, { active: true }); }); await new Promise(r=>setTimeout(r,600));
let rc = await recent();
ok('탭을 보면 최근 화면에 기록', rc.filter(r => r.url.includes('8772')).length === 4, rc.map(r => r.title).join(', '));
ok('가장 최근에 본 화면이 맨 위', rc[0] && rc[0].url.endsWith('/beta'), rc[0] && rc[0].title);
const sp = await ctx.newPage(); sp.on('pageerror', e => R.push('ERR ' + e.message));
await sp.setViewportSize({ width: 380, height: 700 });
await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await sp.waitForTimeout(600);
await sp.click('[data-act="tab"][data-val="recent"]'); await sp.waitForTimeout(600);
const titles = () => sp.$$eval('.pl-recent__title', (e) => e.map((x) => x.textContent));
let t = await titles(); ok('사이드바 최근 화면 목록', t.length >= 4, t.slice(0, 5).join(' | '));
ok('열린 화면 표시(열림)', (await sp.locator('.pl-recent__open').count()) >= 4);
await sp.fill('#rq', 'gam'); await sp.waitForTimeout(200); t = await titles();
ok('검색(제목·주소)', t.length === 1 && t[0].includes('gamma'), t.join('|'));
await sp.fill('#rq', '8772/del'); await sp.waitForTimeout(200); t = await titles(); ok('주소로 검색', t.length === 1 && t[0].includes('delta'), t.join('|'));
await sp.fill('#rq', ''); await sp.waitForTimeout(200);
await sp.click('[data-act="rsort"][data-val="old"]'); await sp.waitForTimeout(200); t = await titles();
const tn = await titles(); await sp.click('[data-act="rsort"][data-val="new"]'); await sp.waitForTimeout(200); const tr = await titles();
ok('정렬 최근/오래된', tn[0] !== tr[0] && tn[tn.length - 1] === tr[0], `오래된: ${tn[0]} / 최근: ${tr[0]}`);
// click open tab → activates existing
const before = ctx.pages().length;
await sp.click(`[data-act="rGo"][data-val="http://localhost:8772/gamma"]`); await sp.waitForTimeout(600);
const act = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, url: 'http://localhost:8772/*' })).map(t => t.url));
ok('열린 화면 클릭 → 그 탭으로 이동', ctx.pages().length === before && act.some(u => u.endsWith('/gamma')), act.join(','));
// close button: only on open rows; closes the tab, keeps the record
await sp.bringToFront();
await sp.hover(`[data-act="rGo"][data-val="http://localhost:8772/alpha"]`);
const closeBtn = sp.locator(`[data-act="rClose"][data-val="http://localhost:8772/alpha"]`);
ok('열린 화면에 탭 닫기 버튼', (await closeBtn.count()) === 1);
await closeBtn.click(); await sp.waitForTimeout(700);
const alphaTabs = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8772/alpha' })).length);
ok('탭 닫기 → 탭이 닫히고 기록은 남음', alphaTabs === 0 && (await recent()).some((r) => r.url.endsWith('/alpha')) && (await sp.locator(`[data-act="rClose"][data-val="http://localhost:8772/alpha"]`).count()) === 0, `열린 alpha 탭 ${alphaTabs}개`);
// close delta then click → reopens
await pages[3].close(); await sp.waitForTimeout(500);
ok('닫은 화면은 열림 표시 없음', !(await sp.locator('.pl-recent', { hasText: '페이지 delta' }).locator('.pl-recent__open').count()));
await sp.click(`[data-act="rGo"][data-val="http://localhost:8772/delta"]`); await sp.waitForTimeout(1000);
ok('닫은 화면 클릭 → 새 탭으로 열기', ctx.pages().some(p => p.url().endsWith('/delta')));
// add to links
await sp.bringToFront();
await sp.click(`[data-act="rAdd"][data-val="http://localhost:8772/alpha"]`); await sp.waitForTimeout(900);
const links = await sw.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links || []);
ok('수집 링크 추가', links.some(l => l.url.endsWith('/alpha')), links.map(l => l.title).join(','));
ok('추가 후 버튼이 체크로 바뀜', (await sp.locator('[data-act="rAdd"][data-val="http://localhost:8772/alpha"][disabled]').count()) === 1);
// delete
await sp.click(`[data-act="rDel"][data-val="http://localhost:8772/beta"]`); await sp.waitForTimeout(400);
ok('삭제', !(await recent()).some(r => r.url.endsWith('/beta')) && !(await titles()).some(x => x.includes('beta')));
// duplicate tabs: bottom bar → confirm → one tab per screen
for (let i = 0; i < 3; i++) { const p = await ctx.newPage(); await p.goto('http://localhost:8772/dup'); }
await sp.bringToFront(); await sp.click('[data-act="tab"][data-val="links"]'); await sp.click('[data-act="tab"][data-val="recent"]'); await sp.waitForTimeout(500);
ok('하단 바에 중복 개수 표시', (await sp.locator('.pl-bar__count').innerText()).includes('중복'), await sp.locator('.pl-bar__count').innerText());
await sp.click('[data-act="rDedupe"]'); await sp.waitForTimeout(200);
ok('중복 링크 닫기 → 확인 창', (await sp.locator('.pl-sheet [data-act="confirmYes"]').count()) === 1);
await sp.click('.pl-sheet [data-act="confirmNo"] >> text=아니요'); await sp.waitForTimeout(200);
const dupN = () => sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8772/dup' })).length);
ok('아니요 → 아무것도 닫지 않음', (await sp.locator('.pl-sheet').count()) === 0 && (await dupN()) === 3);
await sp.click('[data-act="rDedupe"]'); await sp.click('.pl-sheet [data-act="confirmYes"]'); await sp.waitForTimeout(800);
ok('예 → 중복 탭을 닫고 1개만 남김', (await dupN()) === 1, `남은 dup 탭 ${await dupN()}개`);
// max setting
await sw.evaluate(async () => { const { pl_settings: s = {} } = await chrome.storage.sync.get('pl_settings'); await chrome.storage.sync.set({ pl_settings: Object.assign(s, { recentMax: 20 }) }); });
const p2 = await ctx.newPage();
for (let i = 0; i < 25; i++) { await p2.goto('http://localhost:8772/n' + i); await p2.waitForTimeout(80); }
await p2.waitForTimeout(800);
rc = await recent(); ok('설정한 수만큼만 기록(20)', rc.length === 20 && rc[0].url.endsWith('/n24'), rc.length + '개, 맨 위 ' + (rc[0] && rc[0].title));
console.log(R.join('\n'));
await ctx.close(); process.exit(0);
