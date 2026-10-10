// 글자·아이콘의 상하 정렬 검수. 실행: node tests/align.mjs
// 페이지 위 화면(다운로드 목록창, 알림, 확인 창, 드래그 안내)의 스타일을 content.js 에서 그대로 가져와 그린 뒤,
// 화면을 4배로 찍어 글자 잉크의 실제 위·아래 끝을 픽셀로 재고, 기준(버튼 상자, 옆 아이콘)의 가운데와 비교한다.
//   ALIGN_URL=https://www.youtube.com/  그 페이지 위에 그려서 잰다 (페이지가 불러온 글꼴의 영향을 본다)
//   THEME=light                         밝은 테마로 그려서 잰다 (기본 dark)
//   TOL=0.5                             허용 오차(px)
//   OUT=파일.png                        전체 화면을 저장
import { chromium } from 'playwright';
import fs from 'fs';
import { fileURLToPath } from 'url';

const SRC = fs.readFileSync(fileURLToPath(new URL('../src/core/content.js', import.meta.url)), 'utf8');
const CSS = SRC.match(/const CSS = `([\s\S]*?)`;/)[1];
const DSF = 4;
const TOL = Number(process.env.TOL || 0.5);
const URL_ = process.env.ALIGN_URL || '';
const R = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const row = (title, cls, status, pct) => `<div class="dlp-row"><input type="checkbox" checked><span class="dlp-th"></span><span class="dlp-b"><div class="dlp-t">${title}</div><div class="dlp-line"><div class="dlp-pb ${cls}"><span style="width:${pct}%"></span></div><div class="dlp-m ${status[0]}">${status[1]}</div></div></span></div>`;
const MARKUP = `
<div class="dlp" id="p1" style="--tone:#C83F55"><div class="dlp-h"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5"></path></svg></span><div class="tt">영상 다운로드</div><button type="button" class="r169"><span>16:9</span></button><span class="sp"></span><button type="button" class="cp"><svg class="ico" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"></path></svg><svg class="ok" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg><b>7</b></button><button type="button" class="lst"><svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"></path></svg></button><button type="button" class="cfg"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6"></circle><circle cx="12" cy="12" r="6.4"></circle><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.35 5.35l2.12 2.12M16.53 16.53l2.12 2.12M5.35 18.65l2.12-2.12M16.53 7.47l2.12-2.12"></path></svg></button><button type="button" class="x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div>
  <div class="dlp-list">${row('왕초보 유튜버가 4000시간을 넘기는 현실적인 방법 (유튜브 8000시간)', 'idle', ['host', 'youtube.com'], 0)}${row('짧은 제목', '', ['run', '42%'], 42)}${row('합치는 영상', '', ['run', '합치는 중'], 100)}${row('끝난 영상', 'ok', ['ok', '완료'], 100)}</div>
  <div class="dlp-f"><div class="dlp-bar on"><span style="width:40%"></span></div>
  <div class="dlp-acts"><span class="n">7개 중 7개 선택</span><span class="dlp-btns"><button type="button" class="add">목록 추가</button><button type="button" class="del">선택 삭제 7</button><button type="button" class="pri">다운로드 7개</button></span></div></div></div>
<div class="dlp" id="p2" style="--tone:#C83F55"><div class="dlp-f"><div class="dlp-acts"><span class="n">다운로드 중 40% · 완료 2/7</span><span class="dlp-btns"><button type="button" class="add" disabled>목록 추가</button><button type="button" class="del" disabled>선택 삭제</button><button type="button" class="stop">다운로드 중지</button></span></div></div></div>
<div class="toasts"><div class="toast" id="t1"><div class="head"><span class="ic"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"></path></svg></span><div><div class="tt">링크 7개를 담았어요</div><div class="ts">Alt + 드래그 · 네모</div></div></div><div class="list"><span>• 첫 번째 영상 제목</span><span>• 두 번째 영상 제목</span></div><div class="acts"><button>실행 취소</button><button class="pri">목록 열기</button></div></div>
<div class="toast err" id="t2"><div class="head"><span class="ic"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg></span><div><div class="tt">처리하지 못했어요</div></div></div></div></div>
<div class="modal"><div class="modal-card"><div class="mt">링크 25개를 열까요?</div><div class="md">탭이 한꺼번에 많이 열려요.</div><div class="acts"><button>취소</button><button class="pri">확인</button></div></div></div>
<div class="layer"><div class="pill" style="display:flex;position:static"><b>12</b><div><div class="t">링크 12개 · 영상 다운로드</div><div class="s">드래그 · 네모 · Esc 취소</div></div></div></div>`;
// 검수용 배치: 고정 위치를 풀어 세로로 늘어놓는다 (크기·정렬 규칙은 그대로)
//   FONT="Arial, 'Malgun Gothic'"      글꼴 순서를 바꿔서 잰다 (다른 PC 의 글꼴 구성을 흉내)
//   EXTRA="button { ... }"            스타일을 덧붙여서 잰다 (값을 고를 때)
const LAYOUT = (process.env.EXTRA || '') + (process.env.FONT ? `* { font-family: ${process.env.FONT} !important; } ` : '') + `.dlp, .toasts, .modal, .layer { position: static !important; animation: none !important; margin: 0 0 16px !important; }
  .toast, .modal-card { animation: none !important; } .modal { display: block !important; padding: 0 !important; background: none !important; } .dlp { max-height: none !important; }`;

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 1100 }, deviceScaleFactor: DSF, bypassCSP: true, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const helper = await ctx.newPage();
  await helper.setContent('<canvas></canvas>');
  if (URL_) { await page.goto(URL_, { waitUntil: 'domcontentloaded' }); await wait(4000); } else await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"></body>');
  await page.bringToFront();
  const fonts = await page.evaluate(({ css, layout, markup, theme }) => {
    const h = document.createElement('div');
    h.setAttribute('style', 'position:fixed;left:0;top:0;z-index:2147483647;display:block;width:460px;padding:20px;background:#444');
    h.id = 'plq';
    h.dataset.theme = theme;
    const r = h.attachShadow({ mode: 'open' });
    r.innerHTML = `<style>${css}</style><style>${layout}</style>${markup}`;
    document.documentElement.appendChild(h);
    const has = (f) => document.fonts.check(`12px "${f}"`);
    return ['Roboto', 'Noto Sans KR', 'Malgun Gothic', 'Arial'].filter(has).join(', ');
  }, { css: CSS, layout: LAYOUT, markup: MARKUP, theme: process.env.THEME || 'dark' });
  await wait(500);
  if (process.env.OUT) await page.screenshot({ path: process.env.OUT, clip: { x: 0, y: 0, width: 500, height: 1100 } });

  const $ = (sel) => page.locator('#plq').locator(sel).first();
  const boxOf = async (sel) => { const b = await $(sel).boundingBox(); if (!b) throw new Error('없는 요소: ' + sel); return b; };
  // 글자 잉크의 세로 범위. insetX: 둥근 모서리를 피하려고 좌우를 잘라 낸다. lineH: 첫 줄만 재려면 그 높이
  const ink = async (sel, insetX = 0, lineH = 0) => {
    const b = await boxOf(sel);
    // 둥근 버튼·배지(insetX 가 있을 때)는 위아래 가장자리 1.5px 도 뺀다: 바깥 배경이 한 줄 섞여 글자로 읽히는 것을 막는다
    const insetY = insetX ? 1.5 : 0;
    const clip = { x: b.x + insetX, y: b.y + insetY, width: Math.max(2, b.width - insetX * 2), height: (lineH || b.height) - insetY * 2 };
    const buf = await page.screenshot({ clip });
    if (process.env.DEBUG_DIR) fs.writeFileSync(`${process.env.DEBUG_DIR}/clip-${sel.replace(/[^a-z0-9]+/gi, '_')}.png`, buf);
    const png = buf.toString('base64');
    const r = await helper.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.querySelector('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const count = new Map();
      for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3); count.set(k, (count.get(k) || 0) + 1); }
      const bgKey = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const bg = [(bgKey >> 10 & 31) << 3, (bgKey >> 5 & 31) << 3, (bgKey & 31) << 3];
      let top = -1, bottom = -1;
      for (let y = 0; y < c.height; y++) {
        let hit = 0;
        for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) > 56) hit++; }
        if (hit >= 2) { if (top < 0) top = y; bottom = y; }
      }
      return { top, bottom };
    }, png);
    if (r.top < 0) throw new Error('글자를 찾지 못함: ' + sel);
    return { cy: clip.y + (r.top + r.bottom + 1) / 2 / DSF, box: b };
  };
  const mid = (b) => b.y + b.height / 2;
  const check = (name, off) => R.push(`${Math.abs(off) <= TOL ? 'PASS' : 'FAIL'}  ${name}  — ${off >= 0 ? '아래로' : '위로'} ${Math.abs(off).toFixed(2)}px`);

  R.push(`INFO  글꼴: ${fonts || '(없음)'}${URL_ ? ' · ' + URL_ : ''}`);
  // 1) 버튼: 글자가 버튼 상자의 가운데
  for (const [name, sel] of [['목록창 [목록 추가]', '#p1 .add'], ['목록창 [선택 삭제 7]', '#p1 .del'], ['목록창 [다운로드 7개]', '#p1 .pri'], ['목록창 [다운로드 중지]', '#p2 .stop'],
    ['알림 [실행 취소]', '#t1 .acts button'], ['알림 [목록 열기]', '#t1 .acts .pri'], ['확인 창 [취소]', '.modal .acts button'], ['확인 창 [확인]', '.modal .acts .pri']]) {
    const k = await ink(sel, 14); check('버튼 글자 · ' + name, k.cy - mid(k.box));
  }
  // 2) 버튼 옆 글자: 버튼과 같은 높이
  check('목록창 아래 "7개 중 7개 선택" ↔ 버튼', (await ink('#p1 .dlp-acts .n')).cy - mid(await boxOf('#p1 .add')));
  { const n2 = await ink('#p2 .dlp-acts .n'), s2 = await boxOf('#p2 .stop'); if (Math.abs(n2.cy - mid(s2)) < 8) check('목록창 아래 "다운로드 중 40%" ↔ 버튼', n2.cy - mid(s2)); else R.push('PASS  받는 중: 문구가 길어 버튼 묶음이 다음 줄로 내려감'); }
  // 3) 머리말: 아이콘 ↔ 제목 ↔ 닫기
  const hic = mid(await boxOf('#p1 .dlp-h .ic'));
  check('목록창 제목 "영상 다운로드" ↔ 아이콘', (await ink('#p1 .dlp-h .tt')).cy - hic);
  check('목록창 닫기(×) ↔ 아이콘', mid(await boxOf('#p1 .dlp-h .x')) - hic);
  check('목록창 아이콘 안 화살표', (await ink('#p1 .dlp-h .ic')).cy - hic);
  check('목록창 닫기(×) 안 그림', (await ink('#p1 .dlp-h .x')).cy - mid(await boxOf('#p1 .dlp-h .x')));
  check('목록창 목록 보기 ↔ 아이콘', mid(await boxOf('#p1 .dlp-h .lst')) - hic);
  check('목록창 목록 보기 안 그림', (await ink('#p1 .dlp-h .lst')).cy - mid(await boxOf('#p1 .dlp-h .lst')));
  check('목록창 설정(톱니바퀴) ↔ 아이콘', mid(await boxOf('#p1 .dlp-h .cfg')) - hic);
  check('목록창 설정(톱니바퀴) 안 그림', (await ink('#p1 .dlp-h .cfg')).cy - mid(await boxOf('#p1 .dlp-h .cfg')));
  check('목록창 16:9 ↔ 아이콘', mid(await boxOf('#p1 .dlp-h .r169')) - hic);
  check('목록창 16:9 글자가 상자 가운데', (await ink('#p1 .dlp-h .r169 span')).cy - mid(await boxOf('#p1 .dlp-h .r169')));
  check('목록창 주소 복사 ↔ 아이콘', mid(await boxOf('#p1 .dlp-h .cp')) - hic);
  check('목록창 주소 복사 안 그림', (await ink('#p1 .dlp-h .cp .ico', 3)).cy - mid(await boxOf('#p1 .dlp-h .cp')));
  check('목록창 주소 복사 배지 숫자', (await ink('#p1 .dlp-h .cp b', 1)).cy - mid(await boxOf('#p1 .dlp-h .cp b')));
  // 아래 버튼 줄이 창 너비 안에 들어가는지, 글자가 잘리지 않는지
  for (const id of ['#p1', '#p2']) {
    const fit = await page.evaluate((id) => { const r = document.querySelector('#plq').shadowRoot; const n = r.querySelector(id + ' .dlp-acts .n'); const a = r.querySelector(id + ' .dlp-acts'); return { cut: n.scrollWidth - n.clientWidth, over: a.scrollWidth - a.clientWidth, btn: [...a.querySelectorAll('button')].map((b) => [b.textContent, Math.round(b.getBoundingClientRect().left - a.getBoundingClientRect().right), Math.round(b.getBoundingClientRect().width)]) }; }, id);
    R.push(`${fit.cut <= 0 && fit.over <= 0 ? 'PASS' : 'FAIL'}  ${id === '#p1' ? '목록창' : '받는 중'} 아래 줄이 너비 안에 들어감  — 글자 잘림 ${fit.cut}px, 넘침 ${fit.over}px · 버튼 ${JSON.stringify(fit.btn)}`);
  }
  // 4) 목록 줄: 체크박스 ↔ 썸네일, 상태 글자 ↔ 진행 막대
  for (const i of [1, 2, 3, 4]) {
    const r = `#p1 .dlp-row:nth-child(${i})`;
    check(`목록 ${i}번째 줄 체크박스 ↔ 썸네일`, mid(await boxOf(r + ' input')) - mid(await boxOf(r + ' .dlp-th')));
    if (i > 1) check(`목록 ${i}번째 줄 상태 글자 ↔ 진행 막대`, (await ink(r + ' .dlp-m')).cy - mid(await boxOf(r + ' .dlp-pb')));
  }
  // 5) 알림: 아이콘 ↔ 제목 첫 줄
  check('알림 아이콘 ↔ 제목', (await ink('#t1 .tt')).cy - mid(await boxOf('#t1 .ic')));
  check('오류 알림 아이콘 ↔ 제목', (await ink('#t2 .tt')).cy - mid(await boxOf('#t2 .ic')));
  check('알림 아이콘 안 그림', (await ink('#t1 .ic')).cy - mid(await boxOf('#t1 .ic')));
  // 6) 드래그 안내: 숫자 배지
  const pb = await ink('.pill b', 6); check('드래그 안내 숫자 배지', pb.cy - mid(pb.box));
} catch (e) {
  R.push('FAIL  예외 ' + (e.stack || e));
} finally {
  await browser.close();
}
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
