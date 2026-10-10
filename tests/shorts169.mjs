// 다운로드 창 검증: 쇼츠 행마다 16:9(유튜브 쇼츠 → 롱폼 화면) · 머리말 주소 복사 · [목록 추가]. 실행: node tests/shorts169.mjs
// 유튜브 페이지는 가짜(route). 다운로드 창은 닫힌 shadow root 라 CDP(DOM.getDocument pierce)로 버튼 위치·상태를 읽는다.
//   16:9 : 유튜브 쇼츠(/shorts/ID) 행마다 오른쪽에 있다 (롱폼 행에는 없다). 누르면 그 행의 쇼츠를 /watch?v=ID 로 연다.
//          유튜브 페이지면 지금 탭이 바뀌고 다운로드 창(영상·체크)이 이어서 뜬다. 다른 사이트면 새 탭으로 연다 (그 페이지는 그대로)
//          눌러도 그 행의 체크는 바뀌지 않는다
//   주소 복사 : 체크한 영상 주소가 한 줄에 하나씩 클립보드로. 배지 숫자 = 체크한 수
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const R = [];
const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await wait(step); } try { return !!(await fn()); } catch (e) { return false; } };

const CARDS = ['AAAAAAAAAA1', 'BBBBBBBBBB2', 'CCCCCCCCCC3'];
const cardUrl = (id) => 'https://www.youtube.com/shorts/' + id;
const LONG = 'LLLLLLLLLL1';
// 카드 3개: 쇼츠 · 롱폼 · 쇼츠 (가로로 나란히). 같은 화면을 유튜브 홈과 다른 사이트 주소에서 보여 준다
const card = (href, label) => `<div style="width:200px"><a href="${href}" style="display:block;height:160px;background:#ccc"></a><a href="${href}" style="display:block;padding:6px 0">${label}</a></div>`;
const CARDS_HTML = `<div style="display:flex;gap:20px;padding:40px">${card(cardUrl(CARDS[0]), '쇼츠 1')}${card('https://www.youtube.com/watch?v=' + LONG, '롱폼')}${card(cardUrl(CARDS[2]), '쇼츠 3')}</div>`;
const page_ = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="margin:0;font-family:sans-serif">${body}</body>`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-169-'));
const ctx = await chromium.launchPersistentContext(work, { headless: false, viewport: { width: 1200, height: 800 }, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
  await sw.evaluate(async () => {
    const s = (await chrome.storage.sync.get('pl_settings')).pl_settings || {};
    s.dl = { server: 'http://127.0.0.1:8799/api', saveDir: '', mode: 'both', quality: '', concurrency: 2 };
    await chrome.storage.sync.set({ pl_settings: s });
  });
  await ctx.route(/^https:\/\/www\.(youtube|example)\.com\//, (route) => {
    const u = new URL(route.request().url());
    const body = u.pathname === '/watch' ? page_('watch', `<h1 style="padding:40px">롱폼 화면 ${u.searchParams.get('v')}</h1>`) : page_('cards', CARDS_HTML);
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.youtube.com' });

  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  // ---- 닫힌 shadow root 안 읽기 (CDP)
  const shadowRoot = async () => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const find = (n) => { if (n.nodeName === 'POWER-LINK-OVERLAY') return n; for (const c of n.children || []) { const f = find(c); if (f) return f; } return null; };
    const host = find(root);
    return host && host.shadowRoots && host.shadowRoots[0] ? host.shadowRoots[0].nodeId : 0;
  };
  const all = async (sel) => { const sr = await shadowRoot(); return sr ? (await cdp.send('DOM.querySelectorAll', { nodeId: sr, selector: sel })).nodeIds : []; };
  const box = async (sel) => {   // 화면에 없으면 null
    const id = (await all(sel))[0]; if (!id) return null;
    try { const { model } = await cdp.send('DOM.getBoxModel', { nodeId: id }); const q = model.border; return { x: (q[0] + q[4]) / 2, y: (q[1] + q[5]) / 2 }; } catch (e) { return null; }
  };
  const prop = async (sel, js, idx = 0) => {
    const id = (await all(sel))[idx]; if (!id) return undefined;
    const { object } = await cdp.send('DOM.resolveNode', { nodeId: id });
    return (await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function () { return ${js}; }`, returnByValue: true })).result.value;
  };
  const click = async (sel) => { const b = await box(sel); if (!b) throw new Error('보이지 않음: ' + sel); await page.mouse.click(b.x, b.y); };
  const checks = async () => { const out = []; for (const i of [0, 1, 2]) out.push(await prop('.dlp-row input', 'this.checked', i)); return JSON.stringify(out); };   // CDP 노드 번호가 엇갈리지 않게 차례로
  const drag = async () => {
    await page.mouse.move(600, 400); await page.mouse.move(610, 410); await wait(700);   // 드래그 엔진을 미리 올린다
    await page.mouse.move(20, 20); await page.mouse.down({ button: 'right' });
    await page.mouse.move(400, 120, { steps: 6 }); await page.mouse.move(760, 260, { steps: 8 }); await wait(150);
    await page.mouse.up({ button: 'right' }); await wait(900);
  };
  const row = (i) => `.dlp-row:nth-child(${i})`;

  // ---- 1) 유튜브 홈에서 드래그 → 다운로드 창: 쇼츠 행에만 16:9
  await page.goto('https://www.youtube.com/'); await wait(800);
  await drag();
  ok('드래그 → 다운로드 창에 3개 (쇼츠·롱폼·쇼츠)', await until(async () => (await all('.dlp-row')).length === 3), String((await all('.dlp-row')).length));
  ok('16:9 는 쇼츠 행(1·3번째)에만, 롱폼 행(2번째)에는 없다', !!(await box(row(1) + ' .r169')) && !(await box(row(2) + ' .r169')) && !!(await box(row(3) + ' .r169')));
  ok('머리말에는 16:9 가 없다', !(await box('.dlp-h .r169')));
  ok('16:9 글자·툴팁', (await prop(row(1) + ' .r169', 'this.textContent + " | " + this.title')) === '16:9 | 쇼츠 영상을 롱폼 영상으로 보기', await prop(row(1) + ' .r169', 'this.textContent + " | " + this.title'));
  { const r = await box(row(1)), b = await box(row(1) + ' .r169'), t = await box(row(1) + ' .dlp-t');
    ok('16:9 는 행 오른쪽 (제목보다 오른쪽, 행 높이 가운데)', b.x > t.x && Math.abs(b.y - r.y) < 2, `행 y ${r.y.toFixed(1)} · 버튼 y ${b.y.toFixed(1)}`); }
  ok('[목록에 추가] → [목록 추가]', (await prop('.dlp-acts .add', 'this.textContent')) === '목록 추가', await prop('.dlp-acts .add', 'this.textContent'));

  // ---- 2) 주소 복사: 두 번째를 빼고 복사
  ok('복사 배지 = 체크한 수 3', (await prop('.dlp-h .cp b', 'this.textContent')) === '3');
  await click(row(2) + ' input'); await wait(300);
  ok('하나 빼면 배지 2', (await prop('.dlp-h .cp b', 'this.textContent')) === '2', await prop('.dlp-h .cp b', 'this.textContent'));
  await page.evaluate(() => navigator.clipboard.writeText('(비어 있음)'));
  await click('.dlp-h .cp'); await wait(400);
  // Windows 클립보드는 줄바꿈(\n)을 \r\n 으로 바꿔 돌려준다 — 붙여넣으면 똑같이 줄이 바뀐다
  const clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  ok('주소 복사 → 체크한 주소 2개가 한 줄에 하나씩', clip === [cardUrl(CARDS[0]), cardUrl(CARDS[2])].join('\n'), JSON.stringify(clip));
  ok('복사하면 체크 표시 + 안내 "주소 2개를 복사했어요"', (await prop('.dlp-h .cp', 'this.classList.contains("done")')) && (await prop('.dlp-acts .n', 'this.textContent')) === '주소 2개를 복사했어요', await prop('.dlp-acts .n', 'this.textContent'));

  // ---- 3) 3번째 행의 16:9 → 그 쇼츠의 롱폼 화면, 다운로드 창이 이어서 뜬다
  await click(row(3) + ' .r169');
  ok('3번째 행 16:9 → 그 쇼츠의 /watch?v= 로 열림', await until(() => page.url() === 'https://www.youtube.com/watch?v=' + CARDS[2]), page.url());
  ok('새 페이지에도 다운로드 창이 이어서 뜸 (3개)', await until(async () => (await all('.dlp-row')).length === 3, 10000), String((await all('.dlp-row')).length));
  ok('체크 상태 그대로 · 16:9 를 눌러도 그 행 체크는 안 바뀜', (await checks()) === '[true,false,true]', await checks());
  ok('넘겨준 저장소 값은 지워짐', (await page.evaluate(() => sessionStorage.getItem('pl_dlp_carry'))) === null);
  ok('이어서 뜬 창에서도 쇼츠 행에만 16:9', !!(await box(row(1) + ' .r169')) && !(await box(row(2) + ' .r169')) && !!(await box(row(3) + ' .r169')));
  // 체크를 뺀 행도 16:9 는 쓸 수 있다
  await click(row(1) + ' input'); await wait(200);
  await click(row(1) + ' .r169');
  ok('체크를 뺀 1번째 행의 16:9 → 그 쇼츠의 /watch?v= 로 열림', await until(() => page.url() === 'https://www.youtube.com/watch?v=' + CARDS[0]), page.url());
  ok('다운로드 창 이어짐 (체크 [false,false,true])', await until(async () => (await all('.dlp-row')).length === 3, 10000) && (await checks()) === '[false,false,true]', await checks());

  // ---- 4) 유튜브가 아닌 사이트: 새 탭으로 열고, 지금 페이지와 창은 그대로
  await page.goto('https://www.example.com/'); await wait(800);
  await drag();
  ok('다른 사이트: 쇼츠 행에 16:9', await until(async () => !!(await box(row(1) + ' .r169'))));
  const n0 = ctx.pages().length;
  const popup = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await click(row(1) + ' .r169');
  const tab = await popup;
  ok('다른 사이트: 새 탭으로 그 쇼츠의 /watch?v= 가 열림', !!tab && await until(() => tab.url() === 'https://www.youtube.com/watch?v=' + CARDS[0]), tab ? tab.url() : `탭 ${ctx.pages().length - n0}개`);
  ok('다른 사이트: 지금 페이지와 다운로드 창은 그대로', page.url() === 'https://www.example.com/' && (await all('.dlp-row')).length === 3, page.url());
} catch (e) {
  R.push('FAIL  예외 ' + (e.stack || e));
} finally {
  await ctx.close().catch(() => {});
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(R.join('\n'));
const fails = R.filter((l) => l.startsWith('FAIL')).length;
console.log(`\n${R.length - fails}/${R.length} passed`);
process.exit(fails ? 1 : 0);
