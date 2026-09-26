// 사용법: npx playwright 설치 후  EXT=<확장 폴더> CHROME=<크롬 경로> node tests/verify.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
const DIR = fileURLToPath(new URL('./', import.meta.url));
import http from 'http'; import fs from 'fs';
const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const srv = http.createServer((q, r) => { r.writeHead(200, {'content-type':'text/html; charset=utf-8'}); r.end(fs.readFileSync(q.url.includes('yt') ? DIR + 'yt.html' : DIR + 'page.html')); }).listen(8770);
const ctx = await chromium.launchPersistentContext('/tmp/pl-prof-' + Date.now(), { headless: false, acceptDownloads: true, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'], viewport: { width: 1200, height: 800 } });
const errors = []; const R = [];
const ok = (name, cond, info='') => { R.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await new Promise(r=>setTimeout(r,1500));
sw.on('console', (m) => { if (m.type() === 'error') errors.push('SW: ' + m.text()); });
const id = sw.url().split('/')[2];
await ctx.grantPermissions(['clipboard-read','clipboard-write'], { origin: 'http://localhost:8770' });
const page = await ctx.newPage(); page.on('pageerror', e => errors.push('page: ' + e.message));
await page.goto('http://localhost:8770/'); await page.waitForTimeout(800);
const clip = () => page.evaluate(() => navigator.clipboard.readText());
const setClip = (t) => page.evaluate((t) => navigator.clipboard.writeText(t), t);
const storeLinks = () => sw.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links || []);

// offscreen path directly (what runs when the page has no focus)
const direct = await page.evaluate((id) => new Promise((res) => chrome.runtime ? res('no') : res('no')), id);
const cp = await sw.evaluate(async () => {
  await chrome.offscreen.createDocument({ url: 'src/offscreen/offscreen.html', reasons: ['CLIPBOARD'], justification: 'x' }).catch(()=>{});
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text: 'OFFSCREEN-OK' });
});
ok('오프스크린 클립보드 쓰기', cp && cp.ok, JSON.stringify(cp));
ok('오프스크린 결과가 실제 클립보드에 있음', (await clip()) === 'OFFSCREEN-OK');

async function drag(mod, from, to, lasso) {
  await page.bringToFront();
  await page.keyboard.down(mod); await page.mouse.move(...from); await page.mouse.down({ button: 'right' });
  for (const p of (lasso || [to])) await page.mouse.move(p[0], p[1], { steps: 10 });
  await page.waitForTimeout(120);
  await page.mouse.up({ button: 'right' }); await page.keyboard.up(mod); await page.waitForTimeout(1500);
}
await setClip('EMPTY');
await drag('Alt', [10, 60], [900, 560], [[900, 60], [900, 560], [10, 560]]);
let links = await storeLinks();
ok('Alt+우클릭 올가미 → 목록 저장', links.length >= 8, links.length + '개');
await setClip('EMPTY');
await drag('Control', [15, 70], [300, 200]);
let c = await clip();
ok('Ctrl+우클릭 박스 → 복사', c.includes('https://') && c !== 'EMPTY', JSON.stringify(c.slice(0, 80)));
const before = ctx.pages().length;
await drag('Shift', [300, 70], [560, 200]); await page.waitForTimeout(800);
ok('Shift+우클릭 박스 → 새 탭', ctx.pages().length - before >= 1, (ctx.pages().length - before) + '개');
for (const p of ctx.pages().slice(before)) await p.close();

// YouTube-like titles
await page.goto('http://localhost:8770/yt'); await page.waitForTimeout(800); await setClip('EMPTY');
await drag('Control', [10, 15], [980, 170]);
c = await clip();
ok('썸네일 드래그 시 제목 복사', c.includes('첫번째 진짜 제목') && c.includes('두번째 영상 제목') && !/^\d+:\d+$/m.test(c), JSON.stringify(c.slice(0, 60)));
await page.goto('http://localhost:8770/'); await page.waitForTimeout(600);

// popup
const lastToast = (pg) => pg.evaluate(() => { const w = [...document.body.children].filter((e) => e.tagName === 'DIV' && e.style.position === 'fixed').pop(); return w ? w.innerText.trim() : ''; });
const pop = await ctx.newPage(); pop.on('pageerror', e => errors.push('popup: ' + e.message)); pop.on('console', m => m.type()==='error' && !m.text().includes('ERR_TUNNEL') && errors.push('popup: ' + m.text()));
await pop.setViewportSize({ width: 380, height: 640 });
await pop.goto(`chrome-extension://${id}/src/popup/popup.html`); await pop.waitForTimeout(700);
ok('팝업 화면 표시', (await pop.locator('#doCopy').count()) === 1 && (await pop.locator('#doSave').count()) === 1);
await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8770/*' }); await chrome.tabs.update(t.id, { active: true }); });
await pop.click('[data-set="scope"][data-val="window"]').catch(()=>{});
await setClip('EMPTY');
await pop.click('#doCopy'); await pop.waitForTimeout(1500);
ok('팝업 복사 버튼', (await clip()) !== 'EMPTY', (await lastToast(pop)).split('\n').pop());
await pop.click('#doSave'); await pop.waitForTimeout(1500);
ok('팝업 저장 버튼', /저장|개/.test(await lastToast(pop)), (await lastToast(pop)).split('\n').pop());
const n0 = ctx.pages().length; await pop.click('#openOptions'); await pop.waitForTimeout(1000);
ok('팝업 설정 버튼', ctx.pages().length > n0);
for (const p of ctx.pages()) if (p.url().includes('options')) await p.close();
await pop.close();

// side panel toolbar
const sp = await ctx.newPage(); sp.on('pageerror', e => errors.push('side: ' + e.message)); sp.on('console', m => m.type()==='error' && !m.text().includes('ERR_TUNNEL') && errors.push('side: ' + m.text()));
await sp.setViewportSize({ width: 380, height: 760 });
await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await sp.waitForTimeout(700);
ok('사이드바 하단 메뉴(선택 없음) 표시', (await sp.locator('.pl-toolbar').count()) === 1, await sp.locator('.pl-toolbar__count').innerText());
// Chrome 153+: 비활성 탭의 clipboard.readText()는 빈 문자열을 반환 → 읽기 전에 page 탭을 활성화
const clipViaFront = async () => { await page.bringToFront(); await page.waitForTimeout(250); const v = await clip(); await sp.bringToFront(); await page.waitForTimeout(150); return v; };
await setClip('EMPTY');
await sp.click('[data-act="bCopy"]'); await sp.waitForTimeout(1200);
c = await clipViaFront();
ok('사이드바 복사(전체)', c !== 'EMPTY' && c.includes('https://'), await lastToast(sp));
await sp.click('[data-act="sel"] >> nth=0'); await sp.click('[data-act="sel"] >> nth=1'); await sp.waitForTimeout(200);
ok('선택 시 개수 표시', (await sp.locator('.pl-toolbar__count').innerText()).includes('2'));
await setClip('EMPTY');
await sp.click('[data-act="bCopy"]'); await sp.waitForTimeout(1200);
c = await clipViaFront(); ok('사이드바 복사(선택 2개)', c !== 'EMPTY' && (c.match(/https?:\/\//g) || []).length === 2, JSON.stringify(c.slice(0, 60)));
let n1 = ctx.pages().length; await sp.click('[data-act="bOpen"]'); await sp.waitForTimeout(1200);
ok('사이드바 새 탭 열기', ctx.pages().length - n1 === 2, (ctx.pages().length - n1) + '개');
for (const p of ctx.pages().slice(n1)) await p.close();
await sp.bringToFront();
await sp.click('[data-act="bThumbs"]'); await sp.waitForTimeout(1500); ok('사이드바 썸네일 저장 반응', (await lastToast(sp)).length > 0, await lastToast(sp));
await sp.click('[data-act="bWatch"]'); await sp.waitForTimeout(1000); ok('사이드바 워치리스트 반응', (await lastToast(sp)).length > 0, await lastToast(sp));
await sp.click('[data-act="bBookmark"]'); await sp.waitForTimeout(1000);
const bm = await sw.evaluate(async () => { const [f] = await chrome.bookmarks.search({ title: 'Power Link' }); return f ? (await chrome.bookmarks.getChildren(f.id)).length : 0; });
ok('사이드바 북마크', bm === 2, bm + '개');
const dl = sp.waitForEvent('download', { timeout: 4000 }).catch(() => null);
await sp.click('[data-act="bExcel"]'); const d = await dl; ok('사이드바 엑셀 다운로드', !!d, d ? d.suggestedFilename() : '');
const cnt = (await storeLinks()).length;
sp.once('dialog', (dg) => dg.accept());
await sp.click('[data-act="bDelete"]'); await sp.waitForTimeout(800);
ok('사이드바 삭제', (await storeLinks()).length === cnt - 2, `${cnt} → ${(await storeLinks()).length}`);
await sp.close();

console.log(R.join('\n'));
console.log('ERRORS:', errors.filter(e=>!e.includes('ERR_TUNNEL')).join('\n') || '없음');
await ctx.close(); srv.close(); process.exit(0);
