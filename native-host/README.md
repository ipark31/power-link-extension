# Power Link — 다른 프로필 연동 도우미 (Native Messaging Host)

크롬 프로필은 서로 격리되어 있어서, 다른 프로필의 탭을 사이드바 ‘최근 화면’에
보여주고 이동시키려면 이 도우미(네이티브 메시징 호스트)가 필요합니다.

## 설치

1. 모든 크롬 프로필에 Power Link를 **같은 dist 폴더**로 설치합니다.
   (`chrome://extensions` → 압축해제된 확장 → `C:\GitHub\power-link-extension\dist`)
   → 모든 프로필에서 확장 ID가 같아집니다 (`hdepgbapmhdgdknjhoecmckmchiacjgp`).
2. 이 폴더의 `install.bat`을 더블클릭합니다. (현재 사용자 범위, 관리자 권한 불필요)
   - 다른 경로로 로드해 확장 ID가 다르면: `install.bat <확장ID>`
3. 크롬을 완전히 종료했다가 다시 시작하거나, 사이드바 ‘최근 화면’ 상단의
   **[다시 연결]** 버튼을 누릅니다.
4. 설정 › 일반 › **이 프로필 이름**에 프로필마다 알아볼 이름을 넣으면
   다른 프로필의 최근 화면 목록에 그 이름이 배지로 표시됩니다.

## 제거

`uninstall.bat` 실행 → 레지스트리 등록과 `%LOCALAPPDATA%\PowerLink` 폴더가 모두 삭제됩니다.

## 구성 요소

| 파일 | 역할 |
|---|---|
| `powerlink-bridge.ps1` | 호스트 본체 (Windows PowerShell 5.1, stdin/stdout 네이티브 메시징) |
| `host.bat` | 크롬이 실행하는 런처 |
| `install.bat` | `%LOCALAPPDATA%\PowerLink\bridge-host`에 복사 + HKCU 레지스트리 등록 |
| `uninstall.bat` | 위 내용을 모두 되돌림 |

## 동작 방식 / 보안

- 프로토콜: 4바이트 길이 + UTF-8 JSON. 허용 메시지는 `hello / recent / command / ping`뿐이고,
  어떤 메시지도 프로그램 실행이나 임의 파일 접근을 하지 못합니다.
- 프로필 간 공유: `%LOCALAPPDATA%\PowerLink\bridge\profile-<profileId>.json`
  (이름 · alive 타임스탬프 · 최근 화면 목록). alive가 30초 이내면 온라인으로 표시됩니다.
- 이동/삭제 명령은 `cmd-<대상profileId>-<guid>.json` 파일로 전달되고 1초 폴링으로 처리됩니다.
- 레지스트리는 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.powerlink.bridge` 하나만 사용합니다.
