// 사이드바 검색창 한글(IME) 입력 검증. 실행: node tests/ime.mjs
// 한글은 조합(composition) 중에 입력칸이 다시 그려지면 글자가 깨진다(‘퀄리’ → ‘퀄퀄 ㄹ’).
// CDP Input.imeSetComposition 으로 조합을 흉내 내고, 조합 도중에 목록 갱신(storage 변경)을 일으킨다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs'; import os from 'os'; import path from 'path';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-ime-')), { headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
const R = []; const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
await wait(1000);
const sp = await ctx.newPage(); sp.on('pageerror', (e) => R.push('ERR ' + e.message));
await sp.setViewportSize({ width: 420, height: 800 });
await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await wait(500);
await sp.bringToFront();
await sp.evaluate(async () => {
  await chrome.storage.local.set({
    pl_links: ['퀄리티 좋은 영상', '퀄리 테스트', '다른 제목'].map((t, i) => ({ id: 'L' + i, url: 'https://ex.test/' + i, title: t, platform: 'web', kind: 'post', domain: 'ex.test', ids: {} })),
    pl_recent: ['퀄리티 화면', '다른 화면'].map((t, i) => ({ url: 'https://r.test/' + i, title: t, at: Date.now() - i * 1000 }))
  });
});
await wait(400);
const cdp = await ctx.newCDPSession(sp);
// something re-renders the panel while a syllable is being composed (tab events, details arriving…)
const poke = () => sp.evaluate(async () => { const l = (await chrome.storage.local.get('pl_recent')).pl_recent; l[1].at = Date.now(); await chrome.storage.local.set({ pl_recent: l }); const k = (await chrome.storage.local.get('pl_links')).pl_links; k[2].title = '다른 제목 ' + Date.now(); await chrome.storage.local.set({ pl_links: k }); });
async function typeKorean(syllables) {
  for (const steps of syllables) {
    for (const s of steps.slice(0, -1)) { await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length }); await wait(60); await poke(); await wait(220); }
    await cdp.send('Input.insertText', { text: steps[steps.length - 1] }); await wait(80);
  }
}
const QUALI = [['ㅋ', '쿼', '퀄', '퀄'], ['ㄹ', '리', '리']]; // 퀄 + 리, each syllable composed step by step

for (const [tab, input, expect] of [['links', '#q', '2개 표시'], ['recent', '#rq', '1개']]) {
  await sp.click(`[data-act="tab"][data-val="${tab}"]`); await wait(400);
  await sp.click(input); await wait(100);
  await typeKorean(QUALI); await wait(500);
  const v = await sp.inputValue(input);
  ok(`${tab === 'links' ? '수집 링크' : '최근 화면'} 검색: 조합 중 목록이 갱신돼도 ‘퀄리’가 그대로`, v === '퀄리', JSON.stringify(v));
  ok(`${tab === 'links' ? '수집 링크' : '최근 화면'} 검색 결과`, (await sp.locator('.pl-count').innerText()).startsWith(expect), await sp.locator('.pl-count').innerText());
  ok(`${tab === 'links' ? '수집 링크' : '최근 화면'} 검색창 포커스 유지`, await sp.evaluate((s) => document.activeElement === document.querySelector(s), input));
  await sp.fill(input, ''); await wait(400);
}
console.log(R.join('\n'));
await Promise.race([ctx.close(), wait(5000)]);
process.exit(R.some((l) => l.startsWith('FAIL') || l.startsWith('ERR')) ? 1 : 0);
