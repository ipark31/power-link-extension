// Global error listener for broken images (Fix CSP violation)
window.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') {
        if (e.target.classList.contains('row-favicon') || e.target.classList.contains('card-favicon')) {
            e.target.src = '../../assets/icons/icon16.png';
        } else if (e.target.classList.contains('row-thumb') || e.target.classList.contains('card-thumbnail')) {
            e.target.style.display = 'none';
        }
    }
}, true);

document.addEventListener('DOMContentLoaded', async () => {
    const tableContainer = document.getElementById('table-container');
    const cardContainer = document.getElementById('card-container');
    const linkBody = document.getElementById('link-body');
    const cardGrid = document.getElementById('card-grid');
    const emptyState = document.getElementById('empty-state');
    const selectAll = document.getElementById('select-all');
    const deleteBtn = document.getElementById('delete-btn');
    const excelBtn = document.getElementById('excel-btn');
    const sortDomainBtn = document.getElementById('sort-domain-btn');
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');

    const tableViewBtn = document.getElementById('table-view-btn');
    const cardViewBtn = document.getElementById('card-view-btn');

    // 이벤트 리스너 등록
    if (sortDomainBtn) sortDomainBtn.addEventListener('click', handleSortTabs);

    let savedLinks = [];
    let currentView = 'table';
    let profileName = '사용자';

    // 데이터 로드
    async function loadData() {
        try {
            console.info('Power Link: Loading data from storage...');
            const data = await chrome.storage.local.get(['savedLinks', 'preferredView', 'profileName']);
            savedLinks = data.savedLinks || [];
            currentView = data.preferredView || 'table';
            profileName = data.profileName || '사용자';

            // 제목 업데이트
            const listTitle = document.getElementById('list-title');
            if (listTitle) {
                listTitle.textContent = `(${profileName}) 추출한 URL 목록`;
            }

            updateViewToggle();
            renderLinks();
        } catch (err) {
            console.error('Power Link: Failed to load storage data:', err);
            showToast('데이터를 불러오지 못했습니다.', '❌');
        }
    }

    function updateViewToggle() {
        if (currentView === 'table') {
            tableViewBtn.classList.add('active');
            cardViewBtn.classList.remove('active');
            tableContainer.classList.remove('hidden');
            cardContainer.classList.add('hidden');
        } else {
            tableViewBtn.classList.remove('active');
            cardViewBtn.classList.add('active');
            tableContainer.classList.add('hidden');
            cardContainer.classList.remove('hidden');
        }
    }

    tableViewBtn.addEventListener('click', () => {
        currentView = 'table';
        chrome.storage.local.set({ preferredView: 'table' });
        updateViewToggle();
        renderLinks();
    });

    cardViewBtn.addEventListener('click', () => {
        currentView = 'card';
        chrome.storage.local.set({ preferredView: 'card' });
        updateViewToggle();
        renderLinks();
    });

    // 테이블/카드 렌더링
    function renderLinks() {
        if (!savedLinks || savedLinks.length === 0) {
            emptyState.classList.remove('hidden');
            tableContainer.classList.add('hidden');
            cardContainer.classList.add('hidden');
            return;
        }
        emptyState.classList.add('hidden');

        if (currentView === 'table') {
            tableContainer.classList.remove('hidden');
            cardContainer.classList.add('hidden');
            renderTableView();
        } else {
            tableContainer.classList.add('hidden');
            cardContainer.classList.remove('hidden');
            renderCardView();
        }
    }

    function renderTableView() {
        linkBody.innerHTML = '';
        savedLinks.forEach(item => {
            const tr = document.createElement('tr');
            tr.setAttribute('draggable', 'true');
            tr.setAttribute('data-id', item.id);
            tr.setAttribute('data-tab-id', item.tabId);
            tr.setAttribute('data-window-id', item.windowId);

            const isYouTube = item.domain && item.domain.includes('youtube.com');
            const displayTitle = (isYouTube && item.channel) ? `(${item.channel}) ${item.title}` : (item.title || '제목 없음');

            tr.innerHTML = `
                <td class="col-check">
                    <input type="checkbox" class="row-checkbox" value="${item.id}">
                </td>
                <td class="col-thumb">
                    <div class="thumb-wrapper">
                        ${item.thumbnail ? `<img src="${item.thumbnail}" class="row-thumb">` : '<div class="no-thumb">No Image</div>'}
                    </div>
                </td>
                <td class="col-title">
                    <div class="title-cell">
                        <img src="https://www.google.com/s2/favicons?domain=${item.domain}&sz=32" class="row-favicon" alt="icon">
                        <a href="${item.url}" target="_blank" class="title-text">${displayTitle}</a>
                    </div>
                </td>
                <td class="col-window">${item.windowId || '-'}</td>
                <td class="col-actions">
                    <div class="actions-cell">
                        <button class="bookmark-btn" data-title="${item.title}" data-url="${item.url}">북마크</button>
                        <button class="row-close-btn" data-id="${item.id}" data-tab-id="${item.tabId}" title="해당 탭 닫기">✕</button>
                    </div>
                </td>
            `;

            // 복제 방지를 위해 버튼별 이벤트 리스너 개별 등록
            const bookmarkBtn = tr.querySelector('.bookmark-btn');
            bookmarkBtn.addEventListener('click', async () => {
                try {
                    await chrome.bookmarks.create({ title: item.title, url: item.url });
                    showToast('북마크가 등록되었습니다. ⭐');
                } catch (err) {
                    showToast('북마크 등록 실패', '❌');
                }
            });

            const closeBtn = tr.querySelector('.row-close-btn');
            closeBtn.addEventListener('click', async () => {
                await handleIndividualTabClose(item.id, item.tabId);
            });

            linkBody.appendChild(tr);

            // 드래그 이벤트 등록
            tr.addEventListener('dragstart', handleDragStart);
            tr.addEventListener('dragover', handleDragOver);
            tr.addEventListener('drop', handleDrop);
            tr.addEventListener('dragend', handleDragEnd);
        });
    }

    function renderCardView() {
        cardGrid.innerHTML = '';
        savedLinks.forEach(item => {
            const isYouTube = item.domain && item.domain.includes('youtube.com');
            const displayTitle = (isYouTube && item.channel) ? `(${item.channel}) ${item.title}` : (item.title || '제목 없음');

            const div = document.createElement('div');
            div.className = 'link-card';
            div.innerHTML = `
                <input type="checkbox" class="row-checkbox card-checkbox" value="${item.id}">
                ${item.thumbnail ? `<img src="${item.thumbnail}" class="card-thumbnail">` : '<div class="no-thumb-card"></div>'}
                <div class="card-content">
                    <div class="card-header">
                        <img src="https://www.google.com/s2/favicons?domain=${item.domain}&sz=32" class="card-favicon" alt="icon">
                        <a href="${item.url}" target="_blank" class="card-title">${displayTitle}</a>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="bookmark-btn" data-title="${item.title}" data-url="${item.url}">북마크</button>
                    <button class="card-close-btn" data-id="${item.id}" data-tab-id="${item.tabId}">창닫기</button>
                </div>
            `;

            const bookmarkBtn = div.querySelector('.bookmark-btn');
            bookmarkBtn.addEventListener('click', async () => {
                try {
                    await chrome.bookmarks.create({ title: item.title, url: item.url });
                    showToast('북마크가 등록되었습니다. ⭐');
                } catch (err) {
                    showToast('북마크 등록 실패', '❌');
                }
            });

            const closeBtn = div.querySelector('.card-close-btn');
            closeBtn.addEventListener('click', async () => {
                await handleIndividualTabClose(item.id, item.tabId);
            });

            cardGrid.appendChild(div);
        });
    }

    // 개별 탭 닫기 처리 함수
    async function handleIndividualTabClose(id, tabId) {
        try {
            if (tabId) {
                await chrome.tabs.remove(parseInt(tabId));
            }
            // 목록에서 제거
            savedLinks = savedLinks.filter(item => item.id !== id);
            await chrome.storage.local.set({ savedLinks });
            renderLinks();
            showToast('탭을 닫고 목록에서 제거했습니다.');
        } catch (err) {
            console.warn('Tab close failed or already closed:', err);
            // 이미 닫힌 경우에도 목록에서는 제거
            savedLinks = savedLinks.filter(item => item.id !== id);
            await chrome.storage.local.set({ savedLinks });
            renderLinks();
            showToast('이미 닫힌 탭이거나 목록에서만 제거되었습니다.', '⚠️');
        }
    }

    // 전체 선택 토글
    selectAll.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = selectAll.checked;
        });
    });

    // 삭제 기능
    deleteBtn.addEventListener('click', async () => {
        const selectedIds = Array.from(document.querySelectorAll('.row-checkbox:checked'))
            .map(cb => cb.value);

        if (selectedIds.length === 0) {
            showToast('삭제할 항목을 선택해 주세요.', '⚠️');
            return;
        }

        if (!confirm(`${selectedIds.length}개의 항목을 삭제하시겠습니까?`)) return;

        try {
            savedLinks = savedLinks.filter(item => !selectedIds.includes(item.id));
            await chrome.storage.local.set({ savedLinks });
            selectAll.checked = false;
            renderLinks();
            showToast(`${selectedIds.length}개의 항목이 삭제되었습니다.`);
        } catch (err) {
            console.error('Power Link: Delete failed:', err);
            showToast('삭제 중 오류가 발생했습니다.', '❌');
        }
    });

    // 창닫기 기능 (제거됨 - 개별 닫기로 대체)

    // 엑셀 다운로드 (HTML-based XLS)
    excelBtn.addEventListener('click', () => {
        if (savedLinks.length === 0) {
            showToast('다운로드할 데이터가 없습니다.', '⚠️');
            return;
        }

        let tableHtml = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
                <style>
                    table { border-collapse: collapse; }
                    th { background-color: #1a73e8; color: white; font-weight: bold; border: 1px solid #dadce0; padding: 8px; }
                    td { border: 1px solid #dadce0; padding: 8px; vertical-align: middle; }
                </style>
            </head>
            <body>
                <table>
                    <thead>
                        <tr>
                            <th>제목</th>
                            <th>URL</th>
                            <th>도메인</th>
                            <th>추출일시</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        savedLinks.forEach(item => {
            tableHtml += `
                <tr>
                    <td>${(item.title || '제목 없음').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                    <td>${item.url}</td>
                    <td>${item.domain}</td>
                    <td>${item.createdAt}</td>
                </tr>
            `;
        });

        tableHtml += `</tbody></table></body></html>`;

        const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.setAttribute('href', url);
        link.setAttribute('download', `links_export_${timestamp}.xls`);
        link.click();
        showToast('엑셀 파일이 생성되었습니다.');
    });

    function showToast(message, icon = '✅') {
        if (!toast || !toastMsg) return;
        toastMsg.textContent = message;
        const iconEl = toast.querySelector('.toast-icon');
        if (iconEl) iconEl.textContent = icon;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    /* =========================
       Drag & Drop: Tab Movement
    ========================== */
    let draggedRowId = null;

    function handleDragStart(e) {
        draggedRowId = this.getAttribute('data-id');
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedRowId);
    }

    function handleDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
        return false;
    }

    function handleDragEnd() {
        document.querySelectorAll('tr').forEach(tr => tr.classList.remove('dragging', 'drag-over'));
    }

    async function handleDrop(e) {
        if (e.stopPropagation) e.stopPropagation();
        this.classList.remove('drag-over');

        const targetRowId = this.getAttribute('data-id');
        if (draggedRowId === targetRowId) return;

        const draggedItem = savedLinks.find(l => l.id === draggedRowId);
        const targetItem = savedLinks.find(l => l.id === targetRowId);

        if (!draggedItem?.tabId || !targetItem?.tabId) {
            showToast('탭 정보가 없어 이동할 수 없습니다.', '⚠️');
            return;
        }

        try {
            // 대상 탭의 현재 수치를 가져와서 그 위치로 이동
            const targetTab = await chrome.tabs.get(targetItem.tabId);
            const moveProps = {
                windowId: targetTab.windowId,
                index: targetTab.index
            };

            await chrome.tabs.move(draggedItem.tabId, moveProps);

            // 데이터 순서 동기화 (선택 사항이지만 사용자 경험을 위해 목록 순서도 변경)
            const fromIdx = savedLinks.findIndex(l => l.id === draggedRowId);
            const toIdx = savedLinks.findIndex(l => l.id === targetRowId);

            const [movedItem] = savedLinks.splice(fromIdx, 1);
            savedLinks.splice(toIdx, 0, movedItem);

            // windowId 최신화
            movedItem.windowId = targetTab.windowId;

            await chrome.storage.local.set({ savedLinks });
            renderLinks();
            showToast('탭이 성공적으로 이동되었습니다. 🚚');
        } catch (err) {
            console.error('Tab move failed:', err);
            showToast('탭 이동에 실패했습니다. (창이 닫혔을 수 있습니다)', '❌');
        }
    }

    /* =========================
    Tab Sorting & Consolidation
    ========================== */

    // YouTube 채널명 추출 헬퍼
    function extractYouTubeChannel(url) {
        try {
            const u = new URL(url);
            if (!u.hostname.includes('youtube.com')) return '';

            // 1. @handle (e.g., youtube.com/@ChannelHandle)
            const handleMatch = u.pathname.match(/^\/(@[^\/]+)/);
            if (handleMatch) return handleMatch[1];

            // 2. /channel/ID
            const channelIdMatch = u.pathname.match(/^\/channel\/([^\/]+)/);
            if (channelIdMatch) return `ID:${channelIdMatch[1].slice(0, 8)}...`;

            // 3. /c/Name, /user/Name, /v/ID 등은 복잡하므로 단순 파싱
            const pathParts = u.pathname.split('/').filter(p => p);
            if (pathParts.length > 0 && ['c', 'user', 'v'].includes(pathParts[0])) {
                return pathParts[1] || '';
            }

            return ''; // 정교한 추출을 위해 기본값 제거
        } catch (e) { return ''; }
    }

    async function handleSortTabs() {
        const option = document.querySelector('input[name="sort-window-opt"]:checked')?.value || 'separate';
        showToast('탭 분석 및 정렬 중...', '⏳');

        try {
            // 1. 현재 프로필의 모든 탭 수집
            const allTabs = await chrome.tabs.query({});
            if (allTabs.length === 0) return;

            // 2. YouTube 탭 실시간 강제 추출 (Aggressive Extraction)
            const ytTabs = allTabs.filter(t => t.url && t.url.includes('youtube.com'));
            const ytChannelData = {};

            if (ytTabs.length > 0) {
                const extractionPromises = ytTabs.map(async (tab) => {
                    try {
                        const [res] = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => {
                                const getChannel = () => {
                                    // 1. 메타데이터
                                    const isChannel = window.location.pathname.startsWith('/@') || window.location.pathname.includes('/channel/');
                                    if (isChannel) {
                                        const m = document.querySelector('meta[itemprop="name"]')?.content;
                                        if (m) return m.trim();
                                    } else {
                                        const ma = document.querySelector('span[itemprop="author"] link[itemprop="name"]')?.getAttribute('content') ||
                                            document.querySelector('link[itemprop="name"]')?.closest('[itemprop="author"]')?.querySelector('link[itemprop="name"]')?.content;
                                        if (ma) return ma.trim();
                                    }

                                    // 2. ytInitialData
                                    try {
                                        const d = window.ytInitialData;
                                        if (d) {
                                            const vOwner = d.contents?.twoColumnWatchNextResults?.results?.results?.contents?.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
                                            if (vOwner?.title?.runs?.[0]?.text) return vOwner.title.runs[0].text;
                                            const cName = d.metadata?.channelMetadataRenderer?.title || d.header?.pageHeaderRenderer?.pageTitle;
                                            if (cName) return cName;
                                        }
                                    } catch (e) { }

                                    // 3. DOM 셀렉터
                                    const vOwner = document.querySelector('ytd-video-owner-renderer ytd-channel-name a') ||
                                        document.querySelector('#upload-info ytd-channel-name a') ||
                                        document.querySelector('.ytd-video-secondary-info-renderer ytd-channel-name a');
                                    if (vOwner && vOwner.innerText.trim()) return vOwner.innerText.trim();

                                    const h1 = document.querySelector('h1.dynamicTextViewModelH1 span.yt-core-attributed-string') ||
                                        document.querySelector('h1.dynamicTextViewModelH1 span') ||
                                        document.querySelector('yt-dynamic-header-renderer h1 span');
                                    if (h1 && h1.innerText.trim()) return h1.innerText.trim();

                                    const alt = document.querySelector('#channel-name yt-formatted-string') ||
                                        document.querySelector('#inner-header-container #text') ||
                                        document.querySelector('ytd-channel-name#channel-name a') ||
                                        document.querySelector('ytd-c4-tabbed-header-renderer #text');
                                    if (alt && alt.innerText.trim()) return alt.innerText.trim();

                                    if (window.location.pathname.includes('/@')) {
                                        const t = document.title;
                                        if (t.includes(' - YouTube')) return t.split(' - YouTube')[0].trim();
                                    }
                                    return null;
                                };
                                return getChannel();
                            }
                        });
                        if (res?.result) {
                            ytChannelData[tab.id] = res.result;
                        }
                    } catch (e) {
                        console.warn(`YouTube extraction failed for tab ${tab.id}:`, e);
                    }
                });
                await Promise.allSettled(extractionPromises);
            }

            // 3. 정렬을 위한 확장 데이터 구성
            const sortableItems = allTabs.map(tab => {
                const metadata = savedLinks.find(l => l.tabId === tab.id) || {};
                const urlObj = new URL(tab.url || 'about:blank');
                const ytChannelFallback = extractYouTubeChannel(tab.url);

                // [수정] 실시간 추출 데이터 > 저장된 메타데이터 > URL 파싱 순으로 채널명 결정
                const finalChannel = ytChannelData[tab.id] || metadata.channel || ytChannelFallback || '';

                // 추가: 저장된 링크 정보가 있다면 채널명 업데이트 (목록 표시를 위해)
                const linkInSaved = savedLinks.find(l => l.tabId === tab.id || (l.url === tab.url));
                if (linkInSaved && finalChannel) {
                    linkInSaved.channel = finalChannel;
                }

                return {
                    tabId: tab.id,
                    url: tab.url,
                    domain: urlObj.hostname.replace('www.', ''),
                    channel: finalChannel,
                    title: tab.title || '',
                    windowId: tab.windowId
                };
            });

            // 4. 정렬 로직: 도메인 > 채널 > 제목
            sortableItems.sort((a, b) => {
                if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);

                // 유튜브의 경우 (채널) 제목 형식의 합성 문자열로 정렬
                if (a.domain.includes('youtube.com')) {
                    const titleA = (a.channel && a.channel !== 'YouTube') ? `(${a.channel}) ${a.title}` : a.title;
                    const titleB = (b.channel && b.channel !== 'YouTube') ? `(${b.channel}) ${b.title}` : b.title;
                    return titleA.localeCompare(titleB);
                }

                if (a.channel !== b.channel) return a.channel.localeCompare(b.channel);
                return a.title.localeCompare(b.title);
            });

            // 5. savedLinks 데이터도 동일한 기준으로 동기화 정렬 (목록 표시 가독성)
            savedLinks.sort((a, b) => {
                const domA = (a.domain || '').replace('www.', '');
                const domB = (b.domain || '').replace('www.', '');
                if (domA !== domB) return domA.localeCompare(domB);

                if (domA === 'youtube.com') {
                    const titleA = (a.channel && a.channel !== 'YouTube') ? `(${a.channel}) ${a.title}` : a.title;
                    const titleB = (b.channel && b.channel !== 'YouTube') ? `(${b.channel}) ${b.title}` : b.title;
                    return titleA.localeCompare(titleB);
                }
            });

            const sortedTabIds = sortableItems.map(item => item.tabId);

            if (option === 'single') {
                // Case A: 단일 창 통합 (기존 로직)
                const newWindow = await chrome.windows.create({ focused: true });
                const firstTabInNewWin = newWindow.tabs[0];
                await chrome.tabs.move(sortedTabIds, { windowId: newWindow.id, index: -1 });
                if (firstTabInNewWin) await chrome.tabs.remove(firstTabInNewWin.id);

                // 데이터 업데이트
                savedLinks.forEach(link => {
                    if (sortedTabIds.includes(link.tabId)) link.windowId = newWindow.id;
                });
            } else {
                // Case B: 도메인별 다른 창 (사용자 요청 기본값)
                const domainGroups = {};
                sortableItems.forEach(item => {
                    if (!domainGroups[item.domain]) domainGroups[item.domain] = [];
                    domainGroups[item.domain].push(item.tabId);
                });

                for (const domain in domainGroups) {
                    const idsInDomain = domainGroups[domain];
                    const newWin = await chrome.windows.create({ focused: false });
                    const autoTab = newWin.tabs[0];
                    await chrome.tabs.move(idsInDomain, { windowId: newWin.id, index: -1 });
                    if (autoTab) await chrome.tabs.remove(autoTab.id);

                    // 데이터 업데이트
                    savedLinks.forEach(link => {
                        if (idsInDomain.includes(link.tabId)) link.windowId = newWin.id;
                    });
                }
            }

            await chrome.storage.local.set({ savedLinks });
            renderLinks();
            showToast(option === 'single' ? '단일 창으로 통합 정렬되었습니다.' : '도메인별로 창을 분할하여 정렬했습니다. ✨');
        } catch (err) {
            console.error('Advanced Sort failed:', err);
            showToast('정렬 중 오류가 발생했습니다.', '❌');
        }
    }

    await loadData();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.savedLinks) {
            savedLinks = changes.savedLinks.newValue || [];
            renderLinks();
        }
    });
});
