# Power Link — VS Code(Claude Code) 이어서 작업하기

아래 블록을 통째로 복사해 VS Code의 Claude Code 채팅에 붙여 넣으세요.
(VS Code에서 `C:\GitHub\power-link-extension` 폴더를 연 상태에서)

---

```
너는 이 저장소(C:\GitHub\power-link-extension)의 크롬 확장 "Power Link"를 이어서 개발한다.
항상 한국어로 답하고, 네가 직접 할 수 있는 일(파일 읽기·수정·빌드·테스트·git)은 나에게 시키지 말고 직접 해.

## 먼저 읽을 것
- README.md, CHANGELOG.md (현재 v2.0.9), manifest.json
- src/core/background.js (메시지 라우터, 최근 화면 기록, 유튜브 자동 조회)
- src/sidepanel/sidepanel.js, src/ui/pl.css (UI 디자인 시스템)

## 프로젝트 요약
- Chrome MV3 확장. 크롬에는 dist 폴더를 "압축해제된 확장"으로 로드해서 씀
  (확장 ID: hdepgbapmhdgdknjhoecmckmchiacjgp = C:\GitHub\power-link-extension\dist 경로에서 결정됨).
- 구조
  - src/core/background.js: 모듈 서비스워커. pl:grab / pl:collectTabs / pl:copyItems / pl:enrichAuto / pl:recentSeed / pl:recentAdd 등
  - src/core/content.js (+ src/shared/classify.js): Ctrl/Shift/Alt + 우클릭 드래그로 링크 수집(박스/올가미), shadow DOM 오버레이
  - src/sidepanel: 탭 = 수집 링크 / 최근 화면 / 키워드 / 워치리스트. 하단 일괄 메뉴(복사·새 탭·썸네일 zip·워치·북마크·엑셀·삭제)
  - src/popup, src/options, src/offscreen(클립보드, clipboardWrite 권한 필수)
  - src/shared: constants.js(DEFAULT_SETTINGS, STORAGE 키), storage.js, format.js, youtube.js(YouTube Data API v3), zip.js, util.js
  - src/ui/pl.css: 디자인 토큰(--pl-*)과 컴포넌트(.pl-*). 새 UI는 반드시 이 토큰/클래스를 재사용
  - icons/icon.svg(+16/32/48/128 png): 검정 배경 + 흰 드래그 모서리 + 형광 초록(#4CFF3F) 포인터
- 저장소: chrome.storage.sync 'pl_settings', local 'pl_links' / 'pl_recent' / 'pl_ytApiKey' / 'pl_watch'
- 유튜브 정보: API 키가 있으면 수집 직후 백그라운드에서 20개씩 위→아래 자동 조회, enrichedAt 있으면 재조회 안 함

## 작업 규칙
1. 코드 수정 → 테스트 → 버전 올리기 → CHANGELOG → 커밋 → dist 갱신 순서.
2. 버전: `bash scripts/bump.sh 2.0.10` (version, version_name, name "Power Link v<버전>" 동시 변경.
   이름은 크롬 사이드바 제목줄에 버전으로 보임). 릴리스 워크플로가 태그·이름·버전 일치를 검사함.
3. dist 갱신: `bash scripts/build.sh` 또는 PowerShell `scripts/build.ps1` → dist/ 와 release/power-link-v<버전>.zip 생성.
   끝나면 "chrome://extensions에서 Power Link 새로고침"을 안내.
4. 테스트: tests/*.mjs (Playwright). 예) `npx playwright install chromium` 후
   `node tests/verify.mjs` (드래그·팝업·사이드바 20항목), `node tests/recent.mjs`, `node tests/thumbs.mjs`,
   유튜브 API 목업 테스트는 `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tests/enrich.mjs`.
   변경 후 전체 테스트를 다시 돌려서 PASS를 확인하고 결과를 알려줘.
5. git: 커밋 후 태그 v<버전>. 아직 원격에 안 올린 것 포함해서
   `git push origin master feature/power-link-2 backup/v1.0.0 --tags` 로 푸시.
   (backup/v1.0.0 브랜치와 v1.0.0 태그는 옛 버전 복구용이므로 절대 지우거나 덮어쓰지 말 것)

## 이번에 할 일: 다른 크롬 프로필의 탭도 "최근 화면"에 보이고 이동되게
크롬 프로필은 서로 격리되어 확장만으로는 불가능 → Native Messaging 도우미로 구현.
각 단계(파일 생성, 레지스트리 등록 등)는 나에게 승인받고 진행해.

설계:
- 각 프로필에 Power Link를 같은 dist 경로로 설치 → 모든 프로필에서 확장 ID가 같음.
- 네이티브 호스트 이름 "com.powerlink.bridge", 현재 사용자(HKCU) 범위, 관리자 권한 불필요.
  - 호스트: Windows PowerShell 5.1 호환 스크립트 + .bat 런처(%LOCALAPPDATA%\PowerLink\bridge-host).
  - 프로토콜: 4바이트 길이 + UTF-8 JSON(stdin/stdout). 허용 메시지만 처리(hello / recent / command / ping),
    어떤 메시지도 프로그램 실행·임의 파일 접근을 못 하게.
  - 프로필 간 공유: %LOCALAPPDATA%\PowerLink\bridge\profile-<profileId>.json (이름, alive 타임스탬프, 최근 목록),
    명령은 cmd-<대상profileId>-<guid>.json 파일로 전달(1초 폴링). alive 30초 이내면 온라인.
  - install.bat / uninstall.bat 제공(설치·제거 모두 되돌릴 수 있게).
- 확장 쪽:
  - manifest에 "nativeMessaging" 권한 추가.
  - background: storage.local에 랜덤 profileId 생성, 설정에 "이 프로필 이름"(옵션 > 일반) 추가.
    chrome.runtime.connectNative('com.powerlink.bridge')로 연결(포트가 서비스워커를 살려 둠), 끊기면 재시도.
    hello → recent(최근 목록 변경 시 1초 디바운스로 전송) / 호스트의 'others' 메시지를 storage.local 'pl_recentOthers'에 저장.
    'command' {type:'activate', url} 받으면 열린 탭이면 tabs.update+windows.update(focused), 없으면 tabs.create.
    {type:'forget', url}이면 내 최근 목록에서 삭제.
  - 사이드바 최근 화면: 내 목록 + 다른 프로필 목록을 합쳐 표시(프로필 이름 배지, 오프라인이면 회색).
    다른 프로필 항목 클릭 → 해당 프로필에 activate 명령. 오프라인이면 현재 프로필에서 새 탭으로 열고 안내 토스트.
    삭제 버튼 → 그 프로필에 forget 명령. 수집 링크 추가는 기존 pl:recentAdd 그대로.
    검색·정렬·유튜브 썸네일은 다른 프로필 항목에도 동일 적용.
  - 도우미 미설치/연결 실패 시 최근 화면 상단에 "다른 프로필 연동: 도우미 설치 필요" 안내와 설치 방법.
- 검증: 두 개의 크롬 프로필(또는 Playwright 두 개의 persistent context + 같은 확장)로
  목록 공유, 이동(열림/닫힘), 삭제, 오프라인 처리까지 테스트하고 tests/bridge.mjs로 남겨.
- 끝나면 v2.1.0으로 올리고 CHANGELOG에 "다른 프로필 연동"과 설치 방법을 적어.
```
