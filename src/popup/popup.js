/* =========================
   Global Variables & Init
========================== */
let toast, toastMsg;

document.addEventListener('DOMContentLoaded', () => {
  // Check if Chrome Extension API is available
  if (!chrome || !chrome.tabs || !chrome.storage) {
    const container = document.querySelector('.app-container');
    if (container) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <h2 style="color: #d93025; margin-bottom: 16px;">⚠️ 확장 프로그램 오류</h2>
          <p style="color: #5f6368; line-height: 1.6;">
            이 페이지는 Chrome 확장 프로그램으로 실행되어야 합니다.<br>
            <strong>chrome://extensions/</strong>에서 확장 프로그램을 로드한 후,<br>
            확장 프로그램 아이콘을 클릭하여 사용하세요.
          </p>
        </div>
      `;
    }
    return;
  }

  const tabsSection = document.getElementById('tabs-section');
  const tabList = document.getElementById('tab-list');
  const selectAllTabs = document.getElementById('select-all-tabs');
  const extractBtn = document.getElementById('extract-btn');
  const viewListBtn = document.getElementById('view-list-btn');

  toast = document.getElementById('toast');
  toastMsg = document.getElementById('toast-message');

  /* =========================
     Radio Button Change Events
  ========================== */
  document.querySelectorAll('input[name="scope"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const scopeValue = e.target.value;
      if (scopeValue === 'tabs' || scopeValue === 'all') {
        tabsSection.classList.remove('hidden');
        await loadTabs(tabList, scopeValue);
      } else {
        tabsSection.classList.add('hidden');
      }
    });
  });

  selectAllTabs.addEventListener('change', () => {
    document.querySelectorAll('.tab-checkbox')
      .forEach(cb => cb.checked = selectAllTabs.checked);
  });

  /* =========================
     Core Logic: Extraction
  ========================== */
  async function performExtraction() {
    const scopeValue = document.querySelector('input[name="scope"]:checked').value;
    const modeValue = document.querySelector('input[name="mode"]:checked').value;

    const targetTabs = await getTargetTabs(scopeValue);
    if (!targetTabs.length) {
      alert('탭을 선택해 주세요.');
      return null;
    }

    // 병렬 처리를 위해 Promise 배열 생성
    const extractionPromises = targetTabs.map(async (tab) => {
      const tabId = tab.id;
      const url = tab.url || '';
      const domain = new URL(url).hostname;
      let title = tab.title || '제목 없음';

      // [추가] 타이틀 정규화 (유튜브 알림 숫자 제거: (4) 제목 -> 제목)
      title = title.replace(/^\(\d+\)\s*/, '');

      const favIconUrl = tab.favIconUrl || '';

      // 기본 데이터 (Fallback용)
      let result = {
        title,
        url,
        domain,
        thumbnail: modeValue === 'full' ? favIconUrl : null,
        tabId,
        windowId: tab.windowId
      };

      // YouTube 최적화 (스크립트 실행 없이 썸네일 및 기본 채널명 생성)
      if (domain.includes('youtube.com')) {
        const urlObj = new URL(url);
        const videoId = urlObj.searchParams.get('v');
        if (videoId && modeValue === 'full') {
          result.thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }

        // [추가] 스택트립트 실행 실패 시를 대비한 기본 채널명 파싱
        if (urlObj.pathname.includes('/@')) {
          result.channel = urlObj.pathname.split('/')[1]; // @handle
        }

        // 타이틀에서 채널명 추출 시도 (예: "Title - YouTube")
        if (title.includes(' - YouTube')) {
          const parts = title.split(' - YouTube')[0].trim();
          // 만약 타이틀이 "Video / Channel" 형태라면? 유튜브는 보통 "Video Title - YouTube"
        }
      }

      // 스크립트 실행이 불가능한 특수 페이지 체크
      const isRestricted = url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('about:');

      if (isRestricted) {
        return result; // 기본 정보만 반환
      }

      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractMetadata,
          args: [modeValue]
        });
        if (res?.result) {
          // 스크립트 결과가 있으면 덮어쓰기
          return { ...res.result, tabId, windowId: tab.windowId };
        }
      } catch (err) {
        console.warn(`Power Link: Script extraction failed for ${url}. Trying Network Fallback.`, err);

        // [God Mode Fallback] 스크립트 실행 실패 시 직접 Fetch로 HTML 분석
        if (url.includes('youtube.com')) {
          try {
            const ytData = await fetchYouTubeMetadata(url);
            if (ytData.channel) {
              return { ...result, ...ytData };
            }
          } catch (fetchErr) {
            console.error('Network Fallback failed:', fetchErr);
          }
        }
      }

      return result; // 모두 실패 시 기본 fallback 반환
    });

    // 모든 프로미스를 동시에 실행 (누락 방지)
    const settleResults = await Promise.allSettled(extractionPromises);

    // 성공한 결과만 매핑 (실패한 비동기 작업은 걸러냄)
    return settleResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
  }

  /* getTargetTabs: ID뿐만 아니라 탭 객체 전체를 가져오도록 수정 */
  async function getTargetTabs(scopeValue) {
    if (scopeValue === 'current') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab ? [tab] : [];
    }

    const checkedIds = Array.from(document.querySelectorAll('.tab-checkbox:checked'))
      .map(cb => parseInt(cb.value));

    // 현재 열린 모든 탭에서 선택된 ID에 해당하는 탭 객체 필터링
    const allTabs = await chrome.tabs.query({});
    return allTabs.filter(tab => checkedIds.includes(tab.id));
  }

  /* =========================
     1️⃣ 클립보드 복사
  ========================== */
  extractBtn.addEventListener('click', async () => {
    const results = await performExtraction();
    if (!results || results.length === 0) {
      showToast('추출 가능한 링크가 없습니다.', '⚠️');
      return;
    }

    try {
      await copyToClipboard(results);
      await saveLinksToStorage(results, true); // true = overwrite for "active scope" view
      showToast(`${results.length}개의 링크가 복사되었습니다.`);
    } catch (err) {
      console.error('Action failed:', err);
      showToast('작업 중 오류가 발생했습니다.', '❌');
    }
  });

  /* =========================
     2️⃣ 링크 목록 보기 (즉시 추출)
  ========================== */
  viewListBtn.addEventListener('click', async () => {
    const results = await performExtraction();
    if (!results || results.length === 0) {
      showToast('추출 가능한 링크가 없습니다.', '⚠️');
      return;
    }

    try {
      // 프로필 정보 가져오기 시도
      let profileName = '사용자';
      try {
        if (chrome.identity && chrome.identity.getProfileUserInfo) {
          const info = await chrome.identity.getProfileUserInfo();
          if (info && info.email) profileName = info.email.split('@')[0];
        }
      } catch (e) { console.warn('Profile info fetch failed:', e); }

      // Overwrite storage for the "active scope" view
      await saveLinksToStorage(results, true, profileName);
      chrome.tabs.create({ url: chrome.runtime.getURL('src/list/list.html') });
    } catch (err) {
      console.error('Action failed:', err);
      showToast('작업 중 오류가 발생했습니다.', '❌');
    }
  });
});

/* =========================
   GOD MODE: Network Fallback for YouTube
   (Works even when executeScript is blocked)
========================= */
async function fetchYouTubeMetadata(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();

    // 1. itemprop="name" (보통 채널명 또는 타이틀)
    // 영상 페이지에서는 author itemprop를 찾아야 함
    const authorMatch = text.match(/<span itemprop="author"[^>]*>.*?<link itemprop="name" content="([^"]+)"/s) ||
      text.match(/<link itemprop="name" content="([^"]+)"[^>]*>[^<]*<\/span>[^<]*<span itemprop="author"/s) ||
      text.match(/"author":"([^"]+)"/); // Simple JSON-ish match

    let channel = authorMatch ? authorMatch[1] : null;

    // 2. ytInitialData (JSON 파싱 시도)
    if (!channel) {
      const dataMatch = text.match(/var ytInitialData = ({.*?});<\/script>/);
      if (dataMatch) {
        try {
          const data = JSON.parse(dataMatch[1]);
          channel = data.metadata?.channelMetadataRenderer?.title ||
            data.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer?.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text;
        } catch (e) { }
      }
    }

    return { channel };
  } catch (e) {
    return { channel: null };
  }
}

/* =========================
   Helper Functions (Top Level)
========================= */

async function loadTabs(container, scopeValue) {
  container.innerHTML = '';
  const queryOptions = scopeValue === 'all' ? {} : { currentWindow: true };
  const tabs = await chrome.tabs.query(queryOptions);

  tabs.forEach(tab => {
    const div = document.createElement('div');
    div.className = 'tab-item';
    div.innerHTML = `
      <label>
        <input type="checkbox" class="tab-checkbox" value="${tab.id}" checked>
        ${tab.title || tab.url}
      </label>
    `;
    container.appendChild(div);
  });
}

function showToast(message, icon = '✅') {
  if (!toast || !toastMsg) return;
  toastMsg.textContent = message;
  const iconEl = toast.querySelector('.toast-icon');
  if (iconEl) iconEl.textContent = icon;

  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

/**
 * saveLinksToStorage
 * @param {Array} newLinks 
 * @param {boolean} overwrite If true, replaces the entire list
 * @param {string} profileName Optional profile name
 */
async function saveLinksToStorage(newLinks, overwrite = false, profileName = '사용자') {
  try {
    let finalLinks = [];

    if (overwrite) {
      // Create fresh list with IDs and Timestamps
      finalLinks = newLinks.map(l => ({
        ...l,
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        createdAt: new Date().toISOString()
      }));
    } else {
      const { savedLinks = [] } = await chrome.storage.local.get('savedLinks');
      const existingUrls = new Set(savedLinks.map(l => l.url));
      const uniqueNewLinks = newLinks.filter(l => !existingUrls.has(l.url));

      if (uniqueNewLinks.length === 0) return;

      const linksWithTime = uniqueNewLinks.map(l => ({
        ...l,
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        createdAt: new Date().toISOString()
      }));
      finalLinks = [...savedLinks, ...linksWithTime];
    }

    await chrome.storage.local.set({ savedLinks: finalLinks, profileName });
    console.info(`Power Link: Saved ${finalLinks.length} links to storage.`);
  } catch (err) {
    console.error('Power Link: Storage save failed:', err);
  }
}

function extractMetadata(mode) {
  const getThumbnail = () => {
    if (window.location.hostname.includes('youtube.com')) {
      const urlParams = new URLSearchParams(window.location.search);
      const videoId = urlParams.get('v');
      if (videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
    return document.querySelector('meta[property="og:image"]')?.content ||
      document.querySelector('meta[name="twitter:image"]')?.content ||
      document.querySelector('link[rel="apple-touch-icon"]')?.href ||
      document.querySelector('link[rel="icon"]')?.href || '';
  };

  const getYouTubeChannelName = () => {
    if (!window.location.hostname.includes('youtube.com')) return null;

    // 1. 메타데이터 (가장 빠르고 확실함)
    const isChannelPage = window.location.pathname.startsWith('/@') || window.location.pathname.includes('/channel/');
    if (isChannelPage) {
      const metaTitle = document.querySelector('meta[itemprop="name"]')?.content;
      if (metaTitle) return metaTitle.trim();
    } else {
      // 영상 페이지용 메타데이터 (itemprop="author" 내의 name)
      const metaAuthor = document.querySelector('span[itemprop="author"] link[itemprop="name"]')?.getAttribute('content') ||
        document.querySelector('link[itemprop="name"]')?.closest('[itemprop="author"]')?.querySelector('link[itemprop="name"]')?.content;
      if (metaAuthor) return metaAuthor.trim();
    }

    // 2. 내부 데이터 객체 (DOM이 렌더링되기 전에도 존재함)
    try {
      const data = window.ytInitialData;
      if (data) {
        // 영상 페이지
        const videoOwner = data.contents?.twoColumnWatchNextResults?.results?.results?.contents?.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
        if (videoOwner?.title?.runs?.[0]?.text) return videoOwner.title.runs[0].text;

        // 채널 페이지
        const channelName = data.metadata?.channelMetadataRenderer?.title || data.header?.pageHeaderRenderer?.pageTitle;
        if (channelName) return channelName;
      }
    } catch (e) { }

    // 3. 기존 DOM 셀렉터 체인 (Fallback)
    const videoOwnerLink =
      document.querySelector('ytd-video-owner-renderer ytd-channel-name a') ||
      document.querySelector('#upload-info ytd-channel-name a') ||
      document.querySelector('.ytd-video-secondary-info-renderer ytd-channel-name a');

    if (videoOwnerLink && videoOwnerLink.innerText.trim()) {
      return videoOwnerLink.innerText.trim();
    }

    const channelNameH1 = document.querySelector('h1.dynamicTextViewModelH1 span.yt-core-attributed-string') ||
      document.querySelector('h1.dynamicTextViewModelH1 span') ||
      document.querySelector('yt-dynamic-header-renderer h1 span');
    if (channelNameH1 && channelNameH1.innerText.trim()) {
      return channelNameH1.innerText.trim();
    }

    const alternateChannelName =
      document.querySelector('#channel-name yt-formatted-string') ||
      document.querySelector('#inner-header-container #text') ||
      document.querySelector('ytd-channel-name#channel-name a') ||
      document.querySelector('yt-formatted-string#channel-name') ||
      document.querySelector('ytd-c4-tabbed-header-renderer #text');

    if (alternateChannelName && alternateChannelName.innerText.trim()) {
      return alternateChannelName.innerText.trim();
    }

    // 4. 최후의 수단: Title 파싱
    if (window.location.pathname.includes('/@')) {
      const title = document.title;
      if (title.includes(' - YouTube')) {
        return title.split(' - YouTube')[0].trim();
      }
    }

    return null;
  };

  const domain = window.location.hostname.replace('www.', '');
  const title = document.title;
  const url = window.location.href;
  const thumbnail = mode === 'full' ? getThumbnail() : null;
  const channel = getYouTubeChannelName();

  return { title, url, domain, thumbnail, channel };
}

async function copyToClipboard(results) {
  let html = '';
  let plain = '';

  results.forEach(item => {
    html += `
      <div class="link-card" style="display: flex; align-items: center; border: 1px solid #e0e0e0; border-radius: 16px; padding: 12px; margin-bottom: 16px; font-family: sans-serif; max-width: 600px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.08); text-decoration: none; color: inherit; overflow: hidden;">
        ${item.thumbnail ? `<div style="flex-shrink: 0; width: 100px; height: 100px; margin-right: 16px; overflow: hidden; border-radius: 12px; background-color: #f8f9fa;"><img src="${item.thumbnail}" style="width: 100%; height: 100%; object-fit: cover; display: block;"></div>` : ''}
        <div style="flex-grow: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
          <div style="margin: 0 0 6px 0; font-size: 17px; font-weight: 700; line-height: 1.4; color: #1a1a1b;"><a href="${item.url}" style="color: #0066cc; text-decoration: none;">${item.title}</a></div>
          <div style="font-size: 13px; color: #5f6368; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;"><span style="flex-shrink: 0;">🔗</span><span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.url}</span></div>
          <div style="font-size: 13px; color: #70757a; font-weight: 500;">${item.domain}</div>
        </div>
      </div>`;
    plain += `${item.title}\n${item.url}\n\n`;
  });

  const clipboardHtml = `<html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  const blobHtml = new Blob([clipboardHtml], { type: 'text/html' });
  const blobText = new Blob([plain.trim()], { type: 'text/plain' });

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
  } catch (err) {
    console.warn('ClipboardItem failed, falling back to writeText:', err);
    await navigator.clipboard.writeText(plain.trim());
  }
}
