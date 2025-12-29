document.addEventListener('DOMContentLoaded', async () => {
    const tableContainer = document.getElementById('table-container');
    const cardContainer = document.getElementById('card-container');
    const linkBody = document.getElementById('link-body');
    const cardGrid = document.getElementById('card-grid');
    const emptyState = document.getElementById('empty-state');
    const selectAll = document.getElementById('select-all');
    const deleteBtn = document.getElementById('delete-btn');
    const excelBtn = document.getElementById('excel-btn');
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');

    const tableViewBtn = document.getElementById('table-view-btn');
    const cardViewBtn = document.getElementById('card-view-btn');

    let savedLinks = [];
    let currentView = 'table';

    // 데이터 로드
    async function loadData() {
        try {
            console.info('Smart Link Extractor: Loading data from storage...');
            const data = await chrome.storage.local.get(['savedLinks', 'preferredView']);
            savedLinks = data.savedLinks || [];
            currentView = data.preferredView || 'table';

            updateViewToggle();
            renderLinks();
        } catch (err) {
            console.error('Smart Link Extractor: Failed to load storage data:', err);
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
            tr.innerHTML = `
                <td class="col-check">
                    <input type="checkbox" class="row-checkbox" value="${item.id}">
                </td>
                <td class="col-title">
                    <div class="title-container">
                        <img src="https://www.google.com/s2/favicons?domain=${item.domain}&sz=32" class="favicon" onerror="this.src='icons/icon16.png'" alt="icon">
                        <span class="title-text">${item.title || '제목 없음'}</span>
                    </div>
                </td>
                <td class="col-url"><a href="${item.url}" target="_blank">${item.url}</a></td>
            `;
            linkBody.appendChild(tr);
        });
    }

    function renderCardView() {
        cardGrid.innerHTML = '';
        savedLinks.forEach(item => {
            const div = document.createElement('div');
            div.className = 'link-card';
            div.innerHTML = `
                <input type="checkbox" class="row-checkbox card-checkbox" value="${item.id}">
                ${item.thumbnail ? `<img src="${item.thumbnail}" class="card-thumbnail" onerror="this.style.display='none'">` : ''}
                <div class="card-content">
                    <div class="card-title-row">
                        <img src="https://www.google.com/s2/favicons?domain=${item.domain}&sz=32" class="card-favicon" onerror="this.src='icons/icon16.png'">
                        <span class="card-title-text">${item.title || '제목 없음'}</span>
                    </div>
                    <a href="${item.url}" target="_blank" class="card-url">${item.url}</a>
                </div>
            `;
            cardGrid.appendChild(div);
        });
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
            console.error('Smart Link Extractor: Delete failed:', err);
            showToast('삭제 중 오류가 발생했습니다.', '❌');
        }
    });

    // 엑셀 다운로드 (HTML-based XLS for Icons)
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
                    th { background-color: #f2f2f2; font-weight: bold; border: 1px solid #dddddd; padding: 8px; }
                    td { border: 1px solid #dddddd; padding: 8px; vertical-align: middle; }
                </style>
            </head>
            <body>
                <table>
                    <thead>
                        <tr>
                            <th>아이콘 + 제목</th>
                            <th>URL</th>
                            <th>도메인</th>
                            <th>추출일시</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        savedLinks.forEach(item => {
            const iconUrl = `https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`;
            tableHtml += `
                <tr>
                    <td>
                        <img src="${iconUrl}" width="16" height="16" style="vertical-align: middle; margin-right: 8px;">
                        <span style="vertical-align: middle;">${(item.title || '제목 없음').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                    </td>
                    <td><a href="${item.url}">${item.url}</a></td>
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
        setTimeout(() => toast.classList.remove('show'), 2000);
    }

    await loadData();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.savedLinks) {
            savedLinks = changes.savedLinks.newValue || [];
            renderLinks();
        }
    });
});
