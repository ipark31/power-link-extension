# Power Link

드래그 한 번으로 링크를 모으고, 유튜브·틱톡·인스타그램·X·블로그 링크를 카드·표로 정리하는 크리에이터용 크롬 확장 프로그램입니다.

현재 버전: **2.4.0** · 변경 내역은 [CHANGELOG.md](CHANGELOG.md)

## 설치

### 방법 1. 릴리스 zip으로 설치
1. [Releases](https://github.com/ipark31/power-link-extension/releases)에서 `power-link-v2.0.0.zip`을 받아 압축을 풉니다.
2. 크롬 주소창에 `chrome://extensions` 입력 → 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → 압축을 푼 폴더 선택

### 방법 2. 저장소 폴더를 바로 로드 (개발용)
위 2~3번에서 저장소 폴더(`manifest.json`이 있는 폴더)를 선택합니다.
코드를 바꾼 뒤에는 `chrome://extensions`에서 Power Link의 **새로고침(⟳)** 버튼을 누릅니다.

> 설치 전부터 열려 있던 탭은 한 번 새로고침해야 마우스 수집이 동작합니다.

## 사용법

| 동작 | 기본 단축키 |
|---|---|
| 박스로 선택해서 **복사** | Ctrl + 우클릭 드래그 |
| 박스로 선택해서 **새 탭으로 열기** | Shift + 우클릭 드래그 |
| 자유도형으로 둘러서 **목록에 저장** | Alt + 우클릭 드래그 |
| 드래그 취소 | Esc |
| 수집 링크 사이드바 열기 | Alt + Shift + L (또는 팝업의 ‘수집 링크’) |

- 수정 키 없이 드래그하면 아무 동작도 하지 않습니다.
- 단축키·선택 방식·동작·색상은 **설정 › 수집 규칙**에서 바꿀 수 있고, 같은 화면의 연습 영역에서 바로 시험해 볼 수 있습니다.
- 유튜브 상세 정보(조회수·구독자·롱폼/숏폼 수 등)는 **설정 › API · 연동**에 YouTube Data API v3 키를 넣으면 수집됩니다. 키는 이 컴퓨터에만 저장됩니다.
- **다른 크롬 프로필 연동** (Windows): 다른 프로필의 탭도 사이드바 ‘최근 화면’에 보이고 클릭하면 그 프로필로 이동합니다.
  모든 프로필에 같은 dist 폴더로 설치한 뒤 `native-host\install.bat`을 한 번 실행하세요 (제거는 `uninstall.bat`, 자세한 내용은 [native-host/README.md](native-host/README.md)).
  프로필 이름은 **설정 › 일반 › 이 프로필 이름**에서 정합니다.

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `manifest.json` | 확장 설정 (버전은 여기서 관리) |
| `src/core/background.js` | 서비스 워커: 수집 동작, 탭 관리, API, 워치리스트 |
| `src/core/content.js` | 웹페이지 위 드래그 수집 엔진 (박스·자유도형) |
| `src/shared/` | 분류기(`classify.js`), 저장소, 형식 변환, YouTube API, 상수 |
| `src/popup/` · `src/sidepanel/` · `src/options/` | 팝업 · 사이드바 · 설정 화면 |
| `src/offscreen/` | 클립보드 쓰기용 오프스크린 문서 |
| `src/ui/pl.css` | 디자인 시스템 (토큰 → 컴포넌트 → 유틸리티) |
| `src/ui/ui.js` | 아이콘·로고·채널 아바타·토스트·클립보드 공통 함수 |
| `src/ui/theme.js` | 밝은/어두운/기기 테마 적용 (모든 화면 공통) |
| `design/graphite/` | UI 디자인 원본 보드 |
| `native-host/` | 다른 크롬 프로필 연동 도우미 (네이티브 메시징 호스트 + install/uninstall) |
| `scripts/build.sh`, `scripts/build.ps1` | `dist/`와 설치용 zip 생성 |

## 새 버전 배포

1. `bash scripts/bump.sh 2.0.8` 로 버전을 올립니다. (`version`, `version_name`, 이름 `Power Link v2.0.8`을 함께 바꿉니다. 이름은 크롬 사이드바 제목줄에 버전으로 보입니다.)
2. `CHANGELOG.md` 맨 위에 `## [2.0.1] - 날짜` 항목을 적습니다.
3. 커밋한 뒤 태그를 만들어 올립니다.
   ```bash
   git tag -a v2.0.1 -m "Power Link 2.0.1"
   git push origin master --follow-tags
   ```
4. GitHub Actions가 zip을 만들고 [Releases](https://github.com/ipark31/power-link-extension/releases)에 올립니다. (태그와 manifest 버전이 다르면 실패하도록 막아 두었습니다.)

로컬에서 zip만 만들 때: `bash scripts/build.sh` 또는 PowerShell에서 `scripts\build.ps1`

## 이전 버전으로 되돌리기

1.x는 태그 `v1.0.0`과 브랜치 `backup/v1.0.0`으로 보존되어 있습니다.

```bash
# 1.x 코드만 잠깐 보기/설치하기
git checkout v1.0.0            # 확인 후 돌아오기: git checkout master

# master 자체를 1.x로 되돌리기 (새 커밋으로 기록되어 2.0도 다시 살릴 수 있음)
git revert --no-edit v1.0.0..master
```

## 디자인 시스템 규칙 ("Graphite", v2.2)

디자인 원본은 `design/graphite/*.dc.html`(보드 13개)입니다.

- 색은 흑·백·회색만 씁니다. 예외는 셋뿐: 유튜브 로고(빨강), 떡상 1.5배 이상(초록 숫자), 열림·온라인 초록 점.
- 굵기는 500(제목·탭·버튼)과 400(본문)만. 글꼴은 `Roboto, 'Noto Sans KR'`, 숫자는 tabular-nums.
- 색·간격은 `src/ui/pl.css`의 토큰(`--pl-*`)만 사용합니다. 테마는 `html[data-theme="light"|"dark"]`(`src/ui/theme.js`, 저장 키 `pl_theme`).
- 선택 상태는 `aria-pressed` / `aria-selected` / `aria-current` / `aria-checked`, 그 밖은 `.is-on` · `.is-selected`.
- 탭 밑줄은 `border-bottom`으로만 그립니다(`box-shadow: inset`은 배율 화면에서 탭 옆에 세로선이 번짐).
- 화면을 바꾸면 `node tests/screens.mjs`로 밝은/어두운 × 배율 1·1.25 스크린샷을 찍어 보드와 비교합니다(`tests/screens/`).
