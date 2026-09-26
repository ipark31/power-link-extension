// 메모 모달(추가 · 여러 줄 · 수정 · 삭제 · 취소) 검증. 실행: node tests/memo.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-memo-')), { headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1000);
const id = sw.url().split('/')[2];
await sw.evaluate(async () => { await chrome.storage.local.set({ pl_links: [{ id: 'm1', url: 'https://www.youtube.com/watch?v=Z1', title: 'Zephyr - Episode 1', platform: 'yt', kind: 'post', domain: 'youtube.com', ids: {}, memo: '' }] }); });
const memo = () => sw.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links[0].memo);
const p = await ctx.newPage(); p.on('pageerror', (e) => R.push('ERR ' + e.message));
let dialogs = 0; p.on('dialog', (d) => { dialogs++; d.dismiss(); });
await p.setViewportSize({ width: 400, height: 700 });
await p.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await wait(800);

await p.click('[data-act="memo"]'); await wait(300);
ok('메모 버튼 → 메모 모달(추가)', (await p.locator('.pl-sheet .pl-memo-area').count()) === 1 && (await p.locator('#plMemoTitle').innerText()) === '메모 추가' && (await p.locator('[data-act="memoDelete"]').count()) === 0);
await p.keyboard.type('첫 줄 메모'); await p.keyboard.press('Shift+Enter'); await p.keyboard.type('둘째 줄'); await p.keyboard.press('Enter'); await wait(500);
ok('Enter 저장 · Shift+Enter 줄바꿈', (await memo()) === '첫 줄 메모\n둘째 줄' && (await p.locator('.pl-sheet').count()) === 0, JSON.stringify(await memo()));
ok('목록에 메모 표시', (await p.locator('.pl-memo-chip').innerText()).includes('첫 줄 메모'));

await p.click('.pl-memo-chip'); await wait(300);
ok('메모 칩 → 수정 모달(기존 내용 · 삭제 버튼)', (await p.locator('#plMemoTitle').innerText()) === '메모 수정' && (await p.locator('.pl-memo-area').inputValue()) === '첫 줄 메모\n둘째 줄' && (await p.locator('[data-act="memoDelete"]').count()) === 1);
await p.locator('.pl-memo-area').fill('바꾼 메모'); await p.click('[data-act="memoSave"]'); await wait(500);
ok('저장 버튼으로 수정', (await memo()) === '바꾼 메모', JSON.stringify(await memo()));

await p.click('[data-act="memo"]'); await wait(300);
await p.locator('.pl-memo-area').fill('저장 안 될 내용'); await p.keyboard.press('Escape'); await wait(400);
ok('Esc → 취소(바뀌지 않음)', (await memo()) === '바꾼 메모' && (await p.locator('.pl-sheet').count()) === 0);
await p.click('[data-act="memo"]'); await wait(300);
await p.mouse.click(5, 5); await wait(400);
ok('바깥 클릭 → 취소', (await memo()) === '바꾼 메모' && (await p.locator('.pl-sheet').count()) === 0);

await p.click('[data-act="memo"]'); await wait(300);
await p.click('[data-act="memoDelete"]'); await wait(500);
ok('삭제 버튼 → 메모 삭제', (await memo()) === '' && (await p.locator('.pl-memo-chip').count()) === 0);
ok('브라우저 기본 창을 쓰지 않음', dialogs === 0);

console.log(R.join('\n'));
await ctx.close();
process.exit(R.some((l) => l.startsWith('FAIL') || l.startsWith('ERR')) ? 1 : 0);
