// 드래그 방식별 토글 검증. 실행: node tests/modes.mjs
// 방식마다 자기 대상만 넣고 뺀다:
//   우클릭           → 다운로드 창        (사이드바 목록은 건드리지 않음)
//   우클릭 + Ctrl    → 사이드바 목록      (다운로드 창은 건드리지 않음)
//   우클릭 + Shift   → 새 탭             (다시 드래그하면 연 탭이 닫힘)
// 박스와 다운로드 창은 닫힌 shadow root 안이라 DOM 으로 못 본다. 박스는 화면의 화소로, 다운로드 창의 내용은
// [목록에 추가] 로 저장되는 개수로, 목록은 저장소(pl_links)로, 탭은 열린 페이지 수로 확인한다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const R = [];
const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000, step = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await wait(step); } try { return !!(await fn()); } catch (e) { return false; } };

// 카드 3개: 썸네일 링크(240px 간격, x=40 에서 시작) + 제목 링크. 링크 주소는 이 서버의 /v/N 이라 새 탭으로 열어도 밖으로 나가지 않는다
const card = (i) => `<div style="width:220px"><a href="https://www.youtube.com/watch?v=VIDEO000000${i}" style="display:block;height:120px;background:#ccc"></a><a href="https://www.youtube.com/watch?v=VIDEO000000${i}" style="display:block;padding:6px 0">영상 제목 ${i}</a></div>`;
const PAGE = `<!doctype html><meta charset="utf-8"><title>modes test</title><body style="margin:0;padding:40px;background:#fff;font-family:sans-serif"><div style="display:flex;gap:20px">${[1, 2, 3].map(card).join('')}</div></body>`;
const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGE); }).listen(8784);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-modes-'));
const ctx = await chromium.launchPersistentContext(work, { headless: false, viewport: { width: 1200, height: 800 }, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
  await sw.evaluate(async () => { await chrome.storage.local.set({ pl_links: [] }); });
  // 새 탭이 실제 유튜브로 나가지 않게 막는다 (탭이 열리고 닫히는 것만 본다)
  await ctx.route('https://www.youtube.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>video</title>' }));

  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8784/'); await wait(800);
  const helper = await ctx.newPage(); await helper.setContent('<canvas></canvas>'); await page.bringToFront();
  await page.bringToFront(); await page.mouse.move(600, 500); await page.mouse.move(610, 510); await wait(700);   // 사용자가 페이지 위에서 마우스를 움직인 상태: 드래그 엔진이 미리 올라온다

  const ids = async () => (await sw.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links || [])).map((l) => l.url.slice(-1)).sort().join('');
  // 박스 색: 테두리는 링크보다 2px 바깥에 2px 두께 → i번째 카드는 x = 36 + 240*(i-1). 없으면 '', 있으면 색 이름
  const box = async (i) => {
    await page.bringToFront();
    const png = (await page.screenshot({ clip: { x: 36 + 240 * (i - 1), y: 100, width: 2, height: 2 } })).toString('base64');
    const [r, g, b] = await helper.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.querySelector('canvas'); c.width = 2; c.height = 2; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return [...x.getImageData(0, 0, 1, 1).data]; }, png);
    if (Math.max(r, g, b) - Math.min(r, g, b) < 40) return '';
    if (b > 180 && r < 120) return '파랑';                       // 복사 규칙 #2F6BFF
    if (r > 200 && g < 130 && b < 60) return '주황';              // 새 탭 규칙 #E8590C
    if (r > 160 && g < 110) return '빨강';                        // 다운로드 규칙 #C83F55
    if (g > 110 && r < 80) return '청록';                         // 저장 규칙 #0E9384
    return `기타(${r},${g},${b})`;
  };
  const drag = async (i, key) => {   // i번째 카드만 감싼다. key: 'Control' | 'Shift' | undefined
    await page.bringToFront();
    const x0 = 30 + 240 * (i - 1);
    if (key) await page.keyboard.down(key);
    await page.mouse.move(x0, 30); await page.mouse.down({ button: 'right' });
    await page.mouse.move(x0 + 120, 100, { steps: 5 }); await page.mouse.move(x0 + 240, 200, { steps: 6 }); await wait(150);
    await page.mouse.up({ button: 'right' });
    if (key) await page.keyboard.up(key);
    await wait(900);
  };
  const addBtn = async () => { await page.bringToFront(); await page.mouse.click(1200 - 24 - 12 - 238, 800 - 24 - 12 - 15); await wait(700); };   // 다운로드 창의 [목록에 추가]
  const tabs = () => ctx.pages().length;

  // ---- 1) 우클릭: 다운로드 창만
  await drag(1); await drag(2);
  ok('우클릭 드래그 → 빨간 박스', (await box(1)) === '빨강' && (await box(2)) === '빨강', `${await box(1)}, ${await box(2)}`);
  ok('우클릭 드래그 → 사이드바 목록은 그대로 (0개)', (await ids()) === '', await ids());
  await drag(1);
  ok('같은 박스를 다시 우클릭 드래그 → 박스 해제', (await box(1)) === '' && (await box(2)) === '빨강', `${await box(1)}, ${await box(2)}`);
  ok('다시 우클릭 드래그 → 사이드바 목록은 그대로 (0개)', (await ids()) === '', await ids());
  await addBtn();
  ok('다운로드 창에는 2번만 남음 ([목록에 추가] 로 2번만 저장됨)', await until(async () => (await ids()) === '2'), await ids());
  await drag(1);
  ok('또 우클릭 드래그 → 다운로드 창에 다시 들어옴 (빨간 박스)', (await box(1)) === '빨강', await box(1));

  // ---- 2) 우클릭 + Ctrl: 사이드바 목록만
  await drag(3, 'Control');
  ok('Ctrl+드래그 → 사이드바 목록에 추가, 파란 박스', await until(async () => (await ids()) === '23') && (await box(3)) === '파랑', `${await ids()}, ${await box(3)}`);
  await drag(3, 'Control');
  ok('같은 박스를 다시 Ctrl+드래그 → 목록에서 빠지고 박스 해제', await until(async () => (await ids()) === '2') && (await box(3)) === '', `${await ids()}, ${await box(3)}`);
  // 다운로드 창에 있는 1번을 Ctrl+드래그: 목록에만 들어가고 다운로드 창(빨간 박스)은 그대로
  await drag(1, 'Control');
  ok('다운로드 창에 있는 영상을 Ctrl+드래그 → 목록에 추가, 다운로드 창은 그대로', await until(async () => (await ids()) === '12') && (await box(1)) === '빨강', `${await ids()}, ${await box(1)}`);
  await drag(1, 'Control');
  ok('다시 Ctrl+드래그 → 목록에서만 빠짐, 다운로드 창은 그대로 (빨간 박스 유지)', await until(async () => (await ids()) === '2') && (await box(1)) === '빨강', `${await ids()}, ${await box(1)}`);
  // 목록에 있는 2번(다운로드 창에도 있음)을 우클릭 드래그: 다운로드 창에서만 빠지고 목록에는 남는다
  await drag(2);
  ok('목록에도 있는 영상을 우클릭 드래그 → 다운로드 창에서만 빠짐, 목록에는 남음', (await ids()) === '2' && (await box(2)) !== '빨강' && (await box(2)) !== '', `${await ids()}, ${await box(2)}`);

  // ---- 3) 우클릭 + Shift: 새 탭이 열렸다 닫혔다
  const n0 = tabs();
  await drag(3, 'Shift');
  ok('Shift+드래그 → 새 탭이 열림, 주황 박스', await until(() => tabs() === n0 + 1) && (await box(3)) === '주황', `탭 ${tabs() - n0}개, ${await box(3)}`);
  const listAfterOpen = await ids();
  await drag(3, 'Shift');
  ok('같은 박스를 다시 Shift+드래그 → 연 탭이 닫히고 박스 해제', await until(() => tabs() === n0) && (await box(3)) === '', `탭 ${tabs() - n0}개, ${await box(3)}`);
  ok('Shift+드래그로 다시 눌러도 사이드바 목록은 그대로', (await ids()) === listAfterOpen, `${listAfterOpen} → ${await ids()}`);
  await drag(1, 'Shift');
  ok('다운로드 창에 있는 영상을 Shift+드래그 → 탭만 열림, 다운로드 창은 그대로', await until(() => tabs() === n0 + 1) && (await box(1)) === '빨강', `탭 ${tabs() - n0}개, ${await box(1)}`);
  // 탭을 손으로 닫으면 '연 탭' 표시도 풀린다 → 다시 Shift+드래그하면 닫기가 아니라 열기
  await ctx.pages()[ctx.pages().length - 1].close(); await wait(800);
  await drag(1, 'Shift');
  ok('손으로 닫은 뒤 다시 Shift+드래그 → 새로 열림', await until(() => tabs() === n0 + 1), `탭 ${tabs() - n0}개`);
  await drag(1, 'Shift');
  ok('한 번 더 → 닫힘', await until(() => tabs() === n0), `탭 ${tabs() - n0}개`);
} catch (e) {
  R.push('FAIL  예외 ' + (e.stack || e));
} finally {
  await ctx.close().catch(() => {});
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
