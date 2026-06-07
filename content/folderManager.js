
// content/folderManager.js — GEMINI對話分類收納盒
// 依賴：globals.js (STORAGE_PREFIX, detectAccountEmail, showToast, getConversationId)

// ==========================================
// ★★★ v10.0.0 新功能：GEMINI對話分類收納盒 ★★★
// ==========================================
let _fmPanelEl = null;       // 收納盒容器 DOM reference
let _fmRetryTimer = null;    // sidebar 尋找重試 timer
let _fmBackupCache = [];     // 備份 metadata 快取
let _fmCollapseState = {};   // 摺疊狀態記憶（key → true=展開）
const _FM_CONTAINER_ID = 'gs-fm-container';

// --- CSS 注入 ---
function _fmInjectStyles() {
    if (document.getElementById('gs-fm-styles')) return;
    const style = document.createElement('style');
    style.id = 'gs-fm-styles';
    style.textContent = `
        .gs-fm-container {
            margin: 8px;
            background: linear-gradient(145deg, #1e1e38, #1a1a30);
            border-radius: 12px;
            border-left: 3px solid #38bdf8;
            overflow: hidden;
            box-shadow: 0 2px 12px rgba(56, 189, 248, 0.08);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .gs-fm-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            cursor: pointer;
            user-select: none;
        }
        .gs-fm-header:hover { background: rgba(255,255,255,0.03); }
        .gs-fm-header .gs-fm-left {
            display: flex; align-items: center; gap: 8px;
        }
        .gs-fm-header .gs-fm-emoji { font-size: 16px; }
        .gs-fm-header .gs-fm-text {
            color: #38bdf8; font-size: 13px; font-weight: 600; letter-spacing: 0.3px;
        }
        .gs-fm-header .gs-fm-arrow { color: #555; font-size: 12px; transition: transform 0.2s; }
        .gs-fm-body { padding: 0 0 4px; }
        .gs-fm-body.gs-fm-collapsed { display: none; }

        /* 帳號區塊 */
        .gs-fm-account { margin: 4px 8px 8px; }
        .gs-fm-account-header {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 10px; border-radius: 8px;
            cursor: pointer; transition: background 0.15s; user-select: none;
        }
        .gs-fm-account-header:hover { background: rgba(255,255,255,0.04); }
        .gs-fm-account-header .gs-fm-arrow { color: #666; font-size: 10px; width: 12px; }
        .gs-fm-account-header .gs-fm-email-icon { font-size: 14px; }
        .gs-fm-account-header .gs-fm-email {
            color: #c0c0d0; font-size: 12px; font-weight: 500;
            flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .gs-fm-account-header .gs-fm-count { color: #666; font-size: 11px; }
        .gs-fm-account-content {
            margin-left: 12px; padding-left: 12px; border-left: 1px solid #2a2a45;
        }
        .gs-fm-account-content.gs-fm-collapsed { display: none; }

        /* Gem 分組 */
        .gs-fm-gem-header {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 10px; cursor: pointer; user-select: none;
            border-radius: 8px; transition: background 0.15s;
        }
        .gs-fm-gem-header:hover { background: rgba(255,255,255,0.03); }
        .gs-fm-gem-header .gs-fm-arrow { color: #555; font-size: 10px; width: 12px; }
        .gs-fm-gem-header .gs-fm-icon { font-size: 14px; }
        .gs-fm-gem-header .gs-fm-text { color: #888; font-size: 12px; font-weight: 500; }

        .gs-fm-gem-content { margin-left: 20px; }
        .gs-fm-gem-content.gs-fm-collapsed { display: none; }

        .gs-fm-gem-item {
            display: flex; align-items: center; gap: 8px;
            padding: 5px 10px; border-radius: 6px;
            cursor: pointer; transition: background 0.15s;
        }
        .gs-fm-gem-item:hover { background: rgba(255,255,255,0.04); }
        .gs-fm-gem-item .gs-fm-icon { font-size: 13px; }
        .gs-fm-gem-item .gs-fm-name { color: #999; font-size: 12px; flex: 1; }
        .gs-fm-gem-item .gs-fm-badge {
            color: #555; font-size: 10px;
            background: rgba(255,255,255,0.05); padding: 1px 5px; border-radius: 8px;
        }

        /* 對話項目 */
        .gs-fm-conv-item {
            display: flex; align-items: center; gap: 8px;
            padding: 5px 10px; border-radius: 6px;
            cursor: pointer; transition: background 0.15s;
        }
        .gs-fm-conv-item:hover { background: rgba(255,255,255,0.05); }
        .gs-fm-conv-item .gs-fm-icon { font-size: 12px; }
        .gs-fm-conv-item .gs-fm-name {
            color: #b0b0c0; font-size: 12px; flex: 1;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* 分隔線 */
        .gs-fm-separator {
            height: 1px; background: linear-gradient(90deg, transparent, #2a2a45, transparent);
            margin: 4px 10px;
        }

        /* 未分類 */
        .gs-fm-uncategorized {
            display: flex; align-items: center; gap: 8px;
            padding: 7px 10px; border-radius: 8px;
            cursor: pointer; transition: background 0.15s;
        }
        .gs-fm-uncategorized:hover { background: rgba(255,255,255,0.04); }
        .gs-fm-uncategorized .gs-fm-icon { font-size: 14px; }
        .gs-fm-uncategorized .gs-fm-name { color: #777; font-size: 12px; flex: 1; }
        .gs-fm-uncategorized .gs-fm-badge { color: #555; font-size: 11px; }

        .gs-fm-conv-list { margin-left: 20px; }
        .gs-fm-conv-list.gs-fm-collapsed { display: none; }

        /* 載入中 */
        .gs-fm-loading {
            color: #555; font-size: 11px; text-align: center; padding: 12px;
        }

        /* Gem icon 圖片 */
        .gs-fm-gem-item .gs-fm-icon-img {
            width: 18px; height: 18px; border-radius: 50%; object-fit: cover;
            vertical-align: middle;
        }

        /* 可點擊更換的 icon */
        .gs-fm-icon-clickable {
            cursor: pointer; border-radius: 4px; padding: 1px 2px;
            transition: opacity 0.15s, background 0.15s;
        }
        .gs-fm-icon-clickable:hover {
            opacity: 0.7; background: rgba(56,189,248,0.12);
        }

        /* 說明按鈕 */
        .gs-fm-help-btn {
            color: #555; font-size: 13px; cursor: pointer;
            padding: 2px 4px; border-radius: 4px;
        }

        /* 掃描按鈕 */
        .gs-fm-scan-btn {
            color: #555; font-size: 13px; cursor: pointer;
            padding: 2px 4px; border-radius: 4px;
            transition: color 0.15s, background 0.15s;
        }
        .gs-fm-scan-btn:hover { color: #38bdf8; background: rgba(56,189,248,0.12); }
        .gs-fm-help-btn:hover { color: #38bdf8; background: rgba(56,189,248,0.1); }

        /* 拖曳排序手把 */
        .gs-fm-drag-grip {
            color: #444; font-size: 11px; cursor: grab; user-select: none;
            padding: 0 2px; transition: color 0.15s;
        }
        .gs-fm-drag-grip:hover { color: #a78bfa; }
        .gs-fm-gem-item:active .gs-fm-drag-grip { cursor: grabbing; }

        /* 說明 Overlay */
        .gs-fm-guide-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 999998;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
        }
        .gs-fm-guide-panel {
            width: 380px; max-height: 80vh; background: #2D2B3D;
            border: 1px solid #4A4762; border-radius: 16px;
            box-shadow: 0 12px 48px rgba(0,0,0,0.6); overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #EEEDF5; font-size: 13px;
            animation: gemIconFadeIn 0.2s ease;
        }
        .gs-fm-guide-header {
            background: linear-gradient(135deg, #38bdf8, #2563eb);
            padding: 14px 16px; display: flex; justify-content: space-between; align-items: center;
        }
        .gs-fm-guide-header span { font-weight: bold; font-size: 14px; }
        .gs-fm-guide-close {
            cursor: pointer; font-size: 16px; opacity: 0.8; padding: 4px;
        }
        .gs-fm-guide-body {
            padding: 16px; overflow-y: auto; max-height: calc(80vh - 50px); line-height: 1.7;
        }
        .gs-fm-guide-body h3 { color: #38bdf8; font-size: 14px; margin: 12px 0 6px; }
        .gs-fm-guide-body h3:first-child { margin-top: 0; }
        .gs-fm-guide-body p { color: #c0c0d0; margin: 4px 0; font-size: 12.5px; }
        .gs-fm-guide-body .gs-fm-tip {
            background: #1e1e38; border-left: 3px solid #38bdf8;
            padding: 8px 12px; margin: 8px 0; border-radius: 6px;
            color: #a0a0b8; font-size: 12px;
        }

        /* Phase B: 資料夾項目 */
        .gs-fm-folder-item {
            display: flex; align-items: center; gap: 8px;
            padding: 7px 10px; border-radius: 8px;
            cursor: pointer; transition: all 0.15s; user-select: none;
        }
        .gs-fm-folder-item:hover { background: rgba(255,255,255,0.05); }
        .gs-fm-folder-item .gs-fm-icon { font-size: 14px; }
        .gs-fm-folder-item .gs-fm-name {
            color: #b0b0c0; font-size: 12.5px; flex: 1;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .gs-fm-folder-item .gs-fm-badge {
            color: #666; font-size: 11px;
            background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 10px;
        }
        .gs-fm-folder-item.gs-fm-delete-confirm {
            background: rgba(255,100,100,0.15); border: 1px solid rgba(255,100,100,0.3);
        }
        .gs-fm-folder-item.gs-fm-delete-confirm .gs-fm-name { color: #ff6b81; }

        /* 資料夾摺疊箭頭 */
        .gs-fm-fold-arrow {
            font-size: 9px; color: #555; width: 12px; text-align: center;
            transition: color 0.15s;
        }
        .gs-fm-folder-item:hover .gs-fm-fold-arrow { color: #aaa; }

        /* 資料夾內容區 */
        .gs-fm-folder-body { padding-left: 6px; }
        .gs-fm-folder-body.gs-fm-collapsed { display: none; }

        .gs-fm-add-folder {
            display: flex; align-items: center; justify-content: center;
            gap: 4px; padding: 5px 8px; margin: 2px 10px 4px;
            border-radius: 6px; border: 1px dashed #333;
            color: #555; font-size: 11px; cursor: pointer; transition: all 0.15s;
        }
        .gs-fm-add-folder:hover {
            border-color: #38bdf8; color: #38bdf8; background: rgba(56,189,248,0.05);
        }

        /* 右鍵選單 */
        .gs-fm-ctx-menu {
            position: fixed; z-index: 999999;
            background: #2D2B3D; border: 1px solid #4A4762; border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5); padding: 4px 0;
            min-width: 160px; max-height: 50vh; overflow-y: auto;
            animation: gemIconFadeIn 0.15s ease;
        }
        .gs-fm-ctx-item {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 14px; cursor: pointer; transition: background 0.1s;
            color: #c0c0d0; font-size: 12.5px; white-space: nowrap;
        }
        .gs-fm-ctx-item:hover { background: rgba(255,255,255,0.06); }
        .gs-fm-ctx-item .gs-fm-ctx-icon { font-size: 13px; }
        .gs-fm-ctx-item .gs-fm-icon-img {
            width: 14px; height: 14px; border-radius: 50%; object-fit: cover;
            vertical-align: middle;
        }
        .gs-fm-ctx-sep {
            height: 1px; background: #3a3a55; margin: 4px 8px;
        }

        /* Inline 編輯 */
        .gs-fm-inline-input {
            background: #1a1a30; border: 1px solid #38bdf8; border-radius: 4px;
            color: #e0e0f0; font-size: 12px; padding: 2px 6px; width: 100%;
            outline: none;
        }

        /* Phase C: 拖曳 */
        .gs-fm-conv-item[draggable="true"] { cursor: grab; }
        .gs-fm-conv-item[draggable="true"]:active { cursor: grabbing; }
        .gs-fm-dragging { opacity: 0.4 !important; }
        .gs-fm-dragover {
            background: rgba(56,189,248,0.15) !important;
            outline: 1px dashed #38bdf8 !important;
            outline-offset: -1px;
        }
        .gs-fm-account-header.gs-fm-dragover {
            outline: 2px dashed #a78bfa !important;
            background: rgba(167,139,250,0.1) !important;
        }
        .gs-fm-uncat-drop.gs-fm-dragover {
            outline: 1px dashed #38bdf8 !important;
            background: rgba(56,189,248,0.1) !important;
        }

        /* Phase C: 子資料夾 */
        .gs-fm-subfolder {
            margin-left: 14px;
            border-left: 1px solid rgba(56,189,248,0.15);
        }
        .gs-fm-subfolder .gs-fm-folder-item {
            font-size: 11.5px;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

// --- 從 storage 讀取備份 metadata + 資料夾配置 ---
let _fmFoldersCache = {};     // gs_folders
let _fmConvMapCache = {};     // gs_conv_folder_map
let _fmAcctOverride = {};     // gs_conv_account_override
let _fmDeleteTimers = {};     // 兩步刪除計時器
const _FM_FOLDERS_KEY = 'gs_folders';
const _FM_CONVMAP_KEY = 'gs_conv_folder_map';
const _FM_ACCT_OVERRIDE_KEY = 'gs_conv_account_override';

function _fmLoadData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
            const backups = [];
            for (const key in items) {
                if (!key.startsWith(STORAGE_PREFIX)) continue;
                const d = items[key];
                if (!d || !d.id) continue;
                // 用 URL 判斷是否為 Gem：/gem/ = Gem, /app/ = 原生
                const storedUrl = d.url || d.chatLink || '';
                const isGemUrl = storedUrl.includes('/gem/');
                let effectiveBotName = d.botName || 'Gemini';
                if (effectiveBotName === 'Gemini' && isGemUrl) {
                    effectiveBotName = '未知 Gem';
                }
                backups.push({
                    id: d.id,
                    title: d.title || '未命名對話',
                    botName: effectiveBotName,
                    accountEmail: d.accountEmail || null,
                    chatLink: d.chatLink || null,
                    lastUpdated: d.lastUpdated || '',
                    timestamp: d.timestamp || 0,
                    isSkeleton: (() => {
                        const rc = d.rawContent || d.content || '';
                        return !rc || rc.trim() === '(掃描匯入 - 尚未備份內容)';
                    })()
                });
            }
            backups.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            _fmBackupCache = backups;
            _fmFoldersCache = items[_FM_FOLDERS_KEY] || {};
            _fmConvMapCache = items[_FM_CONVMAP_KEY] || {};
            _fmAcctOverride = items[_FM_ACCT_OVERRIDE_KEY] || {};
            _fmCollapseState = items['gs_fm_collapse_state'] || {}; // Load collapse state
            resolve(backups);
        });
    });
}

// --- 資料夾 Storage 操作 ---
function _fmSaveFolders() {
    chrome.storage.local.set({ [_FM_FOLDERS_KEY]: _fmFoldersCache });
}
function _fmSaveConvMap() {
    chrome.storage.local.set({ [_FM_CONVMAP_KEY]: _fmConvMapCache });
}
function _fmSaveAcctOverride() {
    chrome.storage.local.set({ [_FM_ACCT_OVERRIDE_KEY]: _fmAcctOverride });
}
function _fmSaveCollapseState() {
    chrome.storage.local.set({ 'gs_fm_collapse_state': _fmCollapseState });
}

function _fmGenId() {
    return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
}

// --- 新增資料夾 (parentId 支援子資料夾, group 支援 per-group) ---
function _fmCreateFolder(email, parentId, group) {
    const name = prompt(parentId ? '📂 新增子資料夾名稱：' : '➕ 新增資料夾名稱：');
    if (!name || !name.trim()) return;
    if (!_fmFoldersCache[email]) _fmFoldersCache[email] = { folders: [] };
    const folders = _fmFoldersCache[email].folders;
    folders.push({
        id: _fmGenId(), name: name.trim(), icon: parentId ? '📂' : '📁',
        order: folders.length, parentId: parentId || null, isExpanded: true,
        group: group || 'Gemini'
    });
    _fmSaveFolders();
    _fmRenderPanel();
}

// --- Gem 群組拖曳排序 ---
function _fmReorderGroup(email, fromName, toName, container) {
    if (!_fmFoldersCache[email]) _fmFoldersCache[email] = { folders: [] };
    // 取得當前 DOM 順序
    const children = [...container.querySelectorAll('[data-gem-group]')];
    const names = children.map(c => c.dataset.gemGroup);
    const fromIdx = names.indexOf(fromName);
    const toIdx = names.indexOf(toName);
    if (fromIdx === -1 || toIdx === -1) return;
    // 移動
    names.splice(fromIdx, 1);
    names.splice(toIdx, 0, fromName);
    _fmFoldersCache[email].groupOrder = names;
    _fmSaveFolders();
    _fmRenderPanel();
}

// --- 資料夾拖曳排序 ---
function _fmReorderFolder(email, fromId, toId) {
    const folders = (_fmFoldersCache[email] && _fmFoldersCache[email].folders) || [];
    const fromIdx = folders.findIndex(f => f.id === fromId);
    const toIdx = folders.findIndex(f => f.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = folders.splice(fromIdx, 1);
    folders.splice(toIdx, 0, moved);
    _fmSaveFolders();
    _fmRenderPanel();
}

// --- 重命名資料夾（inline edit）---
function _fmRenameFolder(email, folderId, nameEl) {
    const folder = (_fmFoldersCache[email]?.folders || []).find(f => f.id === folderId);
    if (!folder) return;
    const input = document.createElement('input');
    input.className = 'gs-fm-inline-input';
    input.value = folder.name;
    input.maxLength = 30;
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();
    const commit = () => {
        const newName = input.value.trim();
        if (newName && newName !== folder.name) {
            folder.name = newName;
            _fmSaveFolders();
        }
        _fmRenderPanel();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = folder.name; input.blur(); }
    });
}

// --- 刪除資料夾（兩步刪除）---
function _fmDeleteFolder(email, folderId, folderEl) {
    const timerId = email + ':' + folderId;
    if (_fmDeleteTimers[timerId]) {
        // 第二次右鍵 → 確認刪除
        clearTimeout(_fmDeleteTimers[timerId]);
        delete _fmDeleteTimers[timerId];
        const folders = _fmFoldersCache[email]?.folders || [];
        _fmFoldersCache[email].folders = folders.filter(f => f.id !== folderId);
        // 移除 convMap 中對應的映射
        for (const convId in _fmConvMapCache) {
            if (_fmConvMapCache[convId].folderId === folderId) delete _fmConvMapCache[convId];
        }
        _fmSaveFolders();
        _fmSaveConvMap();
        _fmRenderPanel();
    } else {
        // 第一次右鍵 → 顯示確認
        folderEl.classList.add('gs-fm-delete-confirm');
        const nameEl = folderEl.querySelector('.gs-fm-name');
        const origText = nameEl.textContent;
        nameEl.textContent = '⚠️ 再按一次刪除';
        _fmDeleteTimers[timerId] = setTimeout(() => {
            delete _fmDeleteTimers[timerId];
            folderEl.classList.remove('gs-fm-delete-confirm');
            nameEl.textContent = origText;
        }, 3000);
    }
}

// --- 移動對話到資料夾 ---
function _fmMoveConv(convId, folderId, email) {
    _fmConvMapCache[convId] = { folderId, account: email };
    _fmSaveConvMap();
    _fmRenderPanel();
}

function _fmRemoveConvFromFolder(convId) {
    delete _fmConvMapCache[convId];
    _fmSaveConvMap();
    _fmRenderPanel();
}

// --- 封存/取消封存 ---
const _FM_ARCHIVED = '__archived__';
function _fmArchiveConv(convId) {
    _fmConvMapCache[convId] = { folderId: _FM_ARCHIVED };
    _fmSaveConvMap();
    _fmRenderPanel();
    showToast('♻️ 已封存');
}
function _fmUnarchiveConv(convId) {
    delete _fmConvMapCache[convId];
    _fmSaveConvMap();
    _fmRenderPanel();
    showToast('📤 已取消封存');
}
function _fmIsArchived(convId) {
    const m = _fmConvMapCache[convId];
    return m && m.folderId === _FM_ARCHIVED;
}
function _fmArchiveGroup(convs) {
    if (!convs || convs.length === 0) return;
    for (const c of convs) {
        _fmConvMapCache[c.id] = { folderId: _FM_ARCHIVED };
    }
    _fmSaveConvMap();
    _fmRenderPanel();
    showToast(`♻️ 已封存 ${convs.length} 筆對話`);
}

// --- Phase C: 拖曳輔助 ---
function _fmBindDropZone(el, opts) {
    // opts: { onDrop: fn(dragData), hoverClass }
    const hoverClass = opts.hoverClass || 'gs-fm-dragover';
    el.addEventListener('dragenter', (e) => {
        e.preventDefault();
        el.classList.add(hoverClass);
    });
    el.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    });
    el.addEventListener('dragleave', (e) => {
        // 只在真正離開元素時移除高亮（不是進入子元素時）
        if (e.relatedTarget && !el.contains(e.relatedTarget)) {
            el.classList.remove(hoverClass);
        } else if (!e.relatedTarget) {
            el.classList.remove(hoverClass);
        }
    });
    el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove(hoverClass);
        try {
            // 優先嘗試 application/json（對話拖曳用）
            let raw = e.dataTransfer.getData('application/json');
            if (raw) {
                e.stopPropagation();
                opts.onDrop(JSON.parse(raw));
                return;
            }
            // 再嘗試 text/plain（排序拖曳用）— 不 stopPropagation，讓外層 handler 處理
            raw = e.dataTransfer.getData('text/plain');
            if (raw) {
                const data = JSON.parse(raw);
                if (data.type === 'folder-reorder' || data.type === 'gem-reorder') {
                    // 不攔截，讓事件冒泡到外層 wrapper 的 drop handler
                    return;
                }
            }
        } catch (err) { console.warn('[FM] drop parse error', err); }
    });
}

// --- Phase C: 跨帳號歸類 ---
function _fmReassignAccount(convId, targetEmail) {
    if (!convId || !targetEmail) return;
    _fmAcctOverride[convId] = targetEmail;
    _fmSaveAcctOverride();
    _fmRenderPanel();
}

// --- 對話移動到其他 Gem 分組 ---
function _fmReassignGem(convId, newBotName) {
    const key = STORAGE_PREFIX + convId;
    chrome.storage.local.get(key, (res) => {
        const data = res[key];
        if (!data) return;
        data.botName = newBotName;
        chrome.storage.local.set({ [key]: data }, () => {
            _fmLoadData().then(() => _fmRenderPanel());
        });
    });
}

// --- 右鍵選單 ---
function _fmShowContextMenu(e, convId, email, group) {
    e.preventDefault();
    e.stopPropagation();
    _fmCloseContextMenu();

    const menu = document.createElement('div');
    menu.className = 'gs-fm-ctx-menu';
    menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight * 0.5) + 'px';

    const allFolders = (_fmFoldersCache[email]?.folders || []).filter(f => !group || (f.group || 'Gemini') === group);
    const currentMapping = _fmConvMapCache[convId];

    if (allFolders.length > 0) {
        const rootFolders = allFolders.filter(f => !f.parentId);
        rootFolders.forEach(f => {
            // 根資料夾
            const item = document.createElement('div');
            item.className = 'gs-fm-ctx-item';
            const isActive = currentMapping && currentMapping.folderId === f.id;
            item.innerHTML = `<span class="gs-fm-ctx-icon">${isActive ? '✅' : '📁'}</span>${_fmEscape(f.name)}`;
            item.addEventListener('click', () => {
                if (isActive) _fmRemoveConvFromFolder(convId);
                else _fmMoveConv(convId, f.id, email);
                _fmCloseContextMenu();
            });
            menu.appendChild(item);
            // 子資料夾
            allFolders.filter(sf => sf.parentId === f.id).forEach(sf => {
                const subItem = document.createElement('div');
                subItem.className = 'gs-fm-ctx-item';
                subItem.style.paddingLeft = '28px';
                const isSubActive = currentMapping && currentMapping.folderId === sf.id;
                subItem.innerHTML = `<span class="gs-fm-ctx-icon">${isSubActive ? '✅' : '📂'}</span>${_fmEscape(sf.name)}`;
                subItem.addEventListener('click', () => {
                    if (isSubActive) _fmRemoveConvFromFolder(convId);
                    else _fmMoveConv(convId, sf.id, email);
                    _fmCloseContextMenu();
                });
                menu.appendChild(subItem);
            });
        });
    }

    if (currentMapping) {
        if (allFolders.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'gs-fm-ctx-sep';
            menu.appendChild(sep);
        }
        const removeItem = document.createElement('div');
        removeItem.className = 'gs-fm-ctx-item';
        removeItem.innerHTML = '<span class="gs-fm-ctx-icon">❌</span>移回未分類';
        removeItem.addEventListener('click', () => {
            _fmRemoveConvFromFolder(convId);
            _fmCloseContextMenu();
        });
        menu.appendChild(removeItem);
    }

    if (menu.children.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'gs-fm-ctx-item';
        emptyItem.style.color = '#666';
        emptyItem.textContent = '請先新增資料夾';
        menu.appendChild(emptyItem);
    }

    // --- 移到其他 Gem 分組 ---
    const gemGroups = _fmGroupByGem(_fmBackupCache || []);
    const allGemNames = Object.keys(gemGroups);
    if (allGemNames.length > 1 || (allGemNames.length === 1 && allGemNames[0] !== group)) {
        const sep2 = document.createElement('div');
        sep2.className = 'gs-fm-ctx-sep';
        menu.appendChild(sep2);

        const label = document.createElement('div');
        label.className = 'gs-fm-ctx-item';
        label.style.cssText = 'color:#999;font-size:11px;cursor:default;padding:3px 12px;';
        label.textContent = '🔀 移到其他分組…';
        menu.appendChild(label);

        // 原生 Gemini
        if (group !== 'Gemini') {
            const geminiItem = document.createElement('div');
            geminiItem.className = 'gs-fm-ctx-item';
            geminiItem.style.paddingLeft = '24px';
            geminiItem.innerHTML = '<span class="gs-fm-ctx-icon">💙</span>原生 Gemini';
            geminiItem.addEventListener('click', () => {
                _fmReassignGem(convId, 'Gemini');
                _fmCloseContextMenu();
            });
            menu.appendChild(geminiItem);
        }

        // 其他 Gem
        allGemNames.filter(n => n !== 'Gemini' && n !== group).forEach(gemName => {
            const gemItem = document.createElement('div');
            gemItem.className = 'gs-fm-ctx-item';
            gemItem.style.paddingLeft = '24px';
            const icon = _fmGetGemIcon(gemName, email);
            gemItem.innerHTML = `<span class="gs-fm-ctx-icon">${icon}</span>${_fmEscape(gemName)}`;
            gemItem.addEventListener('click', () => {
                _fmReassignGem(convId, gemName);
                _fmCloseContextMenu();
            });
            menu.appendChild(gemItem);
        });

        // 自訂名稱
        const customItem = document.createElement('div');
        customItem.className = 'gs-fm-ctx-item';
        customItem.style.paddingLeft = '24px';
        customItem.innerHTML = '<span class="gs-fm-ctx-icon">✏️</span>自訂分組名稱…';
        customItem.addEventListener('click', () => {
            _fmCloseContextMenu();
            const name = prompt('請輸入新的 Gem/分組名稱：');
            if (name && name.trim()) {
                _fmReassignGem(convId, name.trim());
            }
        });
        menu.appendChild(customItem);
    }

    // --- ♻️ 封存/取消封存 ---
    const sepArchive = document.createElement('div');
    sepArchive.className = 'gs-fm-ctx-sep';
    menu.appendChild(sepArchive);

    if (_fmIsArchived(convId)) {
        const unarchiveItem = document.createElement('div');
        unarchiveItem.className = 'gs-fm-ctx-item';
        unarchiveItem.innerHTML = '<span class="gs-fm-ctx-icon">📤</span>取消封存';
        unarchiveItem.addEventListener('click', () => {
            _fmUnarchiveConv(convId);
            _fmCloseContextMenu();
        });
        menu.appendChild(unarchiveItem);
    } else {
        const archiveItem = document.createElement('div');
        archiveItem.className = 'gs-fm-ctx-item';
        archiveItem.innerHTML = '<span class="gs-fm-ctx-icon">♻️</span>封存對話';
        archiveItem.addEventListener('click', () => {
            _fmArchiveConv(convId);
            _fmCloseContextMenu();
        });
        menu.appendChild(archiveItem);
    }

    document.body.appendChild(menu);
    // 點其他地方關閉
    setTimeout(() => document.addEventListener('click', _fmCloseContextMenu, { once: true }), 50);
}

function _fmCloseContextMenu() {
    const old = document.querySelector('.gs-fm-ctx-menu');
    if (old) old.remove();
}

// --- 分組右鍵選單（封存整個 Gem）---
function _fmShowGroupArchiveMenu(e, convs, groupName) {
    _fmCloseContextMenu();
    if (!convs || convs.length === 0) return;

    const menu = document.createElement('div');
    menu.className = 'gs-fm-ctx-menu';
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight * 0.5) + 'px';

    const item = document.createElement('div');
    item.className = 'gs-fm-ctx-item';
    item.innerHTML = `<span class="gs-fm-ctx-icon">♻️</span>封存整個「${_fmEscape(groupName)}」(${convs.length})`;
    item.addEventListener('click', () => {
        _fmArchiveGroup(convs);
        _fmCloseContextMenu();
    });
    menu.appendChild(item);

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', _fmCloseContextMenu, { once: true }), 50);
}

// --- 資料夾右鍵選單（重命名 + 子資料夾 + 刪除）---
function _fmShowFolderContextMenu(e, email, folderId, folderEl) {
    e.preventDefault();
    e.stopPropagation();
    _fmCloseContextMenu();

    const folder = (_fmFoldersCache[email]?.folders || []).find(f => f.id === folderId);
    if (!folder) return;
    const isRoot = !folder.parentId;

    const menu = document.createElement('div');
    menu.className = 'gs-fm-ctx-menu';
    menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';

    // 重命名
    const renameItem = document.createElement('div');
    renameItem.className = 'gs-fm-ctx-item';
    renameItem.innerHTML = '<span class="gs-fm-ctx-icon">✏️</span>重新命名';
    renameItem.addEventListener('click', () => {
        _fmCloseContextMenu();
        _fmRenameFolder(email, folderId, folderEl.querySelector('.gs-fm-name'));
    });
    menu.appendChild(renameItem);

    // 新增子資料夾（只有根資料夾）
    if (isRoot) {
        const subItem = document.createElement('div');
        subItem.className = 'gs-fm-ctx-item';
        subItem.innerHTML = '<span class="gs-fm-ctx-icon">📂</span>新增子資料夾';
        subItem.addEventListener('click', () => {
            _fmCloseContextMenu();
            _fmCreateFolder(email, folderId, folder.group);
        });
        menu.appendChild(subItem);
    }

    // 分隔線
    const sep = document.createElement('div');
    sep.className = 'gs-fm-ctx-sep';
    menu.appendChild(sep);

    // 刪除（兩步確認 + cascade）
    const deleteItem = document.createElement('div');
    deleteItem.className = 'gs-fm-ctx-item';
    deleteItem.innerHTML = '<span class="gs-fm-ctx-icon">🗑️</span>刪除資料夾';
    deleteItem.style.color = '#ff6b81';
    let deleteConfirmed = false;
    deleteItem.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!deleteConfirmed) {
            // 第一次 → 顯示確認
            deleteConfirmed = true;
            deleteItem.innerHTML = '<span class="gs-fm-ctx-icon">⚠️</span>確認刪除？';
            deleteItem.style.background = 'rgba(255,100,100,0.15)';
        } else {
            // 第二次 → 執行刪除
            _fmCloseContextMenu();
            const allFolders = _fmFoldersCache[email]?.folders || [];
            const deleteIds = [folderId];
            allFolders.forEach(f => { if (f.parentId === folderId) deleteIds.push(f.id); });
            _fmFoldersCache[email].folders = allFolders.filter(f => !deleteIds.includes(f.id));
            for (const convId in _fmConvMapCache) {
                if (deleteIds.includes(_fmConvMapCache[convId].folderId)) delete _fmConvMapCache[convId];
            }
            _fmSaveFolders();
            _fmSaveConvMap();
            _fmRenderPanel();
        }
    });
    menu.appendChild(deleteItem);

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', _fmCloseContextMenu, { once: true }), 50);
}

// --- 按帳號分組（先查 override map）---
function _fmGroupByAccount(backups) {
    const groups = {};
    for (const b of backups) {
        const email = _fmAcctOverride[b.id] || b.accountEmail || '未知帳號';
        if (!groups[email]) groups[email] = [];
        groups[email].push(b);
    }
    return groups;
}

// --- 按 Gem (botName) 分組 ---
function _fmGroupByGem(backups) {
    const groups = {};
    for (const b of backups) {
        const gem = b.botName || 'Gemini';
        if (!groups[gem]) groups[gem] = [];
        groups[gem].push(b);
    }
    return groups;
}

// --- 取 Gem icon（3 層 fallback：收納盒自訂 > Icon替換面板 > emoji）---
function _fmGetGemIcon(botName, email) {
    // 1) 收納盒自訂 icon（per-account per-group）
    const groupIcons = _fmFoldersCache[email]?.groupIcons || {};
    if (groupIcons[botName]) {
        return `<img class="gs-fm-icon-img" src="${groupIcons[botName]}" alt="${_fmEscape(botName)}">`;
    }
    // 2) Icon 替換面板設定
    const settings = _cachedIconSettings || {};
    for (const key in settings) {
        const entry = settings[key];
        if (entry && typeof entry === 'object' && entry.name === botName && entry.icon) {
            return `<img class="gs-fm-icon-img" src="${entry.icon}" alt="${_fmEscape(botName)}">`;
        }
    }
    // 3) 預設 emoji
    if (botName === 'Gemini') return '💬';
    return '💜';
}

// --- 設定分組自訂 icon（檔案選擇器）---
function _fmSetGroupIcon(email, groupName) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            // 壓縮到 64x64
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 64, 64);
                const base64 = canvas.toDataURL('image/png');
                if (!_fmFoldersCache[email]) _fmFoldersCache[email] = { folders: [] };
                if (!_fmFoldersCache[email].groupIcons) _fmFoldersCache[email].groupIcons = {};
                _fmFoldersCache[email].groupIcons[groupName] = base64;
                _fmSaveFolders();
                _fmRenderPanel();
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
    input.click();
}

// --- 一鍵掃描側邊欄對話 ---
function _fmScanSidebar() {
    // 從 Gemini 原生 sidebar 讀取所有對話連結
    const links = document.querySelectorAll('a[href]');
    const conversations = [];
    const existingIds = new Set((_fmBackupCache || []).map(b => b.id));
    const seen = new Set();

    for (const link of links) {
        // 跳過我們自己的 UI 元素
        if (link.closest('.gs-fm-container') || link.closest('.gs-fm-guide-overlay')) continue;

        const href = link.getAttribute('href') || '';
        // Gemini URL 格式：/app/{convId} 或 /gem/{gemSlug}
        // convId 是長十六進位字串，gemSlug 可能含底線
        const appMatch = href.match(/\/app\/([a-f0-9]{10,})/i);
        const gemMatch = href.match(/\/gem\/([a-zA-Z0-9_-]+)/i);

        let convId, isGem;
        if (appMatch) {
            convId = appMatch[1];
            isGem = false;
        } else if (gemMatch) {
            // Gem 頁面連結，對話 ID 可能在後面的路徑
            const gemConvMatch = href.match(/\/gem\/[^/]+\/([a-f0-9]{10,})/i);
            if (gemConvMatch) {
                convId = gemConvMatch[1];
            } else {
                convId = gemMatch[1]; // 用 gem slug 當 ID
            }
            isGem = true;
        } else {
            continue;
        }

        if (existingIds.has(convId) || seen.has(convId)) continue;
        seen.add(convId);

        // 取對話標題（側邊欄顯示的文字）
        const title = (link.textContent || '').trim().split('\n')[0].trim() || '未命名對話';

        // 判斷 botName
        let botName = 'Gemini';
        if (isGem) {
            // 嘗試從 sidebar 結構找 Gem 名稱
            const parent = link.parentElement;
            const section = link.closest('section') || link.closest('[data-test-id]') || (parent ? parent.parentElement : null);
            if (section) {
                const headers = section.querySelectorAll('h2, h3, h4, [class*="title"], [class*="name"]');
                for (const h of headers) {
                    const t = h.textContent.trim();
                    if (t && t.length < 50 && t !== title) { botName = t; break; }
                }
                if (botName === 'Gemini') botName = '未知 Gem';
            } else {
                botName = '未知 Gem';
            }
        }

        const fullUrl = href.startsWith('http') ? href : 'https://gemini.google.com' + href;
        conversations.push({
            id: convId,
            title: title,
            botName: botName,
            url: fullUrl,
            isGem: isGem
        });
    }

    if (conversations.length === 0) {
        alert('✅ 側邊欄的對話已全部收錄！');
        return;
    }

    // 建立備份 skeleton 並存入 storage
    const email = detectAccountEmail() || '未知帳號';
    const toSave = {};
    for (const conv of conversations) {
        const key = STORAGE_PREFIX + conv.id;
        toSave[key] = {
            id: conv.id,
            title: conv.title,
            botName: conv.botName,
            accountEmail: email,
            chatLink: conv.url,
            url: conv.url,
            content: '(掃描匯入 - 尚未備份內容)',
            lastUpdated: new Date().toISOString(),
            timestamp: Date.now()
        };
    }

    chrome.storage.local.set(toSave, () => {
        alert(`📊 掃描完成！新增 ${conversations.length} 筆對話到收納盒。`);
        _fmLoadData().then(() => _fmRenderPanel());
    });
}

// --- 使用說明 Overlay ---
function _fmShowGuide() {
    // 移除已有的
    const existing = document.querySelector('.gs-fm-guide-overlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.className = 'gs-fm-guide-overlay';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    const panel = document.createElement('div');
    panel.className = 'gs-fm-guide-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'gs-fm-guide-header';
    header.innerHTML = '<span>📖 收納盒使用說明</span>';
    const closeBtn = document.createElement('span');
    closeBtn.className = 'gs-fm-guide-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'gs-fm-guide-body';
    body.innerHTML = `
        <h3>🗂️ 什麼是對話分類收納盒？</h3>
        <p>收納盒自動讀取【GEMINI自動備份小精靈🍀】已備份的對話，按<b>帳號</b>和<b>Gem</b>分類顯示在左側欄。</p>

        <div class="gs-fm-tip">
            ⚠️ 只有<b>已備份的對話</b>才會出現！<br>
            進入對話頁面即會自動備份，也可使用 🔍 掃描匯入標題。
        </div>

        <h3>🔘 上方按鈕</h3>
        <p>• 🔍 <b>掃描對話側邊欄</b> → 匯入未備份的對話標題+連結</p>
        <p>• 🔄 <b>重新讀取</b> → 捲動載入當前對話視窗所有訊息並重新備份</p>
        <p>• ❓ <b>使用說明</b> → 就是這個！</p>

        <div class="gs-fm-tip">
            💡 <b>第一次使用建議</b>：先打開 Gemini 側邊欄，手動下滑到底讀取完所有對話視窗後，再進行掃描和分類！
        </div>

        <h3>📧 帳號分組</h3>
        <p>自動偵測目前登入帳號，只顯示該帳號的對話。多帳號各自獨立。</p>

        <h3>📂 結構層級</h3>
        <p>① <b>原生 Gemini</b> — 非 Gem 的一般對話</p>
        <p>② <b>所有 Gem</b> — 依 Gem 名稱自動分組（支援拖曳排序）</p>
        <p>③ <b>♻️ 封存</b> — 封存的對話（依 Gem 分組顯示）</p>

        <h3>💬 基本操作</h3>
        <p>• 點擊 <b>對話</b> → 在新分頁開啟（自動偵測帳號，多帳號不跳錯）</p>
        <p>• 點擊 <b>標題列</b> → 展開/收合（狀態自動記憶）</p>
        <p>• 點擊 <b>Gem 圖示</b> → 更換自訂圖示</p>

        <h3>🖱️ 右鍵選單</h3>
        <p>• 右鍵 <b>對話</b> → 移到資料夾 / 🔀移到其他 Gem 分組 / ♻️封存</p>
        <p>• 右鍵 <b>資料夾</b> → 重新命名 / 新增子資料夾 / 刪除</p>
        <p>• 右鍵 <b>Gem 標題</b> → ♻️封存整個 Gem</p>
        <p>• 右鍵 <b>封存區 Gem</b> → 📤取消封存整個分組</p>

        <h3>📁 資料夾管理</h3>
        <p>• <b>＋ 新增資料夾</b> → 建立根資料夾</p>
        <p>• 子資料夾最多一層（📂 圖示）</p>
        <p>• 資料夾支援拖曳排序（☰ 手把）</p>

        <h3>🖱️ 拖放功能</h3>
        <p>• 拖曳<b>對話</b>到資料夾 → 直接歸類</p>
        <p>• 拖曳<b>對話</b>到帳號標題 → 回到未分類</p>
        <p>• 拖曳<b>對話</b>到♻️封存 → 直接封存</p>
        <p>• 拖曳<b>未知帳號對話</b>到其他帳號 → 跨帳號歸類</p>
        <p>• 拖曳 ☰ <b>Gem / 資料夾</b> → 排序</p>

        <h3>⚠️ 待備份標記</h3>
        <p>透過 🔍 掃描匯入的對話只有<b>標題和連結</b>，尚未備份實際內容。</p>
        <p>• 這些對話會顯示 <b>⚠️ 圖示</b>和<span style="color:#F5A8A8;">粉紅色標題</span></p>
        <p>• 點擊對話跳轉到 Gemini → 自動觸發完整備份</p>
        <p>• 備份完成後，圖示會自動從 ⚠️ 變回 💬</p>
        <div class="gs-fm-tip">
            💡 在 對話備份資料庫  中也可使用「⚠️ 只顯示待備份對話」篩選，快速找出所有待備份對話！
        </div>
    `;
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // ESC 關閉
    const escHandler = (e) => {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
}

// --- 展開/收合（含狀態記憶）---
function _fmToggle(headerEl, contentEl, stateKey) {
    const arrowEl = headerEl.querySelector('.gs-fm-arrow, .gs-fm-fold-arrow'); // 兼容兩種箭頭
    let isCollapsed = contentEl.classList.contains('gs-fm-collapsed');

    if (isCollapsed) {
        contentEl.classList.remove('gs-fm-collapsed');
        if (arrowEl) arrowEl.textContent = '▼';
        if (stateKey) _fmCollapseState[stateKey] = true;
    } else {
        contentEl.classList.add('gs-fm-collapsed');
        if (arrowEl) arrowEl.textContent = '▶';
        if (stateKey) _fmCollapseState[stateKey] = false;
    }
    if (stateKey) _fmSaveCollapseState(); // 保存狀態
}

// --- 對話跳轉（優先使用 /gem/ 格式 chatLink，否則 fallback /app/）---
function _fmOpenConversation(convId) {
    if (!convId) return;
    const accountMatch = window.location.pathname.match(/\/(u\/\d+)\//);
    const prefix = accountMatch ? accountMatch[1] + '/' : '';
    const fallbackUrl = 'https://gemini.google.com/' + prefix + 'app/' + convId;

    // ★ 方案 A：優先從 storage 取得 /gem/ 格式的 chatLink ★
    const key = STORAGE_PREFIX + convId;
    chrome.storage.local.get(key, (result) => {
        const data = result[key];
        if (data && data.chatLink && data.chatLink.includes('/gem/')) {
            // 已有 /gem/ 格式連結 → 帶入帳號前綴後使用
            let gemUrl = data.chatLink;
            if (prefix && !gemUrl.includes('/u/')) {
                gemUrl = gemUrl.replace('gemini.google.com/', 'gemini.google.com/' + prefix);
            }
            window.open(gemUrl, '_blank');
        } else {
            window.open(fallbackUrl, '_blank');
        }
    });
}

// --- 建立對話列表（含右鍵選單 + 拖曳）---
function _fmCreateConvList(convs, email, collapsed) {
    const list = document.createElement('div');
    list.className = 'gs-fm-conv-list' + (collapsed !== false ? ' gs-fm-collapsed' : '');
    for (const c of convs) {
        const item = document.createElement('div');
        item.className = 'gs-fm-conv-item';
        const convIcon = c.isSkeleton ? '⚠️' : '💬';
        const nameStyle = c.isSkeleton ? ' style="color:#F5A8A8;"' : '';
        item.title = c.isSkeleton
            ? '⚠️ 尚未備份內容 — 請開啟對話後按🔄備份\n' + c.title
            : c.title + (c.lastUpdated ? '\n' + c.lastUpdated : '');
        item.innerHTML = `<span class="gs-fm-icon">${convIcon}</span><span class="gs-fm-name"${nameStyle}>${_fmEscape(c.title)}</span>`;
        item.addEventListener('click', () => _fmOpenConversation(c.id));
        // 右鍵 → 移動到資料夾
        const convEmail = email || c.accountEmail || '未知帳號';
        item.addEventListener('contextmenu', (e) => _fmShowContextMenu(e, c.id, convEmail, c.botName));
        // Phase C: 拖曳
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            const data = { type: 'conversation', convId: c.id, title: c.title, sourceEmail: convEmail };
            e.dataTransfer.setData('application/json', JSON.stringify(data));
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('gs-fm-dragging');
        });
        item.addEventListener('dragend', () => item.classList.remove('gs-fm-dragging'));
        list.appendChild(item);
    }
    return list;
}

// --- HTML escape ---
function _fmEscape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- 主渲染函式 ---
function _fmRenderPanel() {
    // 移除舊面板
    const old = document.getElementById(_FM_CONTAINER_ID);
    if (old) old.remove();

    const backups = _fmBackupCache;
    if (!backups || backups.length === 0) return; // 沒備份就不顯示

    const accountGroups = _fmGroupByAccount(backups);

    // 建立容器
    const container = document.createElement('div');
    container.id = _FM_CONTAINER_ID;
    container.className = 'gs-fm-container';

    // Header
    const header = document.createElement('div');
    header.className = 'gs-fm-header';
    header.innerHTML = `
        <div class="gs-fm-left">
            <span class="gs-fm-emoji">🗂️</span>
            <span class="gs-fm-text">對話分類收納盒</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
            <span class="gs-fm-scan-btn" title="掃描側邊欄對話">&#128269;</span>
            <span class="gs-fm-refresh-btn" title="重新讀取對話並刷新收納盒">&#128260;</span>
            <span class="gs-fm-help-btn" title="使用說明">❓</span>
            <span class="gs-fm-arrow">▼</span>
        </div>
    `;
    // 🔄 重新讀取按鈕事件
    const refreshBtn = header.querySelector('.gs-fm-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            refreshBtn.style.animation = 'gs-fm-spin 1s linear infinite';
            showToast('📜 正在載入所有訊息...');
            scrollToLoadAllMessages().then(() => {
                saveToStorage();
                setTimeout(() => {
                    _fmLoadData().then(() => {
                        _fmRenderPanel();
                        showToast('✅ 對話已重新讀取');
                    });
                }, 2000);
            });
        });
    }
    // 掃描按鈕事件
    const scanBtn = header.querySelector('.gs-fm-scan-btn');
    if (scanBtn) {
        scanBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _fmScanSidebar();
        });
    }
    // 幫助按鈕事件（阻止冒泡，避免觸發收合）
    const helpBtn = header.querySelector('.gs-fm-help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _fmShowGuide();
        });
    }
    container.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'gs-fm-body';
    const headerStateKey = 'fm-header';
    if (_fmCollapseState[headerStateKey] === false) { // false means collapsed
        body.classList.add('gs-fm-collapsed');
        const arrowEl = header.querySelector('.gs-fm-arrow');
        if (arrowEl) arrowEl.textContent = '▶';
    }

    // 點擊 header 收合/展開 body
    header.addEventListener('click', () => _fmToggle(header, body, headerStateKey));

    // === 帳號過濾：只顯示當前登入帳號 + 未知帳號 ===
    const currentEmail = detectAccountEmail();
    let emails = Object.keys(accountGroups);
    if (currentEmail) {
        emails = emails.filter(e => e === currentEmail || e === '未知帳號');
    }
    emails.forEach((email, idx) => {
        const convs = accountGroups[email];
        const accountSection = document.createElement('div');
        accountSection.className = 'gs-fm-account';

        // 帳號 header（also a drop zone for cross-account reassignment）
        const accountHeader = document.createElement('div');
        accountHeader.className = 'gs-fm-account-header';
        accountHeader.innerHTML = `
            <span class="gs-fm-arrow">${(_fmCollapseState['acct-' + email] !== undefined ? _fmCollapseState['acct-' + email] : (idx === 0)) ? '▼' : '▶'}</span>
            <span class="gs-fm-email-icon">📧</span>
            <span class="gs-fm-email">${_fmEscape(email)}</span>
            <span class="gs-fm-count">${convs.length}</span>
        `;

        // Phase C: 帳號 header 作為 drop zone（跨帳號歸類）
        _fmBindDropZone(accountHeader, {
            hoverClass: 'gs-fm-dragover',
            onDrop: (data) => {
                if (data.type === 'conversation' && data.convId) {
                    if (data.sourceEmail && data.sourceEmail !== email) {
                        _fmReassignAccount(data.convId, email);
                    } else {
                        // 同帳號內拖回 → 移回未分類
                        _fmRemoveConvFromFolder(data.convId);
                    }
                }
            }
        });

        const accountContent = document.createElement('div');
        const acctStateKey = 'acct-' + email;
        const acctOpen = _fmCollapseState[acctStateKey] !== undefined ? _fmCollapseState[acctStateKey] : (idx === 0);
        accountContent.className = 'gs-fm-account-content' + (acctOpen ? '' : ' gs-fm-collapsed');

        accountHeader.addEventListener('click', () => _fmToggle(accountHeader, accountContent, acctStateKey));

        // --- 所有資料夾 + 對話映射 ---
        const accountFolders = _fmFoldersCache[email]?.folders || [];
        const folderConvs = {};
        for (const c of convs) {
            const mapping = _fmConvMapCache[c.id];
            if (mapping && mapping.folderId && accountFolders.some(f => f.id === mapping.folderId)) {
                if (!folderConvs[mapping.folderId]) folderConvs[mapping.folderId] = [];
                folderConvs[mapping.folderId].push(c);
            }
        }

        // --- 渲染資料夾 helper（支援兩層）---
        const renderFolderItem = (folder, isSubfolder, groupName) => {
            const fConvs = folderConvs[folder.id] || [];
            const subFolders = isSubfolder ? [] : accountFolders.filter(f => f.parentId === folder.id);
            const totalCount = fConvs.length + subFolders.reduce((s, sf) => s + (folderConvs[sf.id] || []).length, 0);

            const wrapper = document.createElement('div');
            if (isSubfolder) wrapper.className = 'gs-fm-subfolder';

            const folderEl = document.createElement('div');
            folderEl.className = 'gs-fm-folder-item';
            folderEl.innerHTML = `
                <span class="gs-fm-drag-grip" title="拖曳排序">☰</span>
                <span class="gs-fm-fold-arrow">${_fmCollapseState['folder-' + folder.id] ? '▼' : '▶'}</span>
                <span class="gs-fm-icon">${folder.icon || (isSubfolder ? '📂' : '📁')}</span>
                <span class="gs-fm-name">${_fmEscape(folder.name)}</span>
                <span class="gs-fm-badge">${totalCount}</span>
            `;
            if (!isSubfolder) {
                const addSubBtn = document.createElement('span');
                addSubBtn.textContent = '＋';
                addSubBtn.title = '新增子資料夾';
                addSubBtn.style.cssText = 'cursor:pointer;font-size:12px;color:#555;padding:0 4px;border-radius:4px;transition:color 0.15s,background 0.15s;margin-left:2px;';
                addSubBtn.addEventListener('mouseenter', () => { addSubBtn.style.color = '#38bdf8'; addSubBtn.style.background = 'rgba(56,189,248,0.1)'; });
                addSubBtn.addEventListener('mouseleave', () => { addSubBtn.style.color = '#555'; addSubBtn.style.background = 'none'; });
                addSubBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _fmCreateFolder(email, folder.id, groupName);
                });
                folderEl.appendChild(addSubBtn);
            }

            // 可摺疊的內容區（對話 + 子資料夾）
            const folderBody = document.createElement('div');
            folderBody.className = 'gs-fm-folder-body' + (_fmCollapseState['folder-' + folder.id] ? '' : ' gs-fm-collapsed');

            const convList = _fmCreateConvList(fConvs, email, false);
            folderBody.appendChild(convList);

            if (!isSubfolder) {
                subFolders.forEach(sf => folderBody.appendChild(renderFolderItem(sf, true, groupName)));
            }

            folderEl.addEventListener('click', () => {
                const folderStateKey = 'folder-' + folder.id;
                const arrow = folderEl.querySelector('.gs-fm-fold-arrow');
                if (folderBody.classList.contains('gs-fm-collapsed')) {
                    folderBody.classList.remove('gs-fm-collapsed');
                    if (arrow) arrow.textContent = '▼';
                    _fmCollapseState[folderStateKey] = true;
                } else {
                    folderBody.classList.add('gs-fm-collapsed');
                    if (arrow) arrow.textContent = '▶';
                    _fmCollapseState[folderStateKey] = false;
                }
                _fmSaveCollapseState();
            });
            folderEl.addEventListener('contextmenu', (e) => {
                _fmShowFolderContextMenu(e, email, folder.id, folderEl);
            });
            _fmBindDropZone(folderEl, {
                onDrop: (data) => {
                    if (data.type === 'conversation' && data.convId) _fmMoveConv(data.convId, folder.id, email);
                }
            });

            wrapper.appendChild(folderEl);
            wrapper.appendChild(folderBody);
            return wrapper;
        };

        // --- 渲染單一分組（對話 + 資料夾 + 新增按鈕）---
        const renderGroupContent = (groupName, groupConvs, container) => {
            // 該 group 的資料夾
            const groupFolders = accountFolders.filter(f => (f.group || 'Gemini') === groupName);
            const groupFolderedIds = new Set();
            for (const c of groupConvs) {
                const mapping = _fmConvMapCache[c.id];
                if (mapping && mapping.folderId && groupFolders.some(f => f.id === mapping.folderId)) {
                    groupFolderedIds.add(c.id);
                }
            }
            // 未歸入資料夾的對話
            const ungrouped = groupConvs.filter(c => !groupFolderedIds.has(c.id));
            if (ungrouped.length > 0) {
                const convList = _fmCreateConvList(ungrouped, email, false);
                container.appendChild(convList);
            }
            // 渲染資料夾（支援拖曳排序）
            const rootFolders = groupFolders.filter(f => !f.parentId);
            // 依 folders 陣列順序排列
            const folderArr = (_fmFoldersCache[email] && _fmFoldersCache[email].folders) || [];
            rootFolders.sort((a, b) => {
                const ia = folderArr.findIndex(f => f.id === a.id);
                const ib = folderArr.findIndex(f => f.id === b.id);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });
            rootFolders.forEach(folder => {
                const folderWrapper = renderFolderItem(folder, false, groupName);
                // 資料夾拖曳排序
                folderWrapper.draggable = true;
                folderWrapper.dataset.folderId = folder.id;
                folderWrapper.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder-reorder', folderId: folder.id, group: groupName }));
                    folderWrapper.style.opacity = '0.4';
                });
                folderWrapper.addEventListener('dragend', () => { folderWrapper.style.opacity = '1'; });
                folderWrapper.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    folderWrapper.style.borderTop = '2px solid #38bdf8';
                });
                folderWrapper.addEventListener('dragleave', () => { folderWrapper.style.borderTop = ''; });
                folderWrapper.addEventListener('drop', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    folderWrapper.style.borderTop = '';
                    try {
                        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                        if (data.type === 'folder-reorder' && data.folderId !== folder.id) {
                            _fmReorderFolder(email, data.folderId, folder.id);
                        }
                    } catch (_) { }
                });
                container.appendChild(folderWrapper);
            });
            // ＋ 新增資料夾
            const addBtn = document.createElement('div');
            addBtn.className = 'gs-fm-add-folder';
            addBtn.textContent = '＋ 新增資料夾';
            addBtn.addEventListener('click', (e) => { e.stopPropagation(); _fmCreateFolder(email, null, groupName); });
            container.appendChild(addBtn);
        };

        // --- 依 botName 自動分組 ---
        const gemGroups = _fmGroupByGem(convs);
        const gemNames = Object.keys(gemGroups);
        const actualGemNames = gemNames.filter(n => n !== 'Gemini');

        // ★ 分離封存的對話 ★
        const archivedConvs = convs.filter(c => _fmIsArchived(c.id));
        const archivedIds = new Set(archivedConvs.map(c => c.id));
        const geminiConvs = (gemGroups['Gemini'] || []).filter(c => !archivedIds.has(c.id));

        // ① 原生 Gemini
        if (geminiConvs.length > 0 || accountFolders.some(f => (f.group || 'Gemini') === 'Gemini')) {
            const geminiIcon = _fmGetGemIcon('Gemini', email);
            const geminiSection = document.createElement('div');
            const geminiHeader = document.createElement('div');
            geminiHeader.className = 'gs-fm-gem-item';
            geminiHeader.innerHTML = `
                <span class="gs-fm-icon gs-fm-icon-clickable" title="點擊更換圖示">${geminiIcon}</span>
                <span class="gs-fm-name">原生 Gemini</span>
                <span class="gs-fm-badge">${geminiConvs.length}</span>
            `;
            geminiHeader.querySelector('.gs-fm-icon-clickable').addEventListener('click', (e) => {
                e.stopPropagation();
                _fmSetGroupIcon(email, 'Gemini');
            });
            const geminiContent = document.createElement('div');
            const geminiStateKey = 'gemini-' + email;
            geminiContent.className = 'gs-fm-gem-content' + (_fmCollapseState[geminiStateKey] === false ? ' gs-fm-collapsed' : '');
            geminiHeader.addEventListener('click', () => _fmToggle(geminiHeader, geminiContent, 'gemini-' + email));
            geminiHeader.addEventListener('contextmenu', (e) => {
                e.preventDefault(); e.stopPropagation();
                _fmShowGroupArchiveMenu(e, geminiConvs, '原生 Gemini');
            });
            renderGroupContent('Gemini', geminiConvs, geminiContent);

            geminiSection.appendChild(geminiHeader);
            geminiSection.appendChild(geminiContent);
            accountContent.appendChild(geminiSection);
        }

        // ② 所有 Gem（包裹在一層裡）
        if (actualGemNames.length > 0) {
            const totalGemConvs = actualGemNames.reduce((s, n) => s + (gemGroups[n] || []).length, 0);
            const sep = document.createElement('div');
            sep.className = 'gs-fm-separator';
            accountContent.appendChild(sep);

            const allGemSection = document.createElement('div');
            const allGemHeader = document.createElement('div');
            allGemHeader.className = 'gs-fm-gem-item';
            allGemHeader.innerHTML = `
                <span class="gs-fm-icon">💜</span>
                <span class="gs-fm-name">所有 Gem</span>
                <span class="gs-fm-badge">${totalGemConvs}</span>
            `;
            const allGemContent = document.createElement('div');
            const allGemStateKey = 'allgem-' + email;
            allGemContent.className = 'gs-fm-gem-content' + (_fmCollapseState[allGemStateKey] === false ? ' gs-fm-collapsed' : '');
            allGemHeader.addEventListener('click', () => _fmToggle(allGemHeader, allGemContent, 'allgem-' + email));

            // 依照用戶自訂順序排列 Gem
            const savedOrder = (_fmFoldersCache[email] && _fmFoldersCache[email].groupOrder) || [];
            const sortedGemNames = [...actualGemNames].sort((a, b) => {
                const ia = savedOrder.indexOf(a);
                const ib = savedOrder.indexOf(b);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });

            sortedGemNames.forEach(gemName => {
                const gemConvs = (gemGroups[gemName] || []).filter(c => !archivedIds.has(c.id));
                const gemFolders = accountFolders.filter(f => (f.group || 'Gemini') === gemName);
                if (gemConvs.length === 0 && gemFolders.length === 0) return;

                const icon = _fmGetGemIcon(gemName, email);
                const gemSection = document.createElement('div');
                gemSection.style.marginLeft = '8px';
                gemSection.dataset.gemGroup = gemName;

                // Gem 拖曳排序
                gemSection.draggable = true;
                gemSection.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'gem-reorder', gemName: gemName }));
                    gemSection.style.opacity = '0.4';
                });
                gemSection.addEventListener('dragend', () => { gemSection.style.opacity = '1'; });
                gemSection.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const data = e.dataTransfer.types.includes('text/plain');
                    if (data) gemSection.style.borderTop = '2px solid #a78bfa';
                });
                gemSection.addEventListener('dragleave', () => { gemSection.style.borderTop = ''; });
                gemSection.addEventListener('drop', (e) => {
                    e.preventDefault();
                    gemSection.style.borderTop = '';
                    try {
                        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                        if (data.type === 'gem-reorder' && data.gemName !== gemName) {
                            _fmReorderGroup(email, data.gemName, gemName, allGemContent);
                        }
                    } catch (_) { }
                });

                const gemHeader = document.createElement('div');
                gemHeader.className = 'gs-fm-gem-item';
                gemHeader.innerHTML = `
                    <span class="gs-fm-drag-grip" title="拖曳排序">☰</span>
                    <span class="gs-fm-icon gs-fm-icon-clickable" title="點擊更換圖示">${icon}</span>
                    <span class="gs-fm-name">${_fmEscape(gemName)}</span>
                    <span class="gs-fm-badge">${gemConvs.length}</span>
                `;
                gemHeader.querySelector('.gs-fm-icon-clickable').addEventListener('click', (e) => {
                    e.stopPropagation();
                    _fmSetGroupIcon(email, gemName);
                });
                const gemContent = document.createElement('div');
                const gemStateKey = 'gem-' + gemName;
                gemContent.className = 'gs-fm-gem-content' + (_fmCollapseState[gemStateKey] === false ? ' gs-fm-collapsed' : '');
                gemHeader.addEventListener('click', () => _fmToggle(gemHeader, gemContent, 'gem-' + gemName));
                gemHeader.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    _fmShowGroupArchiveMenu(e, gemConvs, gemName);
                });
                renderGroupContent(gemName, gemConvs, gemContent);

                gemSection.appendChild(gemHeader);
                gemSection.appendChild(gemContent);
                allGemContent.appendChild(gemSection);
            });

            allGemSection.appendChild(allGemHeader);
            allGemSection.appendChild(allGemContent);
            accountContent.appendChild(allGemSection);
        }

        // ③ ♻️ 封存
        if (archivedConvs.length > 0) {
            const archiveSep = document.createElement('div');
            archiveSep.className = 'gs-fm-separator';
            accountContent.appendChild(archiveSep);

            const archiveSection = document.createElement('div');
            const archiveHeader = document.createElement('div');
            archiveHeader.className = 'gs-fm-gem-item';
            archiveHeader.innerHTML = `
                <span class="gs-fm-icon">♻️</span>
                <span class="gs-fm-name">封存</span>
                <span class="gs-fm-badge">${archivedConvs.length}</span>
            `;
            const archiveContent = document.createElement('div');
            const archiveStateKey = 'archive-' + email;
            archiveContent.className = 'gs-fm-gem-content' + (_fmCollapseState[archiveStateKey] === false ? ' gs-fm-collapsed' : '');
            archiveHeader.addEventListener('click', () => _fmToggle(archiveHeader, archiveContent, archiveStateKey));

            // 封存區 drop zone
            _fmBindDropZone(archiveHeader, {
                hoverClass: 'gs-fm-dragover',
                onDrop: (data) => {
                    if (data.type === 'conversation' && data.convId && !_fmIsArchived(data.convId)) {
                        _fmArchiveConv(data.convId);
                    }
                }
            });

            // 封存區內依 botName 分組顯示
            const archiveGemGroups = _fmGroupByGem(archivedConvs);
            const archiveGemNames = Object.keys(archiveGemGroups);

            archiveGemNames.forEach(gemName => {
                const gConvs = archiveGemGroups[gemName];
                if (!gConvs || gConvs.length === 0) return;
                const icon = _fmGetGemIcon(gemName, email);
                const subSection = document.createElement('div');
                subSection.style.marginLeft = '8px';
                const subHeader = document.createElement('div');
                subHeader.className = 'gs-fm-gem-item';
                subHeader.innerHTML = `
                    <span class="gs-fm-icon">${icon}</span>
                    <span class="gs-fm-name">${_fmEscape(gemName === 'Gemini' ? '原生 Gemini' : gemName)}</span>
                    <span class="gs-fm-badge">${gConvs.length}</span>
                `;
                const subContent = document.createElement('div');
                const subStateKey = 'archive-gem-' + gemName;
                subContent.className = 'gs-fm-gem-content' + (_fmCollapseState[subStateKey] === false ? ' gs-fm-collapsed' : '');
                subHeader.addEventListener('click', () => _fmToggle(subHeader, subContent, subStateKey));
                // 右鍵 → 取消封存整個分組
                subHeader.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    _fmCloseContextMenu();
                    const menu = document.createElement('div');
                    menu.className = 'gs-fm-ctx-menu';
                    menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
                    menu.style.top = Math.min(e.clientY, window.innerHeight * 0.5) + 'px';
                    const item = document.createElement('div');
                    item.className = 'gs-fm-ctx-item';
                    item.innerHTML = `<span class="gs-fm-ctx-icon">📤</span>取消封存整個「${_fmEscape(gemName === 'Gemini' ? '原生 Gemini' : gemName)}」(${gConvs.length})`;
                    item.addEventListener('click', () => {
                        for (const c of gConvs) delete _fmConvMapCache[c.id];
                        _fmSaveConvMap();
                        _fmRenderPanel();
                        showToast(`📤 已取消封存 ${gConvs.length} 筆對話`);
                        _fmCloseContextMenu();
                    });
                    menu.appendChild(item);
                    document.body.appendChild(menu);
                    setTimeout(() => document.addEventListener('click', _fmCloseContextMenu, { once: true }), 50);
                });

                const convList = _fmCreateConvList(gConvs, email, false);
                subContent.appendChild(convList);
                subSection.appendChild(subHeader);
                subSection.appendChild(subContent);
                archiveContent.appendChild(subSection);
            });

            archiveSection.appendChild(archiveHeader);
            archiveSection.appendChild(archiveContent);
            accountContent.appendChild(archiveSection);
        }

        accountSection.appendChild(accountHeader);
        accountSection.appendChild(accountContent);
        body.appendChild(accountSection);
    });

    container.appendChild(body);
    _fmPanelEl = container;

    // 插入側邊欄
    _fmInsertIntoSidebar(container);
}

// --- 插入到側邊欄 ---
function _fmInsertIntoSidebar(container) {
    // 策略 1：找 infinite-scroller 下的 .chat-history
    const chatHistory = document.querySelector('infinite-scroller .chat-history');
    if (chatHistory && chatHistory.parentNode) {
        chatHistory.parentNode.insertBefore(container, chatHistory);
        console.log('[GeminiSaver] 🗂️ 收納盒已注入側邊欄（.chat-history 之前）');
        return true;
    }
    // 策略 2：找 side-navigation 下的 infinite-scroller
    const scroller = document.querySelector('side-navigation infinite-scroller');
    if (scroller) {
        const gemsList = scroller.querySelector('.gems-list-container');
        if (gemsList && gemsList.nextSibling) {
            scroller.insertBefore(container, gemsList.nextSibling);
            console.log('[GeminiSaver] 🗂️ 收納盒已注入側邊欄（.gems-list-container 之後）');
            return true;
        }
        scroller.appendChild(container);
        console.log('[GeminiSaver] 🗂️ 收納盒已注入側邊欄（infinite-scroller 末尾）');
        return true;
    }
    return false;
}

// --- 偵測側邊欄 + 初始化 ---
function initFolderManager() {
    try {
        _fmInjectStyles();

        // 嘗試立刻插入
        _fmLoadData().then(() => {
            if (_fmInsertCheck()) return;

            // 側邊欄尚未出現，用 MutationObserver 等待
            console.log('[GeminiSaver] 🗂️ 側邊欄尚未出現，等待中...');
            let retries = 0;
            const maxRetries = 30; // 最多等 30 秒

            const checkInterval = setInterval(() => {
                retries++;
                if (_fmInsertCheck() || retries >= maxRetries) {
                    clearInterval(checkInterval);
                    if (retries >= maxRetries) {
                        console.warn('[GeminiSaver] 🗂️ 超時：未找到側邊欄');
                    }
                }
            }, 1000);
        });
    } catch (e) {
        console.error('[GeminiSaver] 🗂️ 收納盒初始化失敗:', e);
    }
}

function _fmInsertCheck() {
    if (document.getElementById(_FM_CONTAINER_ID)) return true; // 已存在
    const target = document.querySelector('infinite-scroller .chat-history')
        || document.querySelector('side-navigation infinite-scroller');
    if (!target) return false;
    _fmRenderPanel();
    return !!document.getElementById(_FM_CONTAINER_ID);
}

// --- SPA 導航時重新檢查 ---
function _fmOnNavigation() {
    // 重新載入資料並渲染
    setTimeout(() => {
        _fmLoadData().then(() => {
            _fmRenderPanel();
        });
    }, 1500); // 延遲讓新頁面 DOM 穩定
}

