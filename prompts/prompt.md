✅ antigravity 요청 프롬프트 (최종본)
목표:
브라우저(Chrome)에 열려 있는 페이지 또는 탭들의 링크 정보를 추출하여
삼성 노트, 마크다운 문서, MS Word, MS Excel에 붙여넣었을 때
"카드 형태로 예쁘게 렌더링되는" 크롬 확장 프로그램을 개발해 주세요.

====================
[기능 요구사항]
====================

A. 링크 추출 방식 선택
1) 썸네일 + 제목 + URL (default)
2) URL만

B. 추출 범위 선택
1) 현재 페이지 (default)
2) 열려 있는 탭
   - 현재 열려 있는 모든 탭 목록 표시
   - 각 탭 앞에 체크박스
   - 상단에 “전체 선택” 토글 체크박스 제공

C. 실행
- "링크 추출" 버튼 클릭 시
- A, B에서 선택한 항목을 기준으로 링크 정보 추출
- 결과를 Clipboard에 복사

====================
[링크 추출 세부 요구사항]
====================

각 링크는 아래 정보를 포함해야 함:

1) 썸네일
   - YouTube:
     - 영상 썸네일 (hqdefault 또는 maxresdefault)
   - 일반 웹사이트:
     - og:image → 없으면 대표 이미지 → 없으면 favicon → 없으면 생략

2) 제목
   - document.title
   - 반드시 클릭 가능한 URL 링크 포함

3) 출처
   - 도메인
   - 크롤링(추출) 일시 (YYYY-MM-DD HH:mm:ss, 로컬 타임존)

4) 태그
   - YouTube:
     - 영상 메타데이터의 tags (keywords)
   - 일반 사이트:
     - meta keywords → 없으면 빈 배열

====================
[붙여넣기 품질 요구사항 (매우 중요)]
====================

Clipboard에 다음 포맷을 "동시에" 복사해야 함:

1) text/html
   - 삼성 노트, MS Word에서 카드 UI 유지
   - 이미지 + 제목(하이퍼링크) + 출처 + 태그가 깨지지 않아야 함

2) text/markdown
   - 마크다운 문서에 바로 붙여넣기 가능
   - 이미지 미리보기 + 제목 링크 + 태그(#tag)

3) text/plain
   - URL 또는 제목 + URL

4) (가능하면) Excel 친화적 구조
   - 썸네일 | 제목 | URL | 출처 | 태그
   - 셀 단위 분리 가능

====================
[UI / UX 요구사항]
====================

- Docker Desktop 스타일 UI
  - 다크 톤
  - 카드형 레이아웃
  - 체크박스 + 토글 스위치
  - 명확한 Primary 버튼 (“링크 추출”)

- Popup UI 구조:
  - A. 링크 추출 선택
  - B. 추출 범위 선택
  - 탭 목록 영역 (B-2 선택 시 노출)
  - 하단 고정 액션 버튼

====================
[기술 요구사항]
====================

- Chrome Extension Manifest V3
- popup + background(service worker) + content script 구조
- chrome.tabs API 사용
- clipboard.write() API 사용
- YouTube:
  - DOM 또는 ytInitialPlayerResponse 파싱 허용
- 외부 서버 사용 금지 (완전 로컬)

====================
[결과물]
====================

1) 전체 소스 코드
2) manifest.json
3) popup UI (HTML/CSS/JS)
4) background.js
5) content script
6) README (설치 방법 + 사용 방법)

※ 실제로 삼성 노트 / Word / Excel에 붙여넣었을 때
  카드 형태로 정상 렌더링되는 것을 최우선 목표로 할 것

2️⃣ 실제 크롬 확장 베이스 코드 (동작 중심)

⚠️ 아래 코드는 “기능 구현 + 붙여넣기 품질”에 집중한 MVP
UI는 Docker Desktop 스타일로 확장 가능

📁 프로젝트 구조
link-extractor/
├─ manifest.json
├─ popup.html
├─ popup.css
├─ popup.js
├─ background.js
└─ content.js

📄 manifest.json
{
  "manifest_version": 3,
  "name": "Smart Link Extractor",
  "version": "1.0.0",
  "description": "링크를 카드 형태로 추출하여 복사",
  "permissions": ["tabs", "activeTab", "scripting", "clipboardWrite"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js"
  }
}

📄 popup.html (UI 구조)
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <h2>Link Extractor</h2>

  <section>
    <label>링크 추출</label>
    <select id="mode">
      <option value="full">썸네일 + 제목 + URL</option>
      <option value="url">URL만</option>
    </select>
  </section>

  <section>
    <label>추출 범위</label>
    <select id="scope">
      <option value="current">현재 페이지</option>
      <option value="tabs">열려있는 탭</option>
    </select>
  </section>

  <div id="tabs"></div>

  <button id="extract">링크 추출</button>

  <script src="popup.js"></script>
</body>
</html>

📄 popup.js (탭 선택 로직)
const scope = document.getElementById("scope");
const tabsDiv = document.getElementById("tabs");

scope.addEventListener("change", async () => {
  tabsDiv.innerHTML = "";

  if (scope.value === "tabs") {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      const row = document.createElement("div");
      row.innerHTML = `
        <label>
          <input type="checkbox" value="${tab.id}" checked />
          ${tab.title}
        </label>
      `;
      tabsDiv.appendChild(row);
    });
  }
});

document.getElementById("extract").onclick = async () => {
  const mode = document.getElementById("mode").value;
  const scopeVal = scope.value;

  let tabIds = [];

  if (scopeVal === "current") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabIds = [tab.id];
  } else {
    tabIds = [...tabsDiv.querySelectorAll("input:checked")].map(i => Number(i.value));
  }

  chrome.runtime.sendMessage({ mode, tabIds });
};

📄 background.js (수집 지시)
chrome.runtime.onMessage.addListener(async ({ mode, tabIds }) => {
  for (const tabId of tabIds) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPage,
      args: [mode]
    });
  }
});

function extractPage(mode) {
  const title = document.title;
  const url = location.href;
  const time = new Date().toLocaleString();
  const domain = location.hostname;

  let thumbnail =
    document.querySelector('meta[property="og:image"]')?.content || "";

  const html = `
<div style="border:1px solid #ddd;padding:10px;border-radius:8px">
  ${thumbnail ? `<img src="${thumbnail}" style="width:100%"/>` : ""}
  <h3><a href="${url}">${title}</a></h3>
  <small>${domain} · ${time}</small>
</div>`;

  navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([url], { type: "text/plain" })
    })
  ]);
}

3️⃣ 현실적인 다음 단계 (중요)

이 프로젝트는 아래 3단계를 거쳐야 완성도 올라갑니다

1️⃣ 붙여넣기 타겟별 미세 튜닝

삼성 노트 HTML 렌더링 특성

Word의 <table> 기반 렌더링

Excel 셀 분리 전략

2️⃣ YouTube 전용 파서 강화

ytInitialPlayerResponse.videoDetails.keywords

썸네일 maxres fallback

3️⃣ Docker Desktop 스타일 UI

CSS Grid

다크 테마

카드 리스트

[제약사항]

1) 크롬 확장을 여기에서 debug할 수 있게 구성
2) 스스로 기능을 테스트하고 오류를 수정할 때까지 반복 수행하여 완료
3) 테스트 결과를 문서로 만들어서 검증
4) 모든 응답과 문서는 한글로 작성
5) CONFIRM을 요청하지 말고 끝까지 스스로 수행하고 반드시 CONFIRM이 필요한 경우에는 모아서 한번에 요청

