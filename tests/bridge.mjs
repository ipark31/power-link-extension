// 다른 크롬 프로필 연동(Native Messaging 도우미) 검증. 실행: node tests/bridge.mjs
// 테스트 동안만 HKCU\Software\(Chromium|Google\Chrome)\NativeMessagingHosts\com.powerlink.bridge 를
// 등록하고, 끝나면 원래 값으로 복원(없었으면 삭제)한다.
// 공유 데이터는 임시 폴더(POWERLINK_BRIDGE_DIR)만 사용하므로 실제 설치본을 건드리지 않는다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const HOSTBAT = fileURLToPath(new URL('../native-host/host.bat', import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-bridge-'));
const bridgeDir = path.join(work, 'bridge');
const REG_KEYS = [
  'HKCU\\Software\\Chromium\\NativeMessagingHosts\\com.powerlink.bridge',
  'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.powerlink.bridge'
];
const regBackup = {};

const R = [];
const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 300) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await wait(step); } try { return !!(await fn()); } catch (e) { return false; } };

const server = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(`<title>페이지 ${q.url.slice(1)}</title><h1>${q.url}</h1>`); }).listen(8773);

const env = { ...process.env, POWERLINK_BRIDGE_DIR: bridgeDir, POWERLINK_BRIDGE_ONLINE_MS: '3000' };
const launch = (dir) => chromium.launchPersistentContext(path.join(work, dir), {
  headless: false, env, executablePath: process.env.CHROME || undefined,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox']
});
const swOf = async (ctx) => { let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); return sw; };
const othersOf = (sw) => sw.evaluate(async () => (await chrome.storage.local.get('pl_recentOthers')).pl_recentOthers || { profiles: [] });

let A = null, B = null;
try {
  A = await launch('profA');
  const swA = await swOf(A); await wait(1200);
  const extId = swA.url().split('/')[2];

  // 1) 도우미 미설치 → 사이드바 최근 화면에 설치 안내
  const spA = await A.newPage(); spA.on('pageerror', (e) => R.push('ERR A ' + e.message));
  await spA.setViewportSize({ width: 380, height: 700 });
  await spA.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`); await wait(600);
  await spA.click('[data-act="tab"][data-val="recent"]'); await wait(800);
  ok('미설치 시 도우미 설치 안내 표시', (await spA.locator('[data-bridge-notice]').count()) === 1);

  // 2) 호스트 등록(테스트 전용) → '다시 연결' 버튼으로 연결
  const manifestPath = path.join(work, 'com.powerlink.bridge.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ name: 'com.powerlink.bridge', description: 'Power Link bridge (test)', path: HOSTBAT, type: 'stdio', allowed_origins: [`chrome-extension://${extId}/`] }, null, 2));
  for (const k of REG_KEYS) {
    let prev = null;
    try { const out = execFileSync('reg', ['query', k, '/ve'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); const m = out.match(/REG_SZ\s+(.+)/); prev = m ? m[1].trim() : null; } catch (e) { /* key absent */ }
    regBackup[k] = prev;
    execFileSync('reg', ['add', k, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f']);
  }
  await swA.evaluate(async () => { await chrome.storage.local.set({ pl_profileName: '업무용' }); });
  await spA.click('[data-act="rBridgeRetry"]');
  ok('다시 연결 → 도우미 연결됨', await until(async () => (await swA.evaluate(async () => (await chrome.storage.local.get('pl_bridge')).pl_bridge))?.connected));
  ok('연결 후 설치 안내 사라짐', await until(async () => (await spA.locator('[data-bridge-notice]').count()) === 0, 4000));

  // A에서 화면 두 개 보기
  for (const n of ['alpha', 'beta']) { const p = await A.newPage(); await p.goto('http://localhost:8773/' + n); await p.bringToFront(); await wait(400); }

  // 3) 두 번째 프로필 → 서로의 최근 화면 공유
  B = await launch('profB');
  const swB = await swOf(B); await wait(1500);
  await swB.evaluate(async () => { await chrome.storage.local.set({ pl_profileName: '개인용' }); });
  const pB = await B.newPage(); await pB.goto('http://localhost:8773/gamma'); await pB.bringToFront(); await wait(400);
  // 유튜브 썸네일 확인용 항목을 B의 최근 목록에 직접 추가
  await swB.evaluate(async () => {
    const list = (await chrome.storage.local.get('pl_recent')).pl_recent || [];
    list.unshift({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: '유튜브 썸네일 테스트', at: Date.now() });
    await chrome.storage.local.set({ pl_recent: list });
  });
  ok('A가 B의 목록을 받음', await until(async () => {
    const p = (await othersOf(swA)).profiles.find((x) => x.name === '개인용');
    return p && p.items.some((i) => i.url.endsWith('/gamma'));
  }), JSON.stringify((await othersOf(swA)).profiles.map((p) => p.name + ':' + (p.items || []).length)));
  ok('B가 A의 목록을 받음', await until(async () => {
    const p = (await othersOf(swB)).profiles.find((x) => x.name === '업무용');
    return p && p.items.some((i) => i.url.endsWith('/alpha')) && p.items.some((i) => i.url.endsWith('/beta'));
  }), JSON.stringify((await othersOf(swB)).profiles.map((p) => p.name + ':' + (p.items || []).length)));

  // 4) 사이드바 표시: 배지 · 검색 · 유튜브 썸네일
  const spB = await B.newPage(); spB.on('pageerror', (e) => R.push('ERR B ' + e.message));
  await spB.setViewportSize({ width: 380, height: 700 });
  await spB.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`); await wait(600);
  await spB.click('[data-act="tab"][data-val="recent"]'); await wait(800);
  ok('다른 프로필 배지 표시', (await spB.locator('.pl-recent .pl-ptag', { hasText: '업무용' }).count()) >= 2);
  await spB.fill('#rq', 'alpha'); await wait(300);
  ok('다른 프로필 항목 검색', (await spB.locator('.pl-recent__title').count()) === 1 && ((await spB.locator('.pl-recent__title').first().textContent()) || '').includes('alpha'));
  await spB.fill('#rq', '업무용'); await wait(300);
  ok('프로필 이름으로 검색', (await spB.locator('.pl-recent').count()) >= 2);
  await spB.fill('#rq', ''); await wait(300);
  ok('다른 프로필 유튜브 썸네일', await until(async () => (await spA.locator('.pl-recent', { has: spA.locator('.pl-ptag', { hasText: '개인용' }) }).locator('.pl-recent__thumb').count()) >= 1, 5000));

  // 5) 이동: B에서 A의 열린 탭 클릭 → A의 그 탭이 활성화
  await spB.click('[data-act="rGo"][data-val="http://localhost:8773/alpha"][data-pid]');
  ok('열린 탭 이동(activate)', await until(async () => {
    const t = await swA.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8773/alpha' })).map((x) => x.active));
    return t.length === 1 && t[0];
  }));
  // 닫힌 화면 클릭 → A에서 새 탭으로 다시 열림
  await swA.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8773/beta' }); if (t) await chrome.tabs.remove(t.id); }); await wait(600);
  await spB.click('[data-act="rGo"][data-val="http://localhost:8773/beta"][data-pid]');
  ok('닫힌 화면은 그 프로필에서 새 탭으로', await until(async () => (await swA.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8773/beta' })).length)) === 1));

  // 6) 삭제(forget): B에서 A의 beta 삭제 → A 목록·B 표시 모두 갱신
  await spB.click('[data-act="rDel"][data-val="http://localhost:8773/beta"][data-pid]');
  ok('다른 프로필에서 삭제(forget)', await until(async () => {
    const rc = await swA.evaluate(async () => (await chrome.storage.local.get('pl_recent')).pl_recent || []);
    return !rc.some((r) => r.url.endsWith('/beta'));
  }));
  ok('삭제가 상대 목록 표시에도 반영', await until(async () => {
    const p = (await othersOf(swB)).profiles.find((x) => x.name === '업무용');
    return p && !p.items.some((i) => i.url.endsWith('/beta'));
  }));

  // 7) 다른 프로필 항목도 기존 pl:recentAdd로 수집 링크에 추가
  await spB.click('[data-act="rAdd"][data-val="http://localhost:8773/alpha"]');
  ok('다른 프로필 항목을 수집 링크에 추가', await until(async () => (await swB.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links || [])).some((l) => l.url.endsWith('/alpha'))));

  // 7-1) 중복 링크 닫기: A와 B 모두 alpha가 열려 있으면 A(현재 프로필)를 남기고 B의 탭을 닫음
  const pB2 = await B.newPage(); await pB2.goto('http://localhost:8773/alpha'); await pB2.bringToFront(); await wait(400);
  await until(async () => ((await othersOf(swA)).profiles.find((x) => x.name === '개인용')?.items || []).some((i) => i.url.endsWith('/alpha')));
  await spA.bringToFront(); await spA.click('[data-act="tab"][data-val="links"]'); await spA.click('[data-act="tab"][data-val="recent"]'); await wait(500);
  await spA.click('[data-act="rDedupe"]'); await spA.click('.pl-sheet [data-act="confirmYes"]');
  const alphaIn = (sw) => sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8773/alpha' })).length);
  ok('중복 링크 닫기: 현재 프로필 우선, 다른 프로필 탭 닫힘', await until(async () => (await alphaIn(swB)) === 0 && (await alphaIn(swA)) === 1), `A ${await alphaIn(swA)}개 / B ${await alphaIn(swB)}개`);

  // 8) 오프라인: A 종료 → 회색(is-offline) 표시, 클릭하면 현재 프로필에서 새 탭
  await A.close(); A = null;
  ok('오프라인 표시', await until(async () => (await spB.locator('.pl-recent.is-offline').count()) >= 1, 15000));
  await spB.click('[data-act="rGo"][data-val="http://localhost:8773/alpha"][data-pid]');
  ok('오프라인이면 현재 프로필에서 새 탭', await until(async () => B.pages().some((p) => p.url().endsWith('/alpha')), 5000));
} finally {
  try { if (A) await A.close(); } catch (e) { /* already closed */ }
  try { if (B) await B.close(); } catch (e) { /* already closed */ }
  for (const k of Object.keys(regBackup)) {
    try {
      if (regBackup[k]) execFileSync('reg', ['add', k, '/ve', '/t', 'REG_SZ', '/d', regBackup[k], '/f']);
      else execFileSync('reg', ['delete', k, '/f']);
    } catch (e) { /* key already gone */ }
  }
  server.close();
  try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* files may be locked briefly */ }
}
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL') || l.startsWith('ERR')) ? 1 : 0);
