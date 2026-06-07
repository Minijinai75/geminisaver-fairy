// dashboard.js — 備份資料庫
const GS_VERSION = chrome.runtime.getManifest().version;
// ChangeLog v10.0.0:
//   - 新增「🔗 開啟對話」按鈕，直接跳轉到 Gemini 對話頁面
//   - 新增帳號 Email 顯示於備份卡片上
//   - 新增「依帳號篩選」功能
//   - showPreview 檢視彈窗近全螢幕 (95vw × 95vh)
//   - showPreview textarea 支援使用者拖拉調整高度 (resize:vertical)
// ChangeLog v10.1.1:
//   - 匯入備份智慧合併：同 ID 自動保留 rawContent 較長版本，同長時保留較新的

const STORAGE_CLIPBOARD = "gemini_clipboard_data";
const STORAGE_PROMPT = "gemini_custom_prompt_setting";
const SEPARATOR = "\n\n---\n\n";
const PAGE_SIZE = 20; // ★ 每頁顯示筆數 ★

// ★ 舊格式轉換工具 (向後相容 - 強化版) ★
function migrateOldSeparator(content) {
    if (!content) return content;
    if (content.includes("--------------------")) {
        content = content.replace(/\n{1,4}-{20,}\n{1,4}/g, SEPARATOR);
    }
    content = content.replace(/\n{3,}-{3,19}\n{3,}/g, SEPARATOR);
    return content;
}

// ★ HTML 跳脫函數 (防 XSS) ★
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    // ★ 動態注入版本號 ★
    const dashVerEl = document.getElementById('gs-dash-ver');
    if (dashVerEl) dashVerEl.textContent = 'v' + GS_VERSION;
    document.title = `GeminiSaver Fairy 對話備份庫 v${GS_VERSION}`;

    const searchInput = document.getElementById('search');
    const sortSelect = document.getElementById('sortSelect');
    const listContainer = document.getElementById('backup-list');
    const statsContainer = document.getElementById('storage-stats');
    let allBackups = [];
    let _dashGeneralToastEnabled = true;
    let _dashErrorToastEnabled = true;

    chrome.storage.local.get(['gs_general_toast_enabled', 'gs_error_toast_enabled'], (result) => {
        _dashGeneralToastEnabled = result['gs_general_toast_enabled'] !== false;
        _dashErrorToastEnabled = result['gs_error_toast_enabled'] !== false;
    });

    // ★★★ Settings 快取層（localStorage → chrome.storage.local 遷移）★★★
    const _SETTINGS_KEYS = [STORAGE_CLIPBOARD, STORAGE_PROMPT];
    const _cache = {};
    function _getSetting(key) { return _cache[key] !== undefined ? _cache[key] : null; }
    function _setSetting(key, val) { _cache[key] = val; chrome.storage.local.set({ [key]: val }); }
    function _preloadSettings(callback) {
        // 延遲載入的 key（分類、鎖定）在 showClipboardManager 裡才用到
        const allKeys = [STORAGE_CLIPBOARD, STORAGE_PROMPT, 'gemini_vault_categories', 'gemini_vault_locks'];
        chrome.storage.local.get(allKeys, (result) => {
            // ★ 自動遷移：如果 chrome.storage 沒有資料但 localStorage 有 → 搬過來 ★
            const migrated = {};
            allKeys.forEach(key => {
                if (result[key] !== undefined) {
                    _cache[key] = result[key];
                } else {
                    const old = localStorage.getItem(key);
                    if (old !== null) {
                        _cache[key] = old;
                        migrated[key] = old;
                        localStorage.removeItem(key); // 搬完清除
                    }
                }
            });
            if (Object.keys(migrated).length > 0) {
                chrome.storage.local.set(migrated, () => {
                    console.log('[GeminiSaver] 已從 localStorage 遷移設定:', Object.keys(migrated));
                });
            }
            callback();
        });
    }

    // ★★★ 色票設定 (夢幻獨角獸風) ★★★
    const COLORS = {
        setting: "#E8A4C9",
        wish: "#FFB7C5",
        close: "#C8BFD4",
        view: "#A7C7E7",
        dl: "#A7C7E7",
        magic: "#E8A4C9",
        delete: "#F5A8A8",
        slice: "#FFCBA4",
        zip: "#FFCBA4",
        select: "#B4E7CE",
        clipboard: "#A7C7E7",
        textDark: "#3D3350",
        textLight: "#F0E8F8"
    };

    function createBtn(text, color) {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.cssText = `background:${color}; color:${COLORS.textDark}; border:none; padding:8px 15px; border-radius:20px; cursor:pointer; font-size:14px; box-shadow:0 3px 0px rgba(0,0,0,0.15); font-weight:bold; transition:transform 0.1s; white-space:nowrap;`;
        btn.onmousedown = () => btn.style.transform = "translateY(3px)";
        btn.onmouseup = () => btn.style.transform = "translateY(0)";
        btn.onmouseleave = () => btn.style.transform = "translateY(0)";
        return btn;
    }

    function isErrorToast(msg, options = {}) {
        if (options.level === 'error') return true;
        return /^❌/.test(msg) || msg.includes('錯誤') || msg.includes('失敗');
    }

    function showToast(msg, options = {}) {
        if (isErrorToast(msg, options)) {
            if (!_dashErrorToastEnabled) return;
        } else {
            if (!_dashGeneralToastEnabled) return;
        }

        let toast = document.getElementById('toast-msg');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast-msg';
            toast.style.cssText = `position:fixed; top:12px; left:50%; right:auto; transform:translateX(-50%); background:rgba(0,0,0,0.82); color:white; padding:8px 12px; border-radius:12px; font-size:13px; line-height:1.2; z-index:10001; transition:opacity 0.25s; font-weight:bold; box-shadow:0 2px 10px rgba(0,0,0,0.25); pointer-events:none;`;
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.opacity = 1;
        setTimeout(() => toast.style.opacity = 0, 2000);
    }

    function formatContent(item) {
        const bName = item.botName || "Gemini";
        const dUrl = item.url || "https://gemini.google.com/";
        let safeContent = item.rawContent || "";
        if (bName !== "Gemini" && safeContent.includes("Gemini(GEMINI)：")) {
            safeContent = safeContent.replaceAll("Gemini(GEMINI)：", `${bName}(GEMINI)：`);
        }
        return `${bName}-${item.title}\n網址：${dUrl}\n最後更新時間 ${item.lastUpdated}\n---\n${safeContent}`;
    }

    // ★★★ 載入備份 (★ 懶載入：不載入 rawContent ★) ★★★
    function loadBackups() {
        chrome.storage.local.get(null, (items) => {
            allBackups = Object.keys(items)
                .filter(k => k.startsWith('backup_'))
                .map(key => {
                    const item = items[key];
                    // ★ 懶載入：列表只存 metadata，不存 rawContent ★
                    const { rawContent, ...metadata } = item;
                    return {
                        ...metadata,
                        key: key,
                        _hasContent: !!rawContent,
                        _isSkeleton: !rawContent || rawContent.trim() === '(掃描匯入 - 尚未備份內容)',
                        // ★ 向後相容：合成 displayTitle ★
                        displayTitle: `${item.botName || 'Gemini'}-${item.title || 'Untitled'}`
                    };
                });

            allBackups.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            updateStats();
            buildGemFilter();
            buildAccountFilter(); // ★ v10.0.0 ★
            buildSkeletonFilter(); // ★ v10.0.1: 待備份篩選 ★
            renderList();
        });
    }

    // ★★★ 儲存空間統計 ★★★
    function updateStats() {
        chrome.storage.local.getBytesInUse(null, (bytes) => {
            const mb = (bytes / (1024 * 1024)).toFixed(2);
            const backupCount = allBackups.length;
            // Chrome 限制 ~10MB (local) 或 unlimitedStorage
            statsContainer.innerHTML = `💾 已使用 ${mb} MB | 📊 共 ${backupCount} 筆備份 | <span style="color:#B4E7CE;">unlimitedStorage</span>`;
        });
    }

    // ★★★ Gem 分組篩選 ★★★
    let currentGroupFilter = '全部';
    let gemFilterContainer = null;

    function buildGemFilter() {
        // 統計各 Gem 的備份數量
        const gemCounts = {};
        allBackups.forEach(d => {
            const name = d.botName || 'Gemini';
            gemCounts[name] = (gemCounts[name] || 0) + 1;
        });
        const gemNames = Object.keys(gemCounts).sort();

        // 只有 2 種以上的 Gem 時才顯示
        if (gemNames.length < 2) {
            if (gemFilterContainer) gemFilterContainer.style.display = 'none';
            return;
        }

        if (!gemFilterContainer) {
            gemFilterContainer = document.createElement('div');
            gemFilterContainer.style.cssText = "display:flex; gap:8px; align-items:center; margin-bottom:15px; padding:10px 12px; background:var(--color-card,#2a2a3a); border-radius:10px;";
            // 插入到搜尋列後面
            const container = document.querySelector('.container');
            const searchSection = searchInput.parentElement;
            container.insertBefore(gemFilterContainer, searchSection.nextSibling);
        }

        gemFilterContainer.innerHTML = '';
        gemFilterContainer.style.display = 'flex';

        const groupLabel = document.createElement('span');
        groupLabel.style.cssText = "font-size:12px; color:#aaa; white-space:nowrap;";
        groupLabel.textContent = '🏷️ 篩選 Gem：';

        const groupSelect = document.createElement('select');
        groupSelect.style.cssText = `flex:1; padding:6px 10px; border-radius:8px; border:1px solid #555; background:#2f3640; color:#fff; font-size:13px; outline:none; cursor:pointer;`;

        const allOption = document.createElement('option');
        allOption.value = '全部';
        allOption.textContent = `全部 (${allBackups.length} 筆)`;
        groupSelect.appendChild(allOption);

        gemNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = `${name} (${gemCounts[name]} 筆)`;
            if (name === currentGroupFilter) opt.selected = true;
            groupSelect.appendChild(opt);
        });

        groupSelect.onchange = () => {
            currentGroupFilter = groupSelect.value;
            renderList();
        };

        gemFilterContainer.appendChild(groupLabel);
        gemFilterContainer.appendChild(groupSelect);
    }

    // ★★★ v10.0.0: 帳號篩選 ★★★
    let currentAccountFilter = '全部';
    let accountFilterContainer = null;

    function buildAccountFilter() {
        const accountCounts = {};
        allBackups.forEach(d => {
            const email = d.accountEmail || '未知帳號';
            accountCounts[email] = (accountCounts[email] || 0) + 1;
        });
        const accounts = Object.keys(accountCounts).sort();

        // 只有 2 種以上的帳號時才顯示
        if (accounts.length < 2 || (accounts.length === 1 && accounts[0] === '未知帳號')) {
            if (accountFilterContainer) accountFilterContainer.style.display = 'none';
            return;
        }

        if (!accountFilterContainer) {
            accountFilterContainer = document.createElement('div');
            accountFilterContainer.style.cssText = "display:flex; gap:8px; align-items:center; margin-bottom:15px; padding:10px 12px; background:var(--color-card,#2a2a3a); border-radius:10px;";
            const container = document.querySelector('.container');
            const searchSection = searchInput.parentElement;
            // 插入到 Gem 篩選後面
            const insertAfter = gemFilterContainer || searchSection;
            container.insertBefore(accountFilterContainer, insertAfter.nextSibling);
        }

        accountFilterContainer.innerHTML = '';
        accountFilterContainer.style.display = 'flex';

        const label = document.createElement('span');
        label.style.cssText = "font-size:12px; color:#aaa; white-space:nowrap;";
        label.textContent = '📧 篩選帳號：';

        const select = document.createElement('select');
        select.style.cssText = 'flex:1; padding:6px 10px; border-radius:8px; border:1px solid #555; background:#2f3640; color:#fff; font-size:13px; outline:none; cursor:pointer;';

        const allOpt = document.createElement('option');
        allOpt.value = '全部';
        allOpt.textContent = `全部 (${allBackups.length} 筆)`;
        select.appendChild(allOpt);

        accounts.forEach(email => {
            const opt = document.createElement('option');
            opt.value = email;
            opt.textContent = `${email} (${accountCounts[email]} 筆)`;
            if (email === currentAccountFilter) opt.selected = true;
            select.appendChild(opt);
        });

        select.onchange = () => {
            currentAccountFilter = select.value;
            renderList();
        };

        accountFilterContainer.appendChild(label);
        accountFilterContainer.appendChild(select);
    }

    // ★★★ v10.0.1: 待備份篩選 ★★★
    let showOnlySkeleton = false;
    let skeletonFilterContainer = null;

    function buildSkeletonFilter() {
        const skeletonCount = allBackups.filter(d => d._isSkeleton).length;
        if (skeletonCount === 0) {
            if (skeletonFilterContainer) skeletonFilterContainer.style.display = 'none';
            return;
        }

        if (!skeletonFilterContainer) {
            skeletonFilterContainer = document.createElement('div');
            skeletonFilterContainer.style.cssText = "display:flex; gap:8px; align-items:center; margin-bottom:15px; padding:10px 12px; background:var(--color-card,#2a2a3a); border-radius:10px;";
            const container = document.querySelector('.container');
            const insertAfter = accountFilterContainer || gemFilterContainer || searchInput.parentElement;
            container.insertBefore(skeletonFilterContainer, insertAfter.nextSibling);
        }

        skeletonFilterContainer.innerHTML = '';
        skeletonFilterContainer.style.display = 'flex';

        const label = document.createElement('label');
        label.style.cssText = "display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; color:#F5A8A8; user-select:none;";

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = showOnlySkeleton;
        checkbox.style.cssText = "width:16px; height:16px; cursor:pointer;";
        checkbox.onchange = () => {
            showOnlySkeleton = checkbox.checked;
            currentPage = 1;
            renderList();
        };

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(`⚠️ 只顯示待備份對話 (${skeletonCount} 筆)`));

        skeletonFilterContainer.appendChild(label);
    }

    // ★★★ 分頁狀態 ★★★
    let currentPage = 1;
    let currentSortField = 'time';
    let currentSortOrder = 'desc';

    // ★★★ 排序 ★★★
    function sortBackups() {
        allBackups.sort((a, b) => {
            if (currentSortField === 'time') {
                return currentSortOrder === 'desc' ? (b.timestamp || 0) - (a.timestamp || 0) : (a.timestamp || 0) - (b.timestamp || 0);
            } else {
                const titleA = (a.displayTitle || '').toLowerCase();
                const titleB = (b.displayTitle || '').toLowerCase();
                return currentSortOrder === 'asc' ? titleA.localeCompare(titleB) : titleB.localeCompare(titleA);
            }
        });
        renderList();
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const val = sortSelect.value;
            if (val === 'time-desc') { currentSortField = 'time'; currentSortOrder = 'desc'; }
            else if (val === 'time-asc') { currentSortField = 'time'; currentSortOrder = 'asc'; }
            else if (val === 'title-asc') { currentSortField = 'title'; currentSortOrder = 'asc'; }
            else if (val === 'title-desc') { currentSortField = 'title'; currentSortOrder = 'desc'; }
            sortBackups();
        });
    }

    // ★★★ 主渲染函數 (含分頁 + Gem 篩選) ★★★
    function renderList() {
        listContainer.innerHTML = '';
        const filterText = searchInput ? searchInput.value.toLowerCase() : '';

        // ★ 篩選 ★
        const filteredData = allBackups.filter(data => {
            const bName = data.botName || "Gemini";
            const displayTitle = data.displayTitle || `${bName}-${data.title}`;
            // ★ Gem 分組篩選 ★
            if (currentGroupFilter !== '全部' && bName !== currentGroupFilter) return false;
            // ★ v10.0.0: 帳號篩選 ★
            if (currentAccountFilter !== '全部') {
                const email = data.accountEmail || '未知帳號';
                if (email !== currentAccountFilter) return false;
            }
            // ★ v10.0.1: 待備份篩選 ★
            if (showOnlySkeleton && !data._isSkeleton) return false;
            // ★ 搜尋關鍵字 ★
            return displayTitle.toLowerCase().includes(filterText);
        });

        if (filteredData.length === 0) {
            listContainer.innerHTML = '<p style="color:#888; text-align:center;">沒有找到符合的備份紀錄。</p>';
            updatePagination(0, 0);
            return;
        }

        // ★★★ 分頁計算 ★★★
        const totalItems = filteredData.length;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, totalItems);
        const pageData = filteredData.slice(startIndex, endIndex);

        pageData.forEach(data => {
            const card = createBackupCard(data);
            listContainer.appendChild(card);
        });

        updatePagination(totalItems, totalPages);
    }

    // ★★★ 分頁 UI ★★★
    function updatePagination(totalItems, totalPages) {
        let paginationEl = document.getElementById('pagination-container');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'pagination-container';
            paginationEl.style.cssText = "display:flex; justify-content:center; align-items:center; gap:15px; margin-top:20px; padding:15px; background:var(--color-card, #2a2a3a); border-radius:10px;";
            listContainer.parentElement.appendChild(paginationEl);
        }
        paginationEl.innerHTML = '';

        if (totalPages > 1) {
            const prevBtn = createBtn("◀ 上一頁", currentPage > 1 ? COLORS.dl : "#555");
            prevBtn.style.cssText += "padding:8px 15px; font-size:13px;";
            prevBtn.disabled = currentPage <= 1;
            prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderList(); } };

            const pageInfo = document.createElement('span');
            pageInfo.style.cssText = "color:#fff; font-size:14px; font-weight:bold;";
            pageInfo.textContent = `第 ${currentPage} / ${totalPages} 頁 (共 ${totalItems} 筆)`;

            const nextBtn = createBtn("下一頁 ▶", currentPage < totalPages ? COLORS.dl : "#555");
            nextBtn.style.cssText += "padding:8px 15px; font-size:13px;";
            nextBtn.disabled = currentPage >= totalPages;
            nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; renderList(); } };

            paginationEl.appendChild(prevBtn);
            paginationEl.appendChild(pageInfo);
            paginationEl.appendChild(nextBtn);
        } else if (totalItems > 0) {
            const pageInfo = document.createElement('span');
            pageInfo.style.cssText = "color:#888; font-size:13px;";
            pageInfo.textContent = `共 ${totalItems} 筆備份`;
            paginationEl.appendChild(pageInfo);
        }
    }

    // ★★★ 建立備份卡片 ★★★
    function createBackupCard(data) {
        const bName = data.botName || "Gemini";
        const displayTitle = data.displayTitle || `${bName}-${data.title}`;

        const card = document.createElement('div');
        card.className = 'backup-card';

        const rowContainer = document.createElement('div');
        rowContainer.style.cssText = "display:flex; align-items:center; gap:10px;";

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = "checkbox";
        checkbox.className = "backup-checkbox";
        checkbox.value = data.key;
        checkbox.style.cssText = "width:18px; height:18px; cursor:pointer; flex-shrink:0;";
        rowContainer.appendChild(checkbox);

        // Content area
        const contentArea = document.createElement('div');
        contentArea.style.cssText = "flex:1;";

        const titleDiv = document.createElement('div');
        titleDiv.className = 'backup-title';
        titleDiv.textContent = displayTitle;
        // ★ v10.0.1: skeleton 備份視覺標記 ★
        if (data._isSkeleton) {
            titleDiv.textContent = '⚠️ ' + displayTitle;
            titleDiv.style.color = '#F5A8A8';
        }

        const infoDiv = document.createElement('div');
        infoDiv.className = 'backup-info';
        // ★ v10.0.0: 顯示帳號 Email + Chat Link ★
        let infoHtml = `ID: ${escapeHtml(data.id)} <br> 更新: ${escapeHtml(data.lastUpdated)}`;
        if (data.accountEmail) {
            infoHtml += ` <br>📧 ${escapeHtml(data.accountEmail)}`;
        } else {
            infoHtml += ` <br><span style="color:#F5A8A8;">📧 未知帳號</span>`;
        }
        infoDiv.innerHTML = infoHtml;

        const btnArea = document.createElement('div');
        btnArea.style.cssText = "border-top:1px solid #444; padding-top:10px; margin-top:10px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;";

        // 按鈕列
        const viewBtn = createBtn("👁️ 檢視", COLORS.view);
        viewBtn.style.cssText += "padding:6px 10px; font-size:12px;";
        viewBtn.onclick = () => showPreview(data);

        // ★ v10.2.0: 對話回顧器按鈕 ★
        const replayBtn = createBtn("💬 回顧", "#c4b5fd");
        replayBtn.style.cssText += "padding:6px 10px; font-size:12px;";
        if (data._isSkeleton) {
            replayBtn.style.opacity = "0.4";
            replayBtn.style.cursor = "not-allowed";
            replayBtn.title = "⚠️ 尚未備份內容，無法回顧";
        } else {
            replayBtn.onclick = () => {
                const viewerUrl = chrome.runtime.getURL('viewer.html') + '?id=' + data.id;
                chrome.tabs.create({ url: viewerUrl });
            };
        }

        const dlBtn = createBtn("⬇️下載TXT檔", COLORS.dl);
        dlBtn.style.cssText += "padding:6px 10px; font-size:12px;";
        dlBtn.onclick = () => downloadBackup(data);

        const mdBtn = createBtn("📝下載MD檔", "#66D9A0");
        mdBtn.style.cssText += "padding:6px 10px; font-size:12px;";
        mdBtn.onclick = () => downloadMarkdown(data);

        // ★ v10.0.0: 開啟對話按鈕 ★
        const chatLinkBtn = createBtn("🔗開啟對話", "#B4E7CE");
        chatLinkBtn.style.cssText += "padding:6px 10px; font-size:12px;";
        chatLinkBtn.onclick = () => {
            const link = data.chatLink || data.url || `https://gemini.google.com/app/${data.id}`;
            chrome.tabs.create({ url: link });
        };

        // ★ 手動指定帳號 ★
        const assignAcctBtn = createBtn("📧指定帳號", COLORS.setting);
        assignAcctBtn.style.cssText += "padding:6px 10px; font-size:12px;";
        assignAcctBtn.onclick = () => {
            const currentEmail = data.accountEmail || '';
            // 收集所有已知帳號供使用者選擇
            const knownAccounts = [...new Set(allBackups.map(b => b.accountEmail).filter(e => e && e !== '未知帳號'))];
            let promptMsg = '請輸入要歸入的帳號 Email：';
            if (knownAccounts.length > 0) {
                promptMsg += '\n\n已知帳號：\n' + knownAccounts.map((e, i) => `  ${i + 1}. ${e}`).join('\n');
                promptMsg += '\n\n（可直接輸入數字選擇，或輸入完整 Email）';
            }
            const input = prompt(promptMsg, currentEmail);
            if (!input || !input.trim()) return;
            let newEmail = input.trim();
            // 如果輸入的是數字，對應到已知帳號
            const num = parseInt(newEmail);
            if (!isNaN(num) && num >= 1 && num <= knownAccounts.length) {
                newEmail = knownAccounts[num - 1];
            }
            // 更新 storage
            chrome.storage.local.get(data.key, (result) => {
                const fullData = result[data.key];
                if (!fullData) return;
                fullData.accountEmail = newEmail;
                chrome.storage.local.set({ [data.key]: fullData }, () => {
                    data.accountEmail = newEmail;
                    showToast(`📧 已歸入 ${newEmail}`);
                    loadBackups(); // 重新載入以刷新篩選
                });
            });
        };

        const delBtn = createBtn("🗑️刪除對話", COLORS.delete);
        delBtn.style.cssText += "padding:6px 10px; font-size:12px;";
        delBtn.onclick = () => {
            if (confirm(`確定刪除「${displayTitle}」？`)) {
                chrome.storage.local.remove(data.key, () => {
                    allBackups = allBackups.filter(d => d.key !== data.key);
                    showToast('🗑️ 已刪除');
                    renderList();
                    updateStats();
                });
            }
        };

        btnArea.appendChild(viewBtn);
        btnArea.appendChild(replayBtn);
        btnArea.appendChild(dlBtn);
        btnArea.appendChild(mdBtn);
        btnArea.appendChild(chatLinkBtn);
        btnArea.appendChild(assignAcctBtn);
        btnArea.appendChild(delBtn);

        contentArea.appendChild(titleDiv);
        contentArea.appendChild(infoDiv);
        contentArea.appendChild(btnArea);
        rowContainer.appendChild(contentArea);
        card.appendChild(rowContainer);

        return card;
    }

    // ★★★ 檢視預覽 (懶載入 rawContent) ★★★
    function showPreview(data) {
        // ★ 懶載入：從 storage 讀取完整資料 ★
        chrome.storage.local.get(data.key, (result) => {
            const fullData = result[data.key];
            if (!fullData || !fullData.rawContent || fullData.rawContent.trim() === '(掃描匯入 - 尚未備份內容)') {
                // ★ 僅有標題+連結的對話：顯示友善提示 ★
                const overlay = createOverlay();
                const modal = document.createElement('div');
                modal.style.cssText = `background:#1e272e; color:white; border-radius:15px; padding:30px; width:420px; max-width:90vw; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.5);`;
                modal.innerHTML = `
                    <h3 style="margin:0 0 15px; font-size:18px;">📋 ${escapeHtml((fullData?.botName || 'Gemini') + '-' + (fullData?.title || data.title || '未知'))}</h3>
                    <p style="color:#FFB7C5; font-size:14px; line-height:1.8; margin:0 0 8px;">⚠️ 此對話僅備份標題連結，尚未備份實際內容。</p>
                    <p style="color:#c0c0d0; font-size:13px; line-height:1.7; margin:0 0 20px;">請先在 Gemini 中開啟此對話，<br>然後點選收納盒上方的 🔄 按鈕觸發刷新讀取備份對話內容。<br>備份完成後即可在此檢視。</p>
                `;
                const openBtn = createBtn('🔗 前往開啟對話', '#B4E7CE');
                openBtn.onclick = () => {
                    const link = fullData?.chatLink || fullData?.url || `https://gemini.google.com/app/${fullData?.id || data.id}`;
                    chrome.tabs.create({ url: link });
                    overlay.remove();
                };
                const closeBtn = createBtn('關閉', COLORS.close);
                closeBtn.style.marginLeft = '10px';
                closeBtn.onclick = () => overlay.remove();
                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display:flex; justify-content:center; gap:10px;';
                btnRow.append(openBtn, closeBtn);
                modal.appendChild(btnRow);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                return;
            }


            const bName = fullData.botName || "Gemini";
            const migratedContent = migrateOldSeparator(fullData.rawContent);
            let rawUnits = migratedContent.split(SEPARATOR).filter(u => u.trim() !== "");
            const totalUnits = rawUnits.length;

            const overlay = createOverlay();

            const modal = document.createElement('div');
            modal.style.cssText = `background:#1e272e; color:white; border-radius:15px; padding:25px; width:95%; max-width:95vw; max-height:95vh; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.5);`;

            const header = document.createElement('div');
            header.style.cssText = "margin-bottom:15px; display:flex; flex-direction:column; gap:10px;";

            const titleH = document.createElement('h3');
            titleH.style.cssText = "margin:0; font-size:18px; border-bottom:1px solid #444; padding-bottom:10px;";
            titleH.textContent = `${bName}-${fullData.title} (共 ${totalUnits} 組對話)`;
            header.appendChild(titleH);

            const hintP = document.createElement('p');
            hintP.style.cssText = "margin:0; font-size:11px; color:#888;";
            hintP.textContent = "💡 一組對話 = 你的問題 + Gemini 的回覆";
            header.appendChild(hintP);

            // 按鈕區
            const btnRow = document.createElement('div');
            btnRow.style.cssText = "display:flex; gap:8px; flex-wrap:wrap;";

            let onlyConversation = fullData.rawContent;
            if (bName !== "Gemini" && onlyConversation.includes("Gemini(GEMINI)：")) {
                onlyConversation = onlyConversation.replaceAll("Gemini(GEMINI)：", `${bName}(GEMINI)：`);
            }

            const cpBtn = createBtn("📋 全文複製", COLORS.view);
            cpBtn.onclick = () => copyToClipboard(onlyConversation, cpBtn, COLORS.view);

            const cpCmdBtn = createBtn("✨ 全文(含指令)", COLORS.magic);
            cpCmdBtn.onclick = () => {
                const p = _getSetting(STORAGE_PROMPT) || "";
                if (!p) return alert("請先設定指令！");
                copyToClipboard(`${p}\n\n---\n\n${onlyConversation}`, cpCmdBtn, COLORS.magic);
            };

            const closeBtn2 = createBtn("關閉", COLORS.close);
            closeBtn2.style.marginLeft = "auto";
            closeBtn2.onclick = () => overlay.remove();

            btnRow.append(cpBtn, cpCmdBtn, closeBtn2);
            header.appendChild(btnRow);

            // ★ 切割區 ★
            const rangeContainer = document.createElement('div');
            rangeContainer.style.cssText = "display:flex; gap:8px; align-items:center; background:#2f3640; padding:10px; border-radius:10px; border:1px solid #444; flex-wrap:wrap;";

            const sInput = document.createElement('input');
            sInput.type = "number"; sInput.value = 1;
            sInput.style.cssText = "width:50px; padding:5px; text-align:center; border-radius:5px; border:none; font-size:13px;";

            const eInput = document.createElement('input');
            eInput.type = "number"; eInput.value = Math.min(20, totalUnits);
            eInput.style.cssText = "width:50px; padding:5px; text-align:center; border-radius:5px; border:none; font-size:13px;";

            const sliceBtn = createBtn("✂️ 複製", COLORS.slice);
            sliceBtn.style.cssText += "padding:6px 10px; font-size:12px;";
            sliceBtn.onclick = () => {
                const s = parseInt(sInput.value), e = parseInt(eInput.value);
                if (s < 1 || e > totalUnits || s > e) return alert("範圍無效");
                const sliceText = rawUnits.slice(s - 1, e).join(SEPARATOR);
                const p = _getSetting(STORAGE_PROMPT) || "";
                copyToClipboard(`${p}\n\n[片段 ${s}-${e}]\n---\n\n${sliceText}`, sliceBtn, COLORS.slice);
            };

            const sliceDlBtn = createBtn("📥 下載", COLORS.dl);
            sliceDlBtn.style.cssText += "padding:6px 10px; font-size:12px;";
            sliceDlBtn.onclick = () => {
                const s = parseInt(sInput.value), e = parseInt(eInput.value);
                if (s < 1 || e > totalUnits || s > e) return alert("範圍無效");
                const sliceText = rawUnits.slice(s - 1, e).join(SEPARATOR);
                const p = _getSetting(STORAGE_PROMPT) || "";
                const content = `${p}\n\n[片段 ${s}-${e}]\n---\n\n${sliceText}`;
                const safeTitle = fullData.title.replace(/[<>:"/\\|?*]/g, '_');
                const fileName = `${bName}-${safeTitle}_片段${s}-${e}`;
                downloadFile(`${fileName}.txt`, '\uFEFF' + content, 'text/plain;charset=utf-8');
            };

            const sliceLabel = document.createElement('span');
            sliceLabel.style.cssText = "font-size:12px; font-weight:bold; color:white;";
            sliceLabel.textContent = "✂️ 切割：";
            rangeContainer.appendChild(sliceLabel);
            rangeContainer.append(sInput, document.createTextNode(" ~ "), eInput, sliceBtn, sliceDlBtn);
            header.appendChild(rangeContainer);

            // 內容區
            const textArea = document.createElement('textarea');
            textArea.readOnly = true;
            textArea.value = formatContent(fullData);
            textArea.style.cssText = `flex:1; width:100%; background:#2f3640; color:#dfe6e9; border:2px solid #444; padding:20px; font-family:monospace; font-size:16px; resize:vertical; border-radius:12px; outline:none; box-sizing:border-box; line-height:1.7; min-height:50vh;`;

            modal.append(header, textArea);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        });
    }

    // ★★★ Markdown 匯出 ★★★
    function downloadMarkdown(data) {
        chrome.storage.local.get(data.key, (result) => {
            const fullData = result[data.key];
            if (!fullData || !fullData.rawContent) {
                alert("無法載入備份內容！");
                return;
            }

            const bName = fullData.botName || 'Gemini';
            const blocks = fullData.rawContent.split(SEPARATOR).filter(b => b.trim());
            let md = `# ${bName} - ${fullData.title}\n\n`;
            md += `> 備份時間：${fullData.lastUpdated || '未知'}  \n`;
            md += `> 備份工具：GeminiSaver Fairy 自動備份小精靈 v${GS_VERSION}\n\n---\n\n`;

            blocks.forEach((block, idx) => {
                const lines = block.trim().split('\n');
                const firstLine = lines[0] || '';
                if (firstLine.startsWith('你：')) {
                    md += `## 你\n\n${lines.slice(1).join('\n').trim()}\n\n`;
                } else if (firstLine.includes('(GEMINI)：')) {
                    const gemName = firstLine.replace('(GEMINI)：', '').trim();
                    md += `## ${gemName}\n\n${lines.slice(1).join('\n').trim()}\n\n`;
                } else {
                    md += `${block.trim()}\n\n`;
                }
                if (idx < blocks.length - 1) md += '---\n\n';
            });

            const safeName = (fullData.title || 'backup').replace(/[<>:"/\\|?*]/g, '_');
            const safeBName = bName.replace(/[<>:"/\\|?*]/g, '_');
            downloadFile(`${safeBName}-${safeName}_${new Date().toISOString().slice(0, 10)}.md`,
                '\uFEFF' + md, 'text/markdown;charset=utf-8');
            showToast('📝 已匯出 Markdown');
        });
    }

    // ★ 下載檔案 ★
    function downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
    }

    // ★ 下載 TXT ★
    function downloadBackup(data) {
        chrome.storage.local.get(data.key, (result) => {
            const fullData = result[data.key];
            if (!fullData || !fullData.rawContent) {
                alert("無法載入備份內容！");
                return;
            }
            const content = formatContent(fullData);
            const bName = (fullData.botName || "Gemini").replace(/[<>:"/\\|?*]/g, "_");
            downloadFile(`${bName}-${fullData.title}_${new Date().toISOString().slice(0, 10)}.txt`,
                '\uFEFF' + content, 'text/plain;charset=utf-8');
        });
    }

    // ★ 建立遮罩層 ★
    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:10000; display:flex; justify-content:center; align-items:center;`;
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        return overlay;
    }

    // ★ 複製到剪貼簿 ★
    function copyToClipboard(text, btnElement, originalColor) {
        navigator.clipboard.writeText(text).then(() => {
            const originText = btnElement.innerText;
            btnElement.innerText = "✅ 已複製";
            btnElement.style.background = "#20bf6b";
            setTimeout(() => {
                btnElement.innerText = originText;
                btnElement.style.background = originalColor;
            }, 1500);
        }).catch((err) => {
            console.error("[Dashboard] 複製失敗:", err);
            showToast("❌ 複製失敗");
        });
    }

    // ==========================================
    // 工具列按鈕事件
    // ==========================================

    // ★ 全選 ★
    let isAllSelected = false;
    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) {
        selectAllBtn.onclick = () => {
            const boxes = listContainer.querySelectorAll('.backup-checkbox');
            if (boxes.length === 0) return;
            isAllSelected = !isAllSelected;
            boxes.forEach(box => box.checked = isAllSelected);
            selectAllBtn.innerText = isAllSelected ? "☒ 取消全選" : "☑️ 全選";
        };
    }

    // ★ 下載選取 ZIP ★
    const zipBtn = document.getElementById('btn-zip');
    if (zipBtn) {
        zipBtn.onclick = async () => {
            const checkedBoxes = listContainer.querySelectorAll('.backup-checkbox:checked');
            if (checkedBoxes.length === 0) { alert("請先勾選想要下載的備份！"); return; }
            const selectedKeys = Array.from(checkedBoxes).map(cb => cb.value);
            await downloadSelectedAsZip(selectedKeys);
        };
    }

    // ★ 刪除選取 (雙重確認) ★
    const deleteSelectedBtn = document.getElementById('btn-delete-selected');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.onclick = () => {
            const checkedBoxes = listContainer.querySelectorAll('.backup-checkbox:checked');
            if (checkedBoxes.length === 0) { alert("請先勾選想要刪除的備份！"); return; }
            const count = checkedBoxes.length;
            if (!confirm(`確定要刪除這 ${count} 筆備份嗎？`)) return;
            if (!confirm(`⚠️ 最後確認！\n\n這 ${count} 筆備份刪除後無法復原！\n請確認已先下載備份。\n\n真的要刪除嗎？`)) return;

            const selectedKeys = Array.from(checkedBoxes).map(cb => cb.value);
            chrome.storage.local.remove(selectedKeys, () => {
                allBackups = allBackups.filter(d => !selectedKeys.includes(d.key));
                showToast(`🗑️ 已刪除 ${count} 筆備份`);
                renderList();
                updateStats();
            });
        };
    }

    // ★ 關於 ★
    const aboutBtn = document.getElementById('btn-about');
    if (aboutBtn) {
        aboutBtn.onclick = showAboutDialog;
    }

    // ★ 換窗指令 ★
    const promptBtn = document.getElementById('btn-prompt');
    if (promptBtn) {
        promptBtn.onclick = showPromptEditor;
    }

    // ★ 剪貼簿 ★
    const clipboardBtn = document.getElementById('btn-clipboard');
    if (clipboardBtn) {
        clipboardBtn.onclick = showClipboardManager;
    }

    // ==========================================
    // 下載 ZIP
    // ==========================================
    async function downloadSelectedAsZip(selectedKeys) {
        if (typeof JSZip === 'undefined') {
            alert('JSZip 函式庫未載入，請確認網路連線。');
            return;
        }

        showToast('⏳ 正在打包選取項目...');
        const zip = new JSZip();
        const todayStr = new Date().toISOString().slice(0, 10);

        // 批次讀取所有選取的備份完整資料
        chrome.storage.local.get(selectedKeys, (items) => {
            let count = 0;
            selectedKeys.forEach(key => {
                const item = items[key];
                if (item && item.rawContent) {
                    const bName = (item.botName || 'Gemini').replace(/[<>:"/\\|?*]/g, '_');
                    const safeTitle = (item.title || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
                    const itemDate = new Date(item.timestamp || Date.now());
                    const itemDateStr = itemDate.toISOString().slice(0, 10);

                    let baseName = `${bName}-${safeTitle}_${itemDateStr}`;
                    let fileName = `${baseName}.txt`;
                    let dupCount = 1;
                    while (zip.file(fileName)) {
                        fileName = `${baseName}_(${dupCount}).txt`;
                        dupCount++;
                    }

                    const content = '\uFEFF' + formatContent(item);
                    zip.file(fileName, content, { binary: false });
                    count++;
                }
            });

            zip.generateAsync({ type: 'blob' }).then((content) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(content);
                a.download = `Gemini_Backups_${todayStr}.zip`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
                showToast(`📦 打包完成！共 ${count} 個檔案`);
            });
        });
    }

    // ==========================================
    // 匯出/匯入 JSON
    // ==========================================
    function exportAllAsJSON() {
        chrome.storage.local.get(null, (items) => {
            const backupKeys = Object.keys(items).filter(k => k.startsWith('backup_'));
            const backups = backupKeys.map(key => ({ key, ...items[key] }));

            if (backups.length === 0) {
                alert('目前沒有任何備份資料可匯出！');
                return;
            }

            const exportData = {
                version: GS_VERSION,
                exportDate: new Date().toISOString(),
                totalBackups: backups.length,
                backups: backups,
                settings: {
                    customPrompt: _getSetting(STORAGE_PROMPT) || '',
                    clipboard: (() => {
                        try { return JSON.parse(_getSetting(STORAGE_CLIPBOARD) || '[]'); }
                        catch (e) { return []; }
                    })(),
                    // ★ v10.1.0: Icon + 收納盒設定 ★
                    iconSettings: items['gem_icon_settings'] || null,
                    iconSizePercent: items['gem_icon_size_percent'] || null,
                    backupCloudToastEnabled: ('gs_backup_cloud_icon_enabled' in items) ? items['gs_backup_cloud_icon_enabled'] : null,
                    generalToastEnabled: ('gs_general_toast_enabled' in items) ? items['gs_general_toast_enabled'] : null,
                    errorToastEnabled: ('gs_error_toast_enabled' in items) ? items['gs_error_toast_enabled'] : null,
                    folders: items['gs_folders'] || null,
                    convFolderMap: items['gs_conv_folder_map'] || null,
                    convAccountOverride: items['gs_conv_account_override'] || null,
                    collapseState: items['gs_fm_collapse_state'] || null,
                    categories: items['gemini_vault_categories'] || null,
                    lockedCats: items['gemini_vault_locks'] || null
                }
            };

            const jsonStr = JSON.stringify(exportData, null, 2);
            downloadFile(`Gemini_Backup_${new Date().toISOString().slice(0, 10)}.json`,
                jsonStr, 'application/json;charset=utf-8');
            showToast(`📤 已匯出 ${backups.length} 筆備份`);
        });
    }

    function importFromJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const raw = JSON.parse(text);

                if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                    alert('❌ 無效的備份檔格式！');
                    return;
                }

                let storageData = {};
                let importedCount = 0;
                let formatDesc = '';
                let hasSettings = false;

                // ★ 格式 A：每日自動備份（full_backup，有 data 欄位）
                if (raw.exportType === 'full_backup' && raw.data && typeof raw.data === 'object') {
                    storageData = raw.data;
                    importedCount = Object.keys(storageData).filter(k => k.startsWith('backup_')).length;
                    formatDesc = `（自動備份格式）`;
                }
                // ★ 格式 B：Dashboard 匯出（有 backups 陣列）
                else if (raw.backups && Array.isArray(raw.backups)) {
                    for (const backup of raw.backups) {
                        if (backup && backup.key) {
                            const { key, ...backupData } = backup;
                            storageData[key] = backupData;
                            importedCount++;
                        } else if (backup && backup.id) {
                            // v9.1.0 Tampermonkey 格式相容
                            const key = `backup_${backup.id}`;
                            storageData[key] = backup;
                            importedCount++;
                        }
                    }
                    hasSettings = !!raw.settings;
                    formatDesc = `（備份檔格式）`;
                }
                // ★ 格式 C：直接 storage dump
                else {
                    storageData = raw;
                    importedCount = Object.keys(storageData).filter(k => k.startsWith('backup_')).length;
                    formatDesc = `（完整資料格式）`;
                }

                const existingCount = allBackups.length;

                if (!confirm(`📥 ${formatDesc}發現 ${importedCount} 筆備份資料\n目前已有 ${existingCount} 筆備份\n\n按「確定」= 智慧合併（同 ID 自動保留內容較多的版本）\n按「取消」= 放棄匯入`)) {
                    showToast('❌ 已取消匯入');
                    return;
                }

                showToast('⏳ 正在匯入資料...');

                // ★ v10.1.1: 智慧合併 — 同 ID 保留 rawContent 較長的版本，同長保留較新的 ★
                const backupKeys = Object.keys(storageData).filter(k => k.startsWith('backup_'));
                chrome.storage.local.get(backupKeys, (existing) => {
                    let keptLocalCount = 0;
                    for (const key of backupKeys) {
                        const existItem = existing[key];
                        const importItem = storageData[key];
                        if (existItem && existItem.rawContent && importItem) {
                            const existLen = (existItem.rawContent || '').length;
                            const importLen = (importItem.rawContent || '').length;
                            if (existLen > importLen) {
                                delete storageData[key];
                                keptLocalCount++;
                            } else if (existLen === importLen) {
                                const existTime = existItem.timestamp || 0;
                                const importTime = importItem.timestamp || 0;
                                if (existTime >= importTime) {
                                    delete storageData[key];
                                    keptLocalCount++;
                                }
                            }
                        }
                    }

                    const actualImported = importedCount - keptLocalCount;

                    chrome.storage.local.set(storageData, () => {
                        // 格式 B 的 settings 還原
                        if (hasSettings && raw.settings) {
                            if (raw.settings.customPrompt !== undefined) {
                                _setSetting(STORAGE_PROMPT, raw.settings.customPrompt);
                            }
                            if (raw.settings.clipboard !== undefined) {
                                _setSetting(STORAGE_CLIPBOARD, JSON.stringify(raw.settings.clipboard));
                            }
                            // ★ v10.1.0: 還原 Icon + 收納盒設定 ★
                            const settingsMap = {
                                iconSettings: 'gem_icon_settings',
                                iconSizePercent: 'gem_icon_size_percent',
                                backupCloudToastEnabled: 'gs_backup_cloud_icon_enabled',
                                generalToastEnabled: 'gs_general_toast_enabled',
                                errorToastEnabled: 'gs_error_toast_enabled',
                                folders: 'gs_folders',
                                convFolderMap: 'gs_conv_folder_map',
                                convAccountOverride: 'gs_conv_account_override',
                                collapseState: 'gs_fm_collapse_state',
                                categories: 'gemini_vault_categories',
                                lockedCats: 'gemini_vault_locks'
                            };
                            const extraSettings = {};
                            for (const [jsonKey, storageKey] of Object.entries(settingsMap)) {
                                if (raw.settings[jsonKey] != null) {
                                    extraSettings[storageKey] = raw.settings[jsonKey];
                                }
                            }
                            if (Object.keys(extraSettings).length > 0) {
                                chrome.storage.local.set(extraSettings);
                            }
                        }

                        let message = `✅ 匯入完成！${formatDesc}\n\n已匯入：${actualImported} 筆備份`;
                        if (keptLocalCount > 0) {
                            message += `\n保留本機版本：${keptLocalCount} 筆（本機內容較完整）`;
                        }
                        alert(message);
                        showToast(`✅ 已匯入 ${actualImported} 筆備份`);
                        loadBackups();
                    });
                });
            } catch (err) {
                console.error('[Dashboard] 匯入失敗:', err);
                alert(`❌ 匯入失敗！\n\n${err.message}`);
            }
        };

        input.click();
    }

    // ==========================================
    // 關於對話框
    // ==========================================
    function showAboutDialog() {
        const overlay = createOverlay();
        const modal = document.createElement('div');
        modal.style.cssText = 'background:#2f3640; color:white; padding:25px; border-radius:20px; width:85%; max-width:450px; text-align:center; display:flex; flex-direction:column; gap:12px; box-shadow:0 10px 25px rgba(0,0,0,0.5); border:1px solid #444;';

        modal.innerHTML = `
            <h3 style="border-bottom:1px solid #444;padding-bottom:15px;">ℹ️ 關於本工具</h3>
            <p style="font-size:14px;color:#aaa;margin:10px 0;">GeminiSaver Fairy 自動備份小精靈 v${GS_VERSION}</p>
            <p style="font-size:13px;color:#888;margin:0;">by <a href="https://www.threads.com/@minijinai75" target="_blank" style="color:#FFB7C5;text-decoration:none;">⚡minijinai75</a></p>
            <div style="border-top:1px solid #444;padding-top:15px;margin-top:10px;">
                <p style="font-size:12px;color:#aaa;margin:0 0 10px 0;">📦 備份資料轉移（換機適用）</p>
            </div>
        `;

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

        const exportBtn = createBtn("📤 匯出備份檔", COLORS.setting);
        exportBtn.style.width = "100%";
        exportBtn.onclick = exportAllAsJSON;

        const importBtn = createBtn("📥 匯入備份檔", COLORS.select);
        importBtn.style.width = "100%";
        importBtn.onclick = () => { importFromJSON(); overlay.remove(); };

        const divider = document.createElement('div');
        divider.style.cssText = "border-top:1px solid #444; margin:5px 0; padding-top:8px;";
        divider.innerHTML = '<p style="font-size:12px;color:#aaa;margin:0 0 5px 0;">📖 幫助 & 回饋</p>';

        const notionBtn = createBtn("📖 使用說明 & 更新紀錄", COLORS.setting);
        notionBtn.style.width = "100%";
        notionBtn.onclick = () => window.open("https://minijinai75.notion.site/geminisaver-fairy", "_blank");

        const marshmallowBtn = createBtn("💌 棉花糖 (問題回報/許願)", COLORS.wish);
        marshmallowBtn.style.width = "100%";
        marshmallowBtn.onclick = () => window.open("https://marshmallow-qa.com/g5cbtosuz5fj93n", "_blank");

        const closeBtn = createBtn("關閉", COLORS.close);
        closeBtn.style.width = "100%";
        closeBtn.onclick = () => overlay.remove();

        btnContainer.append(exportBtn, importBtn, divider, notionBtn, marshmallowBtn, closeBtn);
        modal.appendChild(btnContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    // ==========================================
    // 換窗指令
    // ==========================================
    function showPromptEditor() {
        const overlay = createOverlay();
        const box = document.createElement('div');
        box.style.cssText = `background:#2f3640;color:white;padding:20px;border-radius:20px;width:92%;max-width:800px;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:15px;border:1px solid #444;`;
        box.innerHTML = `<h3 style="margin:0 0 5px 0;border-bottom:1px solid #444;padding-bottom:15px;">⚙️ 設定整理指令</h3><p style="font-size:13px;color:#aaa;margin:0;">此指令將附加在「複製含指令」功能的文字最上方。</p>`;

        const textArea = document.createElement('textarea');
        textArea.style.cssText = `width:100%;height:300px;background:#1e272e;color:#fff;border:2px solid #444;padding:12px;border-radius:12px;font-size:14px;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5;`;
        textArea.value = _getSetting(STORAGE_PROMPT) || "";

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";

        const cancelBtn = createBtn("取消", "#555");
        cancelBtn.onclick = () => overlay.remove();

        const saveBtn = createBtn("💾 儲存設定", COLORS.view);
        saveBtn.onclick = () => {
            _setSetting(STORAGE_PROMPT, textArea.value);
            showToast("✅ 指令已儲存");
            overlay.remove();
        };

        btnGroup.append(cancelBtn, saveBtn);
        box.append(textArea, btnGroup);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    // ==========================================
    // ★★★ v10.0.0: Prompt Vault (升級版萬用剪貼簿) ★★★
    // ==========================================
    const STORAGE_VAULT_CATEGORIES = 'gemini_vault_categories';
    const DEFAULT_CATEGORIES = ['角色設定', '系統指令', '對話模板', '咒語', '其他'];
    const DEFAULT_CATEGORY_COLORS = {
        '角色設定': '#E8A4C9', '系統指令': '#A7C7E7',
        '對話模板': '#B4E7CE', '咒語': '#FFCBA4', '其他': '#C8BFD4'
    };
    function getCategoryColor(name) {
        if (DEFAULT_CATEGORY_COLORS[name]) return DEFAULT_CATEGORY_COLORS[name];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        return `hsl(${Math.abs(hash) % 360}, 60%, 75%)`;
    }
    function loadCategories() {
        try { const s = JSON.parse(_getSetting(STORAGE_VAULT_CATEGORIES)); if (Array.isArray(s) && s.length > 0) return s; } catch (e) { }
        return [...DEFAULT_CATEGORIES];
    }
    function saveCategories(cats) { _setSetting(STORAGE_VAULT_CATEGORIES, JSON.stringify(cats)); }

    // ★ 分類上鎖功能 ★
    const STORAGE_VAULT_LOCKS = 'gemini_vault_locks';
    function loadLockedCats() {
        try { const s = JSON.parse(_getSetting(STORAGE_VAULT_LOCKS)); return Array.isArray(s) ? s : []; } catch (e) { return []; }
    }
    function saveLockedCats(locks) { _setSetting(STORAGE_VAULT_LOCKS, JSON.stringify(locks)); }

    function showClipboardManager() {
        const overlay = createOverlay();
        const box = document.createElement('div');
        box.style.cssText = `background:#2f3640;color:white;padding:20px;border-radius:20px;width:95%;max-width:900px;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;border:1px solid #444;max-height:90vh;`;
        box.innerHTML = `<h3 style="margin:0;border-bottom:1px solid #444;padding-bottom:10px;display:flex;justify-content:space-between;align-items:center;"><span>💡 Prompt萬用剪貼簿</span><span style="font-size:12px;color:#aaa;font-weight:normal;">右鍵連擊兩次刪除｜左鍵連擊兩次上鎖</span></h3>`;

        let userCategories = loadCategories();
        let lockedCats = loadLockedCats();
        let clipData;
        try { clipData = JSON.parse(_getSetting(STORAGE_CLIPBOARD) || '[]'); }
        catch (e) { clipData = []; }
        if (!Array.isArray(clipData) || clipData.length === 0) {
            clipData = [{ title: "", content: "", category: "其他" }];
        }
        clipData.forEach(item => { if (!item.category) item.category = '其他'; });

        let filterCategory = '全部';
        let filterText = '';

        // ★ 分類標籤列 ★
        const catRow = document.createElement('div');
        catRow.style.cssText = 'display:flex; gap:6px; align-items:center; flex-wrap:wrap; padding:4px 0;';
        function renderCatRow() {
            catRow.innerHTML = '';
            const allBtn = document.createElement('button');
            allBtn.textContent = '全部';
            allBtn.style.cssText = `padding:4px 12px;border-radius:14px;border:none;font-size:12px;cursor:pointer;font-weight:bold;${filterCategory === '全部' ? 'background:#fff;color:#1e272e;' : 'background:#444;color:#ccc;'}`;
            allBtn.onclick = () => { filterCategory = '全部'; renderCatRow(); renderFields(); };
            catRow.appendChild(allBtn);
            userCategories.forEach(cat => {
                const cc = getCategoryColor(cat);
                const isLocked = lockedCats.includes(cat);
                const b = document.createElement('button');
                b.textContent = (isLocked ? '🔒 ' : '') + cat;
                const normalStyle = `padding:4px 12px;border-radius:14px;border:${isLocked ? '2px solid #FFD700' : 'none'};font-size:12px;cursor:pointer;font-weight:bold;transition:0.2s;${filterCategory === cat ? `background:${cc};color:#1e272e;` : `background:#444;color:${cc};`}`;
                b.style.cssText = normalStyle;
                b.onclick = () => { filterCategory = cat; renderCatRow(); renderFields(); };

                // 雙擊切換上鎖
                b.ondblclick = (ev) => {
                    ev.preventDefault();
                    if (isLocked) {
                        lockedCats = lockedCats.filter(c => c !== cat);
                        showToast(`🔓 「${cat}」已解鎖`);
                    } else {
                        lockedCats.push(cat);
                        showToast(`🔒 「${cat}」已上鎖，無法刪除`);
                    }
                    saveLockedCats(lockedCats);
                    renderCatRow();
                };

                let pendingDelete = false;
                let deleteTimer = null;
                b.oncontextmenu = (ev) => {
                    ev.preventDefault();
                    if (isLocked) { showToast('🔒 此分類已上鎖，雙擊解鎖後才可刪除'); return; }
                    if (userCategories.length <= 1) { showToast('⚠️ 至少需保留一個分類'); return; }

                    if (!pendingDelete) {
                        const affectedCount = clipData.filter(it => it.category === cat).length;
                        pendingDelete = true;
                        b.textContent = `❌ ${cat} (${affectedCount}筆)`;
                        b.style.cssText = `padding:4px 12px;border-radius:14px;border:2px solid #ff4444;font-size:12px;cursor:pointer;font-weight:bold;background:#ff4444;color:white;`;
                        deleteTimer = setTimeout(() => {
                            pendingDelete = false;
                            b.textContent = cat;
                            b.style.cssText = normalStyle;
                        }, 3000);
                    } else {
                        clearTimeout(deleteTimer);
                        pendingDelete = false;
                        clipData.forEach(it => { if (it.category === cat) it.category = '其他'; });
                        userCategories = userCategories.filter(c => c !== cat);
                        lockedCats = lockedCats.filter(c => c !== cat);
                        saveCategories(userCategories);
                        saveLockedCats(lockedCats);
                        if (filterCategory === cat) filterCategory = '全部';
                        showToast(`🗑️ 已刪除分類「${cat}」`);
                        renderCatRow(); renderFields();
                    }
                };
                catRow.appendChild(b);
            });
            const addCatBtn = document.createElement('button');
            addCatBtn.textContent = '+';
            addCatBtn.title = '新增自訂分類';
            addCatBtn.style.cssText = 'width:26px;height:26px;border-radius:50%;border:2px dashed #666;background:transparent;color:#888;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
            addCatBtn.onclick = () => {
                const name = prompt('請輸入新分類名稱：');
                if (!name || !name.trim()) return;
                const t = name.trim();
                if (userCategories.includes(t)) { showToast('⚠️ 此分類已存在'); return; }
                userCategories.push(t);
                saveCategories(userCategories);
                renderCatRow(); renderFields();
                showToast(`✅ 已新增分類「${t}」`);
            };
            catRow.appendChild(addCatBtn);
        }
        box.appendChild(catRow);

        const searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.placeholder = '🔍 搜尋 Prompt...';
        searchBox.style.cssText = 'width:100%;padding:8px 12px;border-radius:8px;border:1px solid #555;background:#1e272e;color:#fff;font-size:13px;outline:none;box-sizing:border-box;';
        box.appendChild(searchBox);

        const scrollContainer = document.createElement('div');
        scrollContainer.style.cssText = "display:flex; flex-direction:column; gap:12px; overflow-y:auto; flex:1; padding-right:5px; max-height:55vh;";

        function renderFields() {
            scrollContainer.innerHTML = '';
            const filtered = clipData.filter((item, idx) => {
                if (filterCategory !== '全部' && item.category !== filterCategory) return false;
                if (filterText) {
                    const q = filterText.toLowerCase();
                    return (item.title || '').toLowerCase().includes(q) ||
                        (item.content || '').toLowerCase().includes(q);
                }
                return true;
            });

            if (filtered.length === 0) {
                const empty = document.createElement('p');
                empty.style.cssText = 'text-align:center; color:#888; font-size:13px; padding:20px;';
                empty.textContent = filterText || filterCategory !== '全部' ? '沒有符合的 Prompt' : '還沒有任何 Prompt，點下方「新增」開始！';
                scrollContainer.appendChild(empty);
                return;
            }

            filtered.forEach((item) => {
                const realIndex = clipData.indexOf(item);
                const row = document.createElement('div');
                const catColor = getCategoryColor(item.category);
                row.style.cssText = `background:#1e272e; padding:12px; border-radius:10px; border-left:4px solid ${catColor};`;

                const header = document.createElement('div');
                header.style.cssText = "display:flex; gap:8px; margin-bottom:8px; align-items:center;";

                const catTag = document.createElement('span');
                catTag.style.cssText = `background:${catColor}; color:#1e272e; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:bold; white-space:nowrap;`;
                catTag.textContent = item.category || '其他';

                const titleInput = document.createElement('input');
                titleInput.type = "text";
                titleInput.placeholder = '標題 (可不填寫)';
                titleInput.value = item.title || "";
                titleInput.style.cssText = "flex:1; background:transparent; border:none; border-bottom:1px solid #555; color:#fff; padding:5px; outline:none; font-size:13px;";
                titleInput.oninput = () => { clipData[realIndex].title = titleInput.value; };

                const catBtn = document.createElement('select');
                catBtn.style.cssText = 'padding:3px 6px; border-radius:6px; border:1px solid #555; background:#2f3640; color:#fff; font-size:11px; cursor:pointer; outline:none;';
                userCategories.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    opt.textContent = cat;
                    if (cat === item.category) opt.selected = true;
                    catBtn.appendChild(opt);
                });
                catBtn.onchange = () => {
                    clipData[realIndex].category = catBtn.value;
                    catTag.textContent = catBtn.value;
                    const nc = getCategoryColor(catBtn.value);
                    catTag.style.background = nc;
                    row.style.borderLeftColor = nc;
                };

                const copyBtn = createBtn("📋", COLORS.clipboard);
                copyBtn.style.cssText += "padding:4px 8px; font-size:12px;";
                copyBtn.title = "複製內容";
                copyBtn.onclick = () => {
                    if (!contentArea.value) { showToast("內容是空的！"); return; }
                    copyToClipboard(contentArea.value, copyBtn, COLORS.clipboard);
                };

                const deleteBtn = createBtn("✕", COLORS.delete);
                deleteBtn.style.cssText += "padding:4px 8px; font-size:12px;";
                deleteBtn.onclick = () => {
                    if (clipData.length <= 1) { showToast("⚠️ 至少需保留一個欄位！"); return; }
                    if (confirm(`確定刪除「${item.title || '未命名'}」？`)) {
                        clipData.splice(realIndex, 1);
                        renderFields();
                    }
                };

                header.append(catTag, titleInput, catBtn, copyBtn, deleteBtn);

                const contentArea = document.createElement('textarea');
                contentArea.placeholder = "在此貼上指令、角色設定或咒語...";
                contentArea.value = item.content || "";
                contentArea.style.cssText = "width:100%; height:70px; background:#2f3640; color:#dfe6e9; border:1px solid #555; border-radius:8px; padding:8px; box-sizing:border-box; resize:vertical; outline:none; font-size:13px; line-height:1.5;";
                contentArea.oninput = () => { clipData[realIndex].content = contentArea.value; };

                row.append(header, contentArea);
                scrollContainer.appendChild(row);
            });
        }

        searchBox.oninput = () => { filterText = searchBox.value; renderFields(); };

        renderCatRow();
        renderFields();

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = "display:flex;justify-content:space-between;gap:10px;padding-top:10px;border-top:1px solid #444;";

        const addBtn = createBtn("➕ 新增 Prompt", COLORS.select);
        addBtn.onclick = () => {
            clipData.push({ title: "", content: "", category: filterCategory !== '全部' ? filterCategory : '其他' });
            filterText = '';
            searchBox.value = '';
            renderFields();
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        };

        const rightBtnGroup = document.createElement('div');
        rightBtnGroup.style.cssText = "display:flex; gap:10px;";

        const saveBtn = createBtn("💾 儲存並關閉", COLORS.view);
        saveBtn.onclick = () => {
            const filteredData = clipData.filter(item => item.title.trim() !== '' || item.content.trim() !== '');
            const finalData = filteredData.length > 0 ? filteredData : [{ title: "", content: "", category: "其他" }];
            _setSetting(STORAGE_CLIPBOARD, JSON.stringify(finalData));
            showToast("✅ Prompt萬用剪貼簿 已儲存");
            overlay.remove();
        };

        const closeBtn = createBtn("取消", "#555");
        closeBtn.onclick = () => overlay.remove();

        rightBtnGroup.append(closeBtn, saveBtn);
        btnGroup.append(addBtn, rightBtnGroup);
        box.append(scrollContainer, btnGroup);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    // ==========================================
    // 搜尋
    // ==========================================
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            renderList();
        });
    }

    // ★ 即時更新 ★
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes['gs_general_toast_enabled']) {
                _dashGeneralToastEnabled = changes['gs_general_toast_enabled'].newValue !== false;
            }
            if (changes['gs_error_toast_enabled']) {
                _dashErrorToastEnabled = changes['gs_error_toast_enabled'].newValue !== false;
            }
        }
        const hasBackupChange = Object.keys(changes).some(k => k.startsWith('backup_'));
        if (hasBackupChange) {
            loadBackups();
        }
    });

    // ★ 初始載入（預載設定快取後再載入備份）★
    _preloadSettings(() => loadBackups());
});
