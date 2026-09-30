// v2.7 기능 검증. 실행: node tests/features.mjs
// 설치 안내 · 드래그 엔진 늦게 불러오기 · 떡상 필터 · 채널별 묶기 · 컬렉션 · 키보드 · 최근 화면 날짜 묶음 ·
// 사이트별 탭 정렬 · 페이지 테두리 켜기/끄기 · 안내 페이지 연습 · 설정의 컬렉션 관리
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = Array.from({ length: 6 }, (_, i) => `<p style="margin:0;height:40px"><a href="https://example.com/p${i}">페이지 링크 ${i}</a></p>`).join('');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<title>t${q.url}</title><body style="margin:20px;font:14px sans-serif">${rows}</body>`); }).listen(8796);
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-features-')), { headless: false, viewport: { width: 1000, height: 700 }, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
await wait(1500);

// 0) first install opens the guide
ok('설치하면 시작 안내 페이지가 열림', ctx.pages().some((p) => p.url().endsWith('/src/welcome/welcome.html')), ctx.pages().map((p) => p.url().split('/').pop()).join(', '));

const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${id}/src/offscreen/offscreen.html`);
const store = (k) => ext.evaluate(async (k) => (await chrome.storage.local.get(k))[k], k);
await ext.evaluate(async () => { const { pl_settings: s = {} } = await chrome.storage.sync.get('pl_settings'); await chrome.storage.sync.set({ pl_settings: Object.assign(s, { notify: false }) }); });

// 1) lazy drag engine: only the loader runs until a rule's modifier is pressed
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const parsed = [];
cdp.on('Debugger.scriptParsed', (e) => { if (e.url.startsWith('chrome-extension://')) parsed.push(e.url.split('/').pop()); });
await cdp.send('Debugger.enable');
await page.goto('http://localhost:8796/lazy'); await wait(1200);
ok('페이지에는 작은 로더만 올라감', parsed.includes('loader.js') && !parsed.includes('content.js'), parsed.join(','));
await page.keyboard.down('Control'); await wait(800);
ok('수정 키를 누르면 드래그 엔진을 불러옴', parsed.includes('content.js'), parsed.join(','));
await page.mouse.move(10, 15); await page.mouse.down({ button: 'right' }); await page.mouse.move(200, 100, { steps: 10 }); await page.mouse.up({ button: 'right' }); await page.keyboard.up('Control'); await wait(900);
ok('불러온 엔진으로 첫 드래그가 바로 동작', ((await store('pl_links')) || []).length >= 2, `${((await store('pl_links')) || []).length}개`);
await cdp.send('Debugger.disable');

// 2) marks on/off (side panel eye button) — outline pixel next to 페이지 링크 0
const blueNear = async () => {
  const r = await page.$eval('a', (a) => { const b = a.getBoundingClientRect(); return { x: b.left - 3, y: b.top + b.height / 2 }; });
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async ([png, x, y]) => { const i = new Image(); await new Promise((res) => { i.onload = res; i.src = 'data:image/png;base64,' + png; }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio), 1, 1).data; return d[2] > 180 && d[0] < 120; }, [png, r.x, r.y]);
};
ok('선택한 링크에 테두리 표시', await blueNear());
const links0 = Array.from({ length: 10 }, (_, i) => ({ id: 'L' + i, url: `https://www.youtube.com/watch?v=VID${i}`, title: `영상 ${i}`, platform: 'yt', kind: 'post', domain: 'youtube.com', ids: { videoId: 'VID' + i }, account: { name: i < 6 ? '가나 채널' : '다라 채널' }, outlier: [2.1, 0.5, 1.7, 0.9, 3.2, 1.1, 0.4, 1.5, 0.8, 1.0][i], createdAt: new Date(Date.now() - i * 60000).toISOString() }));
const sp = await ctx.newPage(); sp.on('pageerror', (e) => R.push('ERR ' + e.message));
await sp.setViewportSize({ width: 420, height: 800 });
await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await wait(600);
await sp.click('[data-act="marksToggle"]'); await wait(700);
ok('테두리 숨기기 → 페이지에서 사라짐', (await store('pl_showMarks')) === false && !(await blueNear()) && (await sp.getAttribute('[data-act="marksToggle"]', 'aria-pressed')) === 'true');
await sp.click('[data-act="marksToggle"]'); await wait(700);
ok('테두리 보이기 → 다시 나타남', (await store('pl_showMarks')) === true && (await blueNear()));

// 3) 떡상 filter · 채널별 묶기
await ext.evaluate(async (l) => { await chrome.storage.local.set({ pl_links: l }); }, links0); await wait(600);
await sp.click('[data-act="hot"]'); await wait(300);
ok('떡상 ×1.5↑ 필터', (await sp.locator('.pl-count').innerText()).startsWith('4개'), await sp.locator('.pl-count').innerText());
await sp.click('[data-act="hot"]'); await wait(300);
await sp.selectOption('#sort', 'channel'); await wait(300);
const groups = await sp.$$eval('.pl-group', (g) => g.map((x) => x.innerText.replace(/\s+/g, ' ')));
ok('채널별 묶기 → 채널마다 머리글과 개수', groups.length === 2 && groups[0].includes('가나 채널') && groups[0].includes('6개') && groups[1].includes('4개'), groups.join(' | '));
await sp.selectOption('#sort', 'recent'); await wait(300);

// 4) 컬렉션: put two links in a new collection, filter by it, take them out
await sp.click('[data-act="sel"][data-id="L0"]'); await sp.click('[data-act="sel"][data-id="L1"]');
await sp.click('[data-act="bColl"]'); await wait(300);
await sp.fill('#plCollNew', '기획 A'); await sp.keyboard.press('Enter'); await wait(600);
const cols = (await store('pl_collections')) || [];
const inColl = ((await store('pl_links')) || []).filter((l) => l.coll === (cols[0] || {}).id).map((l) => l.id);
ok('컬렉션 만들고 넣기', cols.length === 1 && cols[0].name === '기획 A' && inColl.join() === 'L0,L1', JSON.stringify(cols) + ' ' + inColl.join());
await sp.click('[data-act="bClear"]').catch(() => {});
await sp.selectOption('#coll', cols[0].id); await wait(300);
ok('컬렉션으로 거르기', (await sp.locator('.pl-count').innerText()).startsWith('2개'), await sp.locator('.pl-count').innerText());
await sp.click('[data-act="bColl"]'); await wait(300);
await sp.click('[data-act="collRemove"]'); await wait(600);
ok('컬렉션에서 빼기', !((await store('pl_links')) || []).some((l) => l.coll), '');
await sp.selectOption('#coll', 'all'); await wait(300);

// 5) keyboard
await sp.keyboard.press('Escape');
await sp.click('.pl-count'); // focus the panel, not an input
await sp.keyboard.press('/'); await wait(100);
ok('/ → 검색창으로', await sp.evaluate(() => document.activeElement && document.activeElement.id === 'q'));
await sp.keyboard.press('ArrowDown'); await wait(100);
await sp.keyboard.press('ArrowDown'); await wait(100);
ok('↓ → 목록에서 이동', await sp.evaluate(() => document.activeElement && document.activeElement.dataset.row === 'L1'));
await sp.keyboard.press(' '); await wait(300);
ok('Space → 선택', (await sp.locator('.pl-bar__count').innerText()).includes('1개 선택') && await sp.evaluate(() => document.activeElement && document.activeElement.dataset.row === 'L1'));
const pagesBefore = ctx.pages().length;
await sp.keyboard.press('Enter'); await wait(800);
ok('Enter → 링크 열기', ctx.pages().length === pagesBefore + 1 && ctx.pages().some((p) => p.url().includes('VID1')));
await sp.bringToFront(); await wait(200);
await sp.evaluate(() => { const el = document.querySelector('[data-row="L1"]'); el && el.focus(); });
await sp.keyboard.press('Delete'); await wait(700);
ok('Delete → 삭제(선택한 링크)', !((await store('pl_links')) || []).some((l) => l.id === 'L1') && ((await store('pl_links')) || []).length === 9);
ok('삭제 후 다음 줄에 포커스', await sp.evaluate(() => document.activeElement && document.activeElement.dataset.row === 'L2'));
await sp.click('[data-toast-action]'); await wait(700);
ok('되돌리기 → 원래 자리로 복구', ((await store('pl_links')) || []).map((l) => l.id).slice(0, 3).join() === 'L0,L1,L2');
await sp.evaluate(() => document.querySelector('[data-row="L3"]').focus());
await sp.keyboard.down('Control'); await sp.keyboard.press('a'); await sp.keyboard.up('Control'); await wait(300);
ok('Ctrl+A → 전체 선택', (await sp.locator('.pl-bar__count').innerText()).includes('10개 선택'));
await sp.keyboard.press('Escape'); await wait(300);
ok('Esc → 선택 해제', (await sp.locator('.pl-bar__count').innerText()).includes('전체'));

// 6) recent screens grouped by day
const day = 864e5, now = Date.now();
// 묶음의 기준은 오늘 0시다. 시각을 '지금에서 며칠 전'으로 잡으면 자정 직후(0시~2시 24분)에는 1.1일 전이 그저께가 되어
// '어제' 묶음이 비므로, 오늘 0시를 기준으로 잡는다: 방금, 어제 23시, 3일 전, 20일 전, 60일 전
const midnight = new Date(now).setHours(0, 0, 0, 0);
const recentAt = [Math.max(midnight, now - 1000), midnight - 36e5, midnight - 3 * day, midnight - 20 * day, midnight - 60 * day];
await ext.evaluate(async (rec) => { await chrome.storage.local.set({ pl_recent: rec }); }, recentAt.map((at, i) => ({ url: `https://site${i}.test/`, title: '화면 ' + i, at })));
await sp.click('[data-act="tab"][data-val="recent"]'); await wait(700);
const heads = await sp.$$eval('.pl-recent-list .pl-group', (g) => g.map((x) => x.innerText.trim()));
ok('최근 화면을 날짜별로 묶음', ['오늘', '어제', '이번 주', '이번 달', '그 이전'].every((h) => heads.includes(h)), heads.join(' | '));

// 7) sort tabs by site (window of the side panel page)
const win = await sp.evaluate(async () => (await chrome.windows.getCurrent()).id);
for (const h of ['http://localhost:8796/b1', 'http://127.0.0.1:8796/a1', 'http://localhost:8796/b2', 'http://127.0.0.1:8796/a2']) { const p = await ctx.newPage(); await p.goto(h); }
await sp.bringToFront(); await wait(400);
await sp.click('[data-act="rSortSites"]'); await wait(1200);
const order = await ext.evaluate(async () => (await chrome.tabs.query({ currentWindow: true })).filter((t) => /:8796\/(a|b)\d/.test(t.url)).map((t) => new URL(t.url).hostname));
const grouped = order.every((h, i) => i === 0 || h === order[i - 1] || !order.slice(0, i - 1).includes(h));
ok('사이트별 탭 정렬 → 같은 사이트끼리 붙음', order.length === 4 && grouped, order.join(', ') + ` (창 ${win})`);

// 8) welcome page practice: a real drag in practice mode marks the step
const wel = ctx.pages().find((p) => p.url().endsWith('/src/welcome/welcome.html')) || await ctx.newPage();
if (!wel.url().endsWith('welcome.html')) await wel.goto(`chrome-extension://${id}/src/welcome/welcome.html`);
await wel.bringToFront(); await wel.setViewportSize({ width: 1000, height: 900 }); await wel.reload(); await wait(800);
const nRules = await wel.evaluate(async () => ((await chrome.storage.sync.get('pl_settings')).pl_settings?.rules || []).length);
const nSteps = await wel.locator('.pl-wstep').count();
ok('안내 페이지: 규칙마다 연습 단계', nSteps > 0 && (!nRules || nSteps === nRules), `단계 ${nSteps}개 / 규칙 ${nRules}개`);
const box = await wel.$eval('.pl-wdemo', (e) => e.getBoundingClientRect().toJSON());
await wel.keyboard.down('Control'); await wel.mouse.move(box.left + 10, box.top + 10); await wel.mouse.down({ button: 'right' }); await wel.mouse.move(box.left + 400, box.top + 200, { steps: 12 }); await wel.mouse.up({ button: 'right' }); await wel.keyboard.up('Control'); await wait(800);
ok('안내 페이지: 드래그하면 그 단계 완료', (await wel.locator('.pl-wstep.is-done[data-step="copy"]').count()) === 1);

// 9) options › 카테고리: collections are managed there
await ext.evaluate(async () => { await chrome.storage.local.set({ pl_collections: [{ id: 'cX', name: '옛 이름' }], pl_links: [{ id: 'Z', url: 'https://z.test/', title: 'z', platform: 'web', kind: 'post', coll: 'cX' }] }); });
const op = await ctx.newPage();
await op.setViewportSize({ width: 1200, height: 900 });
await op.goto(`chrome-extension://${id}/src/options/options.html#cats`); await wait(800);
await op.fill('[data-coll-name="0"]', '새 이름'); await op.press('[data-coll-name="0"]', 'Tab'); await wait(500);
ok('설정: 컬렉션 이름 바꾸기', ((await store('pl_collections')) || [])[0].name === '새 이름');
await op.click('[data-coll-del="0"]'); await wait(300);
await op.click('.pl-sheet [data-act="confirmYes"]'); await wait(700);
ok('설정: 컬렉션 삭제(링크는 남음)', ((await store('pl_collections')) || []).length === 0 && ((await store('pl_links')) || [])[0].coll === '');

console.log(R.join('\n'));
await Promise.race([ctx.close(), wait(5000)]); srv.close();
process.exit(R.some((l) => l.startsWith('FAIL') || l.startsWith('ERR')) ? 1 : 0);
