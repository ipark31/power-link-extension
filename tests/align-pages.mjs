// 확장 화면(설정, 사이드바, 시작 안내)의 버튼·칩 글자 상하 정렬 검수. 실행: node tests/align-pages.mjs
// 글자만 들어 있는 한 줄짜리 버튼·칩을 모두 찾아, 화면을 4배로 찍어 글자 잉크의 가운데와 상자 가운데를 비교한다.
// 페이지 위 화면(다운로드 목록창 등)은 tests/align.mjs 가 잰다.
//   TOL=0.5   허용 오차(px)      ALL=1   통과한 항목도 출력      EXTRA="css"   스타일을 덧붙여서 잰다      ONLY=견본   그 화면만
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const EXT = process.env.EXT || fileURLToPath(new URL('../', import.meta.url));
const DSF = 4;
const TOL = Number(process.env.TOL || 0.5);
const R = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-align-'));
const ctx = await chromium.launchPersistentContext(work, { headless: false, viewport: { width: 1100, height: 900 }, deviceScaleFactor: DSF, executablePath: process.env.CHROME || undefined, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker'); await wait(1200);
  const id = new URL(sw.url()).host;
  // 사이드바에 버튼·칩이 나오도록 링크 몇 개를 넣어 둔다
  await sw.evaluate(async () => {
    const mk = (n, title) => ({ id: 'v' + n, url: 'https://www.youtube.com/watch?v=VIDEO00000' + n, title, platform: 'yt', kind: 'post', domain: 'youtube.com', ids: { videoId: 'VIDEO00000' + n }, thumb: '', createdAt: new Date().toISOString() });
    await chrome.storage.local.set({ pl_links: [mk(1, '첫 번째 영상 제목'), mk(2, '두 번째 영상 제목'), mk(3, '세 번째 영상 제목')] });
  });
  const helper = await ctx.newPage();
  await helper.setContent('<canvas></canvas>');
  const inkOf = async (page, clip) => {
    const png = (await page.screenshot({ clip })).toString('base64');
    return helper.evaluate(async (b64) => {
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
  };

  // 견본: 화면에 늘 나오지는 않는 크기(작은 버튼, 구간 선택, 태그 등)까지 한 장에 늘어놓은 페이지. 확장 주소로 열어 같은 글꼴을 쓴다
  const PAGES = [['견본', `chrome-extension://${id}/tests/align-gallery.html`], ['설정', `chrome-extension://${id}/src/options/options.html`], ['사이드바', `chrome-extension://${id}/src/sidepanel/sidepanel.html`], ['시작 안내', `chrome-extension://${id}/src/welcome/welcome.html`]];
  for (const [name, url] of PAGES.filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) {
    const page = await ctx.newPage();
    await page.goto(url); await page.bringToFront(); await wait(1500);
    if (process.env.EXTRA) { await page.addStyleTag({ content: process.env.EXTRA }); await wait(300); } // 값을 고를 때: 스타일을 덧붙여서 잰다
    // 글자만 있는 한 줄 버튼·칩·배지: 누를 수 있거나 배경/테두리가 있는 상자, 높이 16~48px, 그림(svg/img) 없음, 화면 안에 보이는 것
    const targets = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      const solid = (cs) => { const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/); const a = m ? m[1].split(',').map(Number) : [0, 0, 0, 0]; return (a.length < 4 || a[3] > 0.05); };
      const boxed = (cs) => solid(cs) || parseFloat(cs.borderTopWidth) > 0;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        const clickable = /^(BUTTON|A)$/.test(el.tagName) || /button|tab/.test(el.getAttribute('role') || '');
        if (!clickable && !boxed(cs)) continue;
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        if (el.querySelector('input, select, textarea, button')) continue;
        // 안에 배경이 있는 조각(숫자 배지 등)이 있으면 그 조각은 따로 잰다
        if ([...el.querySelectorAll('*')].some((c) => { const k = getComputedStyle(c); return k.display !== 'none' && boxed(k); })) continue;
        const b = el.getBoundingClientRect();
        if (b.height < 16 || b.height > 48 || b.width < 12 || b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth) continue;
        // 글자 조각의 위치만 모은다 (아이콘은 옆에 있어도 재는 범위에서 빠진다)
        const rects = [];
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!n.nodeValue.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rects.push(r); }
        const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (!rects.length || !txt || txt.length > 24) continue;
        const tops = rects.map((r) => r.top + r.height / 2);
        if (Math.max(...tops) - Math.min(...tops) > 3) continue; // 여러 줄
        const left = Math.max(b.left + 1, Math.min(...rects.map((r) => r.left))), right = Math.min(b.right - 1, Math.max(...rects.map((r) => r.right)));
        const hit = document.elementFromPoint((left + right) / 2, b.top + b.height / 2);
        if (hit !== el && !el.contains(hit)) continue;
        const key = cs.fontSize + '|' + Math.round(b.height) + '|' + el.className + '|' + txt.replace(/\d+/g, '0');
        if (seen.has(key)) continue; seen.add(key);
        // 기준은 테두리를 뺀 안쪽 상자의 가운데: 밑줄 탭, 아래 테두리가 두꺼운 키 표시는 테두리만큼 글자가 올라가 있는 것이 맞다
        const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
        out.push({ txt, cls: (el.tagName.toLowerCase() + '.' + String(el.className)).slice(0, 44), fs: cs.fontSize, h: b.height, y: b.top, x: left, w: right - left, mid: b.top + bt + (b.height - bt - bb) / 2 });
      }
      return out;
    });
    let bad = 0, max = 0;
    for (const t of targets) {
      if (t.w < 4) continue;
      const clip = { x: t.x, y: t.y + 3, width: t.w, height: t.h - 6 }; // 위아래 3px 제외: 탭 밑줄·테두리를 글자로 읽지 않게
      const r = await inkOf(page, clip);
      if (r.top < 0) continue;
      const off = clip.y + (r.top + r.bottom + 1) / 2 / DSF - t.mid;
      max = Math.max(max, Math.abs(off));
      const fail = Math.abs(off) > TOL; if (fail) bad++;
      if (fail || process.env.ALL) R.push(`${fail ? 'FAIL' : 'PASS'}  ${name} · "${t.txt}" (${t.fs}, 높이 ${Math.round(t.h * 100) / 100}px, .${t.cls})  — ${off >= 0 ? '아래로' : '위로'} ${Math.abs(off).toFixed(2)}px`);
    }
    R.push(`${bad ? 'FAIL' : 'PASS'}  ${name}: 버튼·칩 ${targets.length}개, 어긋난 것 ${bad}개, 최대 ${max.toFixed(2)}px`);
    await page.close();
  }
} catch (e) {
  R.push('FAIL  예외 ' + (e.stack || e));
} finally {
  await ctx.close().catch(() => {});
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(R.join('\n'));
process.exit(R.some((l) => l.startsWith('FAIL')) ? 1 : 0);
