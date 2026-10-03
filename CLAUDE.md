# Power Link — 작업 안내 (Claude Code용)

이 저장소는 **"파워링크 · 유니버셜다운로더 지속 개선"** 프로젝트의 한 축이다.
짝 프로젝트: `F:\CloudStation\GitHub\PYTHON\YoutubeDownloader\universal-downloader` (영상 다운로더 확장 + FastAPI 백엔드).

## 사용자와 일하는 규칙
- 항상 한국어로 답한다.
- 내가 직접 할 수 있는 일(파일 읽기·수정·빌드·테스트·스크린샷·git)은 사용자에게 시키지 않는다.
- UI를 바꾸면 반드시 Playwright로 실제 화면을 캡처해 **직접 보고** 확인한 뒤에만 "반영했다"고 말한다.
  (DPR 1과 1.25, 밝은/어두운 테마 모두. 확인 못 했으면 못 했다고 말한다.)
- 다른 AI(예: Codex)가 만든 결과·주장은 그대로 믿지 말고 코드·테스트·화면으로 검증한다.

## 프로젝트 개요
- Chrome MV3 확장. 크롬에는 `dist/`를 압축해제 확장으로 로드한다(확장 ID `hdepgbapmhdgdknjhoecmckmchiacjgp`는 `C:\GitHub\power-link-extension\dist` 경로에서 결정됨).
- 주요 파일
  - `src/core/background.js` — 메시지 라우터(pl:grab, pl:collectTabs, pl:copyItems, pl:enrichAuto, pl:recentSeed, pl:recentAdd …), 최근 화면 기록, 유튜브 자동 조회, 다른 프로필 연동(native messaging)
  - `src/core/content.js` + `src/shared/classify.js` — Ctrl/Shift/Alt + 우클릭 드래그로 링크 수집(박스/올가미)
  - `src/sidepanel/` (수집 링크·최근 화면·키워드·워치리스트), `src/popup/`, `src/options/`, `src/offscreen/`(클립보드, clipboardWrite 권한 필수)
  - `src/shared/` constants·storage·format·youtube(Data API v3)·zip·util
  - `src/ui/pl.css` — 디자인 토큰과 컴포넌트. 새 UI는 여기 토큰/클래스를 재사용
  - `native-host/` — 다른 크롬 프로필 연동 도우미(install.bat / uninstall.bat, PowerShell 호스트)
  - `design/graphite/*.dc.html` — 새 UI 디자인 원본(밝은/어두운 테마, 설정 포함). 구현 지시는 `prompts/redesign-vscode.md`
  - `INSTALL.html` — 배포 zip에 들어가는 설치 안내서
- 저장소 키: sync `pl_settings` / local `pl_links`, `pl_recent`, `pl_ytApiKey`, `pl_watch`

## 작업 순서
1. 수정 → `tests/*.mjs` 실행(verify·recent·thumbs·enrich·bridge 등) → UI면 스크린샷 확인
2. `bash scripts/bump.sh <버전>` (version·version_name·name "Power Link v<버전>" 동시 변경)
3. `CHANGELOG.md` 기록 → 커밋 → 태그 `v<버전>`
4. `scripts/build.ps1`(또는 `build.sh`)로 `dist/`와 `release/power-link-v<버전>.zip` 생성 → 사용자에게 "chrome://extensions에서 새로고침" 안내
5. `git push origin master feature/power-link-2 backup/v1.0.0 --tags`
   - `backup/v1.0.0` 브랜치와 `v1.0.0` 태그는 옛 버전 복구용 — 절대 지우거나 덮어쓰지 않는다.

## 알려진 함정
- 탭 밑줄을 `box-shadow: inset`으로 그리면 축소·배율 화면에서 탭 좌우에 1px 세로선이 번진다 → `border-bottom` 사용.
- 크롬 팝업 높이는 최대 600px.
- 우클릭 드래그에 반응하는 다른 확장(황금비서, Grabbit)이 켜져 있으면 빨간 선이 겹쳐 보인다 — Power Link 버그가 아님.
