/* =========================
   Global Variables & Init
========================== */
let toast, toastMsg;

document.addEventListener('DOMContentLoaded', () => {
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

    const tabIds = await getTargetTabIds(scopeValue);
    if (!tabIds.length) {
      alert('탭을 선택해 주세요.');
      return null;
    }

    const results = [];
    for (const tabId of tabIds) {
      if (isNaN(tabId)) continue;

      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractMetadata,
          args: [modeValue]
        });
        if (res?.result) {
          results.push(res.result);
        }
      } catch (err) {
        console.warn(`Smart Link Extractor: Failed to extract from tab ${tabId}.`, err);
      }
    }
    return results;
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
      // Overwrite storage for the "active scope" view
      await saveLinksToStorage(results, true);
      chrome.tabs.create({ url: chrome.runtime.getURL('list.html') });
    } catch (err) {
      console.error('Action failed:', err);
      showToast('작업 중 오류가 발생했습니다.', '❌');
    }
  });
});

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

async function getTargetTabIds(scopeValue) {
  if (scopeValue === 'current') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? [tab.id] : [];
  }
  return Array.from(document.querySelectorAll('.tab-checkbox:checked'))
    .map(cb => parseInt(cb.value));
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
 * @param {boolean} overwrite If true, replaces the entire list (for "active view" requirement)
 */
async function saveLinksToStorage(newLinks, overwrite = false) {
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

    await chrome.storage.local.set({ savedLinks: finalLinks });
    console.info(`Smart Link Extractor: Saved ${finalLinks.length} links to storage.`);
  } catch (err) {
    console.error('Smart Link Extractor: Storage save failed:', err);
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

  const domain = window.location.hostname;
  const title = document.title;
  const url = window.location.href;
  const thumbnail = mode === 'full' ? getThumbnail() : null;

  return { title, url, domain, thumbnail };
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
