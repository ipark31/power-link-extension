// 영상 다운로드(다운로더 서버 연동) 검증. 실행: node tests/download.mjs
// 실제 서버 대신 로컬 목 서버(/health, /batch, /batch/:id)를 띄워 사이드바 → 백그라운드 → 서버 요청 형식과
// 진행 카드·완료 처리(downloadedAt)·비영상 링크 건너뛰기·연결 실패 안내를 확인한다.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const R = [];
const ok = (n, c, i = '') => R.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* retry */ } await wait(step); } try { return !!(await fn()); } catch (e) { return false; } };

// ---- 목 다운로더 서버 ------------------------------------------------------
const posted = [];
let polls = 0;
const batch = { batch_id: 'b-test-1', status: 'running', save_dir: 'D:\\Videos\\PL', mode: 'audio', quality: '720', total: 0, progress: 0, counts: { pending: 0, downloading: 0, completed: 0, error: 0 }, items: [] };
const server = http.createServer((q, r) => {
  const json = (code, obj) => { r.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); r.end(JSON.stringify(obj)); };
  if (q.method === 'OPTIONS') return json(200, {});
  if (q.url === '/api/health') return json(200, { status: 'ok' });
  if (q.url === '/api/batch' && q.method === 'POST') {
    let body = ''; q.on('data', (c) => (body += c)); q.on('end', () => {
      const req = JSON.parse(body); posted.push(req);
      batch.total = req.urls.length; batch.items = req.urls.map((u, i) => ({ url: u, task_id: 't' + i, status: 'pending', progress: 0 }));
      batch.counts = { pending: req.urls.length, downloading: 0, completed: 0, error: 0 };
      json(202, batch);
    });
    return;
  }
  if (q.url.startsWith('/api/batch/')) {
    polls++;
    // 1차 폴링: 절반 진행, 2차: 첫 항목 완료 + 둘째 실패
    if (polls === 1) { batch.items[0].status = 'downloading'; batch.items[0].progress = 50; batch.progress = 25; batch.counts = { pending: 1, downloading: 1, completed: 0, error: 0 }; }
    else { batch.items[0] = Object.assign(batch.items[0], { status: 'completed', progress: 100, file_path: 'D:\\Videos\\PL\\a.m4a' }); batch.items[1] = Object.assign(batch.items[1], { status: 'error', error: 'ERROR: Private video' }); batch.progress = 50; batch.counts = { pending: 0, downloading: 0, completed: 1, error: 1 }; batch.status = 'done'; }
    return json(200, batch);
  }
  json(404, { detail: 'nope' });
}).listen(8779);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-dl-'));
const ctx = await chromium.launchPersistentContext(work, { headless: false, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
  const id = sw.url().split('/')[2];
  await sw.evaluate(async () => {
    const now = new Date().toISOString();
    await chrome.storage.sync.set({ pl_settings: { schema: 2, dl: { server: 'http://127.0.0.1:8779/api', saveDir: 'D:\\Videos\\PL', mode: 'audio', quality: '720', concurrency: 3 } } });
    await chrome.storage.local.set({ pl_links: [
      { id: 'l1', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', title: 'Me at the zoo', platform: 'yt', kind: 'post', ids: { videoId: 'jNQXAC9IVRw' }, createdAt: now },
      { id: 'l2', url: 'https://www.tiktok.com/@scout2015/video/6718335390845095173', title: '틱톡 영상', platform: 'tt', kind: 'post', createdAt: now },
      { id: 'l3', url: 'https://www.youtube.com/@NASA', title: 'NASA 채널', platform: 'yt', kind: 'account', createdAt: now },
      { id: 'l4', url: 'https://blog.naver.com/someone/1234', title: '블로그 글', platform: 'blog', kind: 'post', createdAt: now }
    ] });
  });

  // 연결 확인 메시지
  const health = await sw.evaluate(async () => {
    const s = (await chrome.storage.sync.get('pl_settings')).pl_settings;
    const res = await fetch(s.dl.server + '/health'); return (await res.json()).status;
  });
  ok('목 서버 /health 응답', health === 'ok');

  const sp = await ctx.newPage(); await sp.goto(`chrome-extension://${id}/src/sidepanel/sidepanel.html`); await sp.waitForSelector('.pl-lrow'); await wait(400);
  ok('일괄 작업 바에 영상 다운로드 버튼', !!(await sp.$('[data-act="bDownload"]')));

  // 아무것도 선택하지 않음 → 보이는 링크 전체(4개) 대상, 영상 게시물 2개만 보내고 2개 건너뜀
  await sp.click('[data-act="bDownload"]');
  await sp.waitForSelector('.pl-sheet__card');
  const desc = await sp.$eval('.pl-sheet__desc', (e) => e.textContent);
  const title = await sp.$eval('.pl-sheet__title', (e) => e.textContent);
  ok('확인 창: 대상 2개', /영상 2개/.test(title), title);
  ok('확인 창: 저장 위치·트랙·화질 표시', /D:\\Videos\\PL/.test(desc) && /음성만/.test(desc) && /720p/.test(desc), desc.replace(/\s+/g, ' '));
  ok('확인 창: 비영상 2개 건너뜀 안내', /2개는 건너뛰어요/.test(desc));
  await sp.click('[data-act="confirmYes"]');

  ok('서버에 POST /batch 1회', await until(() => posted.length === 1, 5000), String(posted.length));
  const req = posted[0] || {};
  ok('요청: 영상 URL 2개만 (채널·블로그 제외)', Array.isArray(req.urls) && req.urls.length === 2 && req.urls.every((u) => /youtube|tiktok/.test(u)), JSON.stringify(req.urls));
  ok('요청: 설정의 save_dir·mode·quality·concurrency 전달', req.save_dir === 'D:\\Videos\\PL' && req.mode === 'audio' && req.quality === '720' && req.concurrency === 3, JSON.stringify({ save_dir: req.save_dir, mode: req.mode, quality: req.quality, concurrency: req.concurrency }));

  ok('진행 카드 표시', await until(() => sp.$('.pl-dl'), 3000));
  ok('진행률 폴링 반영 (25%)', await until(async () => /25%/.test(await sp.$eval('.pl-dl__label', (e) => e.textContent)), 6000));
  ok('완료 카드: 성공 1 · 실패 1', await until(async () => /완료 · 성공 1개 · 실패 1개/.test(await sp.$eval('.pl-dl__label', (e) => e.textContent)), 8000));
  ok('실패 사유 표시', !!(await sp.$('.pl-dl__err')) && /Private video/.test(await sp.$eval('.pl-dl__err', (e) => e.textContent)));
  ok('완료 토스트', await until(async () => (await sp.textContent('body')).includes('성공 1개, 실패 1개'), 3000));
  const links = await sw.evaluate(async () => (await chrome.storage.local.get('pl_links')).pl_links);
  ok('성공한 링크에 downloadedAt 기록, 실패/기타는 없음', !!links.find((l) => l.id === 'l1').downloadedAt && !links.find((l) => l.id === 'l2').downloadedAt && !links.find((l) => l.id === 'l4').downloadedAt);
  await sp.click('[data-act="dlHide"]');
  ok('진행 카드 닫기', await until(async () => !(await sp.$('.pl-dl')), 2000));

  // 서버가 꺼진 경우: 안내 토스트 + 설정 버튼
  server.close();
  await sp.click('[data-act="sel"][data-id="l1"]');
  await sp.click('[data-act="bDownload"]'); await sp.waitForSelector('.pl-sheet__card'); await sp.click('[data-act="confirmYes"]');
  ok('서버 연결 실패 안내 토스트', await until(async () => /연결할 수 없어요/.test(await sp.textContent('body')), 8000));
  ok('요청 재전송 없음', posted.length === 1);

  // 설정 화면: 영상 다운로드 탭
  const op = await ctx.newPage(); await op.goto(`chrome-extension://${id}/src/options/options.html#download`); await op.waitForSelector('#dlServer');
  ok('설정 › 영상 다운로드 탭: 서버 주소 값', (await op.inputValue('#dlServer')) === 'http://127.0.0.1:8779/api');
  ok('설정: 저장 폴더 값', (await op.inputValue('#dlSaveDir')) === 'D:\\Videos\\PL');
  await op.fill('#dlSaveDir', 'E:\\Out'); await op.press('#dlSaveDir', 'Tab'); await wait(300);
  await op.selectOption('#dlMode', 'video'); await wait(300);
  const saved = await sw.evaluate(async () => (await chrome.storage.sync.get('pl_settings')).pl_settings.dl);
  ok('설정 저장: 폴더·트랙 변경 반영', saved.saveDir === 'E:\\Out' && saved.mode === 'video' && saved.server === 'http://127.0.0.1:8779/api', JSON.stringify(saved));
  await op.click('#dlTest'); await wait(1500);
  ok('연결 확인(서버 꺼짐) 상태 문구', await until(async () => /연결할 수 없어요/.test(await op.textContent('.pl-opt__content')), 8000));
} catch (e) {
  R.push('FAIL  예외 ' + (e.stack || e));
} finally {
  await ctx.close().catch(() => {});
  try { server.close(); } catch (e) { /* closed */ }
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(R.join('\n'));
const fails = R.filter((l) => l.startsWith('FAIL')).length;
console.log(`\n${R.length - fails}/${R.length} passed`);
process.exit(fails ? 1 : 0);
