# Power Link — "Graphite" UI 리디자인 구현 프롬프트 (VS Code · Claude Code용)

아래 코드 블록 전체를 복사해 VS Code의 Claude Code 채팅에 붙여 넣으세요.
(VS Code에서 `C:\GitHub\power-link-extension` 폴더를 연 상태에서)

---

```
너는 이 저장소(C:\GitHub\power-link-extension)의 크롬 확장 "Power Link"의 UI를 새 디자인("Graphite")으로 바꾼다.
항상 한국어로 답하고, 네가 직접 할 수 있는 일(파일 읽기·수정·빌드·테스트·스크린샷·git)은 나에게 시키지 말고 직접 해.

## 0. 가장 중요한 규칙 — 반드시 눈으로 확인하고 보고해
- 화면을 바꿀 때마다 Playwright로 실제 확장을 띄워 스크린샷을 찍고, 그 이미지를 직접 열어 보고 디자인과 비교해.
  "반영했다"는 말은 스크린샷으로 확인한 뒤에만 해. 확인 못 했으면 못 했다고 말해.
- 스크린샷은 deviceScaleFactor 1과 1.25 두 가지로 찍어(내 PC는 윈도우 배율이 있음). 가는 선·번짐까지 확대해서 봐.
- 밝은 테마와 어두운 테마를 둘 다 확인해.

## 1. 먼저 읽을 것
- design/graphite/*.dc.html — 디자인 원본(보드 13개). 각 파일의 inline style과 renderVals()의 T(light/dark) 토큰이 정답이다.
  Main=수집 링크·썸네일, List=목록+선택, Detail=상세, Recent=최근 화면, Popup=팝업, Settings=설정(디자인/수집 규칙),
  *Dark / SettingsRules = 같은 화면을 theme="dark" / section="rules"로 띄운 것.
- src/ui/pl.css(디자인 시스템), src/sidepanel/sidepanel.js, src/popup/popup.js, src/options/options.js, src/core/content.js(토스트)
- CHANGELOG.md, README.md, scripts/bump.sh, tests/*.mjs

## 2. 디자인 원칙 (이전 UI가 "아마추어 같다"는 피드백을 받았음)
- 색은 흑·백·회색만. 보라 카테고리 배지, 주황 떡상 배지, 빨간 플랫폼 알약, 여러 색 점을 모두 없앤다.
  예외는 3가지뿐: ① 유튜브 로고(빨강, 제목 앞) ② 떡상 점수 1.5배 이상일 때 초록 숫자 ③ 탭이 열려 있음/프로필 온라인 초록 점.
- 굵은 글씨(700) 남발 금지. 위계는 500(중간)과 색으로 만든다. 제목·탭·버튼 500, 본문 400.
- 글꼴: 유튜브와 같은 `Roboto, 'Noto Sans KR', Arial, sans-serif` (Google Fonts: Roboto 400/500/700, Noto Sans KR 400/500/700).
  숫자는 font-variant-numeric: tabular-nums. IBM Plex 계열은 모두 제거.
- 모서리: 카드·썸네일 8~10px, 칩 8px, 검색창·주 버튼·아이콘 버튼은 완전 둥글게(pill/원).

## 3. 디자인 토큰 → src/ui/pl.css의 CSS 변수로 (html[data-theme="light"|"dark"])
light: bg #FFFFFF, bg2 #F9F9F9, input #F8F8F8, border #E5E5E5, divider #F0F0F0, text #0F0F0F, text2 #3F3F3F, muted #606060,
       ink #0F0F0F, onInk #FFFFFF, chip #F2F2F2(선택 탭·칩·호버 배경), seg #F2F2F2, segOn #FFFFFF(+그림자 0 1px 2px rgba(0,0,0,.14)),
       up #0B7A3B(떡상), online #16A34A, sel #F2F2F2(선택 행), bar #0F0F0F / barText #FFFFFF / barIcon #D6D6D6
dark : bg #0F0F0F, bg2 #181818, input #121212, border #303030, divider #222222, text #F1F1F1, text2 #D0D0D0, muted #AAAAAA,
       ink #F1F1F1, onInk #0F0F0F, chip #272727, seg #272727, segOn #474747(그림자 없음), up #4ADE80, online #22C55E,
       sel #1F1F1F, bar #272727(+테두리 #3A3A3A) / barText #F1F1F1 / barIcon #D6D6D6
팝업 dark는 bg #212121, chip #333333 (design/graphite/Popup.dc.html 참고).

## 4. 사이드바 구조 (design/graphite/Main·List·Detail·Recent)
1행 헤더(48px, 아래 1px 구분선):
  로고(icons/icon.svg, 22px) · "Power Link"(15px/500) · 버전(12px, muted, manifest version)
  오른쪽에 아이콘 버튼 묶음(각 30×30 원형, 버튼 사이 간격 0): [현재 창의 링크 모으기] [테마 전환] [설정] | 세로 구분선 1×16 | [X 사이드 패널 닫기 → window.close()]
2행 탭(48px, 위 6px 여백, 아래 1px 구분선): 수집 링크(개수) · 최근 화면 · 키워드 · 워치리스트(개수)
  - 탭은 줄 높이 전체, 좌우 padding 10px, 모서리 없음(사각형), 13px/500, 비선택 muted.
  - 선택 탭: 글자색 text + 배경 chip(희미한 회색) + 아래 2px 실선(text 색). 마우스 오버도 같은 희미한 배경.
  - ⚠️ 밑줄은 반드시 `border-bottom: 2px solid`로(비선택은 transparent). `box-shadow: inset`을 쓰면 축소/배율 화면에서
    탭 좌우에 1px 회색 세로선이 번져 보인다(이미 사용자에게 지적받은 버그). 탭 좌우 세로선이 절대 없어야 한다.
3) 필터 영역: 둥근 검색창(36px, pill) / 칩 줄(선택=ink 배경+onInk 글자, 그 외 chip 배경, 앞에 유튜브 칩은 아이콘) + 오른쪽 "종류 ▾" "카테고리 ▾" 텍스트 버튼
   / 전체선택 체크박스 · "N개 표시" · "최근 수집순 ▾" · (상세 보기일 때 "모두 펼치기") · 보기 전환 세그먼트(목록/상세/썸네일 아이콘)
4) 보기별 항목
  - 공통: 제목 맨 앞에 빨간 유튜브 로고(16×11, 유튜브인지 식별용). 채널명 앞에는 채널 아이콘(16px 원, API의 채널 썸네일, 없으면 첫 글자+중립 색).
    카테고리는 배지 대신 회색 글자. 메모 버튼은 모든 항목에(메모 있으면 버튼 배경 chip).
  - 썸네일: 2열 그리드, 16:9 썸네일(좌상단 체크박스, 우하단 영상 길이 검정 반투명 알약), 제목 2줄, 채널 줄, "조회 12만 · 3일 전" + 떡상 ×N(1.5↑만 초록) + 메모 버튼.
  - 목록: 체크박스 · 76×43 썸네일 · 제목 1줄 · 채널 아이콘+"채널 · 조회 · 날짜"+떡상 · (메모 있으면 회색 메모 칩) · 오른쪽 메모 버튼. 선택 행은 sel 배경.
  - 상세: 128×72 썸네일, "카테고리 · 날짜", 제목 14px 2줄, "조회/좋아요/댓글" + "평균 대비 ×N",
    채널 박스(아바타·채널명·구독자·채널력 N, 펼치기 ▾) → 펼치면 3×2 표(개설일/전체 영상/롱폼·쇼츠/최근 30일/평균 조회/최근 30일 조회),
    카테고리 선택 · 워치리스트 · 채널 열기 버튼, 메모 칩. 정보를 불러오는 중이면 점선 박스에 스피너+"유튜브 정보 불러오는 중…".
5) 하단 떠 있는 바(항상 표시, 좌우·아래 12px, 48px, radius 12): 선택 없으면 "전체 N개", 있으면 "N개 선택"
   아이콘 7개(각 32px 원형): 복사 · 새 탭으로 열기 · 썸네일 압축 저장 · 워치리스트 · 북마크 · 엑셀 · 삭제, 선택 중이면 구분선 + 선택 해제(X). 각 버튼에 title/aria-label.
6) 최근 화면: 검색 "제목, 주소 검색" · 프로필 칩(모든 프로필 / 이 프로필 / 다른 프로필들, 온라인=초록 점, 오프라인=빈 원) ·
   "N개 · 최대 M개 기록" · 정렬 세그먼트(최근 순/오래된 순).
   행: 64×36 썸네일(유튜브) 또는 파비콘 · 제목(유튜브면 로고) · "● 열림 · 도메인 · 시간" · 다른 프로필이면 사람 아이콘+프로필 이름 알약 · 마우스 오버한 행에만 [+ 수집 링크 추가] [휴지통] 원형 버튼.

## 5. 팝업 (design/graphite/Popup.dc.html, 380×600 이하 — 크롬 팝업 최대 높이 600)
헤더: 로고 24 · "Power Link" · 버전 · [사이드바 열기][설정] 원형 버튼 / 범위·플랫폼·종류·담을 정보 세그먼트와 칩 /
한 문장 요약 박스 / [목록에 저장](chip) [복사](ink) pill 버튼 / "Ctrl Shift Alt + 우클릭 드래그로도 모아요 · 규칙" / 푸터 "사이드바 Alt + Shift + L · 수집 링크 N".

## 6. 설정 (design/graphite/Settings.dc.html, SettingsRules, SettingsDark)
- 왼쪽 256px 메뉴(로고+Power Link+"설정 · vX", 아이콘+이름: 수집 규칙/수집 항목/카테고리/YouTube API/최근 화면/일반/디자인, 현재 메뉴=chip 배경),
  오른쪽 본문 최대 760px, 섹션은 테두리 카드(radius 14), 행은 "제목(15/500)+설명(13 muted) | 컨트롤".
- 새 메뉴 "디자인": 테마 = [기기 테마 사용] [어두운 테마] [밝은 테마] 미리보기 카드 라디오(선택=2px text 링),
  안내 "이 브라우저에만 설정이 적용돼요." → chrome.storage.local 'pl_theme'('device'|'dark'|'light', 기본 device).
  device는 prefers-color-scheme을 따름. 사이드바·팝업·설정 모두 html[data-theme]로 즉시 반영, storage.onChanged로 다른 화면도 동기화.
  사이드바 헤더의 [테마 전환] 버튼은 light↔dark를 바꿔 저장.
  추가 행: 글꼴 안내(Roboto · Noto Sans KR), 목록 기본 보기(목록/상세/썸네일), 떡상 점수 강조 스위치.
- "수집 규칙" 화면: 규칙 행 = 스위치 · [Ctrl] + 우클릭 드래그 · 모양(박스/자유도형, 규칙 색은 작은 점선 아이콘에만) · → · 동작 · ⋮, 오른쪽 위 [+ 규칙 추가](ink pill).
- 기존 설정 화면의 모든 기능은 그대로 유지하고 모양만 이 규칙으로 통일해.

## 7. 그 밖
- content.js의 드래그 완료 토스트도 같은 글꼴·색 규칙(어두운 카드, 초록/빨강은 상태 아이콘에만)으로 맞춰.
- 기능 동작은 바꾸지 마. 기존 data-act 핸들러·메시지·저장 구조 유지.
- 접근성: 아이콘 버튼 aria-label+title, 실제 <button>/<input>, 텍스트 대비 4.5:1 이상.

## 8. 검증 → 배포 순서
1) 기존 테스트 전부 통과: node tests/verify.mjs, tests/recent.mjs, tests/thumbs.mjs, (API 목업) tests/enrich.mjs, tests/bridge.mjs
2) 새 스크립트 tests/screens.mjs: 사이드바(썸네일/목록/상세/최근 화면) × (light/dark), 팝업 × 2, 설정(디자인/수집 규칙) × 2 를
   DPR 1과 1.25로 캡처해 tests/screens/ 에 저장. 이미지를 직접 열어 design/graphite 보드와 비교하고 차이를 고쳐.
   특히 확인: 탭 좌우 세로선 없음, 헤더 아래 구분선, 헤더 아이콘 간격(붙어 있게), X 버튼, 유튜브 로고 위치, 채널 아이콘.
3) bash scripts/bump.sh 2.2.0 → CHANGELOG에 "Graphite 리디자인" 항목 → 커밋 → 태그 v2.2.0
4) dist 갱신(scripts/build.ps1 또는 build.sh) 후 "chrome://extensions에서 새로고침" 안내
5) git push origin master feature/power-link-2 backup/v1.0.0 --tags  (backup/v1.0.0, v1.0.0은 절대 지우거나 덮어쓰지 말 것)
6) 마지막 보고에 스크린샷 몇 장(밝은/어두운 사이드바, 설정)을 첨부해.
```
