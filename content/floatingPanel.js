// content/floatingPanel.js — 浮動控制面板
// 依賴：globals.js (showToast, getConversationId), main.js (startAutoDownloadTimer, startAutoRefreshTimer, saveToStorage, scrollToLoadAllMessages, formatContent)
// 依賴：iconReplace.js (createIconPanel)

// ==========================================
// ★★★ v10.0.0 新功能：浮動控制面板 ★★★
// ==========================================

let _fpPanelOpen = false;
let _fpCtrlEnterEnabled = false;
let _fpCtrlEnterListener = null;

// ==========================================
// CSS 注入
// ==========================================
function _fpInjectStyles() {
    if (document.getElementById('gs-fp-styles')) return;
    const style = document.createElement('style');
    style.id = 'gs-fp-styles';
    style.textContent = `
        /* === FAB === */
        #gs-fp-fab {
            position: fixed;
            top: 24px;
            right: 24px;
            width: 48px;
            height: 48px;
            border-radius: 8px;
            cursor: grab;
            z-index: 99999;
            box-shadow: 0 4px 16px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.1);
            transition: box-shadow 0.2s, transform 0.15s;
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
        }
        #gs-fp-fab:hover {
            box-shadow: 0 6px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15);
            transform: scale(1.08);
        }
        #gs-fp-fab:active {
            cursor: grabbing;
        }
        #gs-fp-fab img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            pointer-events: none;
        }

        /* === Panel === */
        #gs-fp-panel {
            position: fixed;
            width: 320px;
            max-height: calc(100vh - 100px);
            overflow-y: auto;
            background: linear-gradient(135deg, #fff5f9 0%, #fef9ff 50%, #f5f0ff 100%);
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
            z-index: 99998;
            font-family: 'Segoe UI', Tahoma, sans-serif;
            font-size: 13px;
            color: #333;
            opacity: 0;
            transform: translateY(-12px) scale(0.95);
            pointer-events: none;
            transition: opacity 0.25s ease, transform 0.25s ease;
            border: 1px solid rgba(232, 164, 201, 0.3);
        }
        #gs-fp-panel.gs-fp-open {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
        }

        /* === Panel Header === */
        .gs-fp-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 14px 8px;
            border-bottom: 1px solid rgba(232, 164, 201, 0.2);
            background: linear-gradient(135deg, rgba(232,164,201,0.15), rgba(200,125,168,0.08));
            border-radius: 16px 16px 0 0;
        }
        .gs-fp-header-title {
            font-weight: bold;
            font-size: 14px;
            color: #3D3350;
        }
        .gs-fp-header-ver {
            font-size: 10px;
            color: #999;
        }
        .gs-fp-close-btn {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #999;
            padding: 0 2px;
            line-height: 1;
        }
        .gs-fp-close-btn:hover {
            color: #E8A4C9;
        }

        /* === Quick Actions === */
        .gs-fp-quick-actions {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            padding: 10px 14px;
            border-bottom: 1px solid rgba(232, 164, 201, 0.15);
        }
        .gs-fp-quick-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
            padding: 8px 4px;
            border: none;
            background: rgba(255,255,255,0.7);
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.15s;
            font-size: 10px;
            color: #555;
        }
        .gs-fp-quick-btn:hover {
            background: rgba(232, 164, 201, 0.2);
            transform: translateY(-1px);
        }
        .gs-fp-quick-btn .gs-fp-qicon {
            font-size: 20px;
        }

        /* === Card sections === */
        .gs-fp-card {
            margin: 8px 10px;
            padding: 10px 12px;
            background: rgba(255,255,255,0.85);
            border-radius: 10px;
            border: 1px solid rgba(232, 164, 201, 0.12);
        }
        .gs-fp-card-title {
            font-size: 11px;
            font-weight: bold;
            color: #3D3350;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        /* === Settings rows === */
        .gs-fp-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
            font-size: 12px;
        }
        .gs-fp-row:last-child {
            margin-bottom: 0;
        }
        .gs-fp-row-label {
            color: #555;
            flex: 1;
        }
        .gs-fp-row-input {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .gs-fp-num-input {
            width: 42px;
            padding: 3px 4px;
            border: 1px solid #ddd;
            border-radius: 6px;
            text-align: center;
            font-size: 12px;
            background: #fafafa;
        }
        .gs-fp-num-input:focus {
            outline: none;
            border-color: #E8A4C9;
        }
        .gs-fp-ts-label {
            font-size: 10px;
            color: #1967d2;
            background: #e8f0fe;
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
        }

        /* === Toggle switch === */
        .gs-fp-toggle {
            position: relative;
            width: 34px;
            height: 18px;
            flex-shrink: 0;
        }
        .gs-fp-toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .gs-fp-toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #ddd;
            transition: 0.25s;
            border-radius: 18px;
        }
        .gs-fp-toggle-slider:before {
            content: "";
            position: absolute;
            height: 14px;
            width: 14px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: 0.25s;
            border-radius: 50%;
        }
        .gs-fp-toggle input:checked + .gs-fp-toggle-slider {
            background-color: #E8A4C9;
        }
        .gs-fp-toggle input:checked + .gs-fp-toggle-slider:before {
            transform: translateX(16px);
        }

        /* === Current page info === */
        .gs-fp-page-title {
            font-weight: bold;
            font-size: 13px;
            color: #1a73e8;
            word-break: break-word;
            margin-bottom: 4px;
        }
        .gs-fp-page-info {
            font-size: 10px;
            color: #888;
            margin-bottom: 6px;
        }
        .gs-fp-dl-btn {
            width: 100%;
            padding: 6px;
            border: none;
            background: linear-gradient(135deg, #E8A4C9, #C77DA8);
            color: white;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            transition: all 0.15s;
        }
        .gs-fp-dl-btn:hover {
            background: linear-gradient(135deg, #C77DA8, #A8608F);
            transform: translateY(-1px);
        }

        /* === Tip box === */
        .gs-fp-tip {
            font-size: 10px;
            color: #b06000;
            background: #fff8e1;
            padding: 6px 8px;
            border-radius: 6px;
            border-left: 3px solid #ffb74d;
            margin-top: 6px;
            line-height: 1.4;
        }

        /* === Footer === */
        .gs-fp-footer {
            text-align: center;
            padding: 6px 14px 10px;
            font-size: 10px;
            color: #bbb;
        }
        .gs-fp-footer a {
            color: #ff9ff3;
            text-decoration: none;
        }
        .gs-fp-footer a:hover {
            text-decoration: underline;
        }

        /* === Scrollbar === */
        #gs-fp-panel::-webkit-scrollbar {
            width: 4px;
        }
        #gs-fp-panel::-webkit-scrollbar-thumb {
            background: rgba(232, 164, 201, 0.3);
            border-radius: 4px;
        }

        /* === Clipboard Modal === */
        #gs-fp-clipboard-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85);
            z-index: 100000;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        #gs-fp-clipboard-box {
            background: #2f3640;
            color: white;
            padding: 20px;
            border-radius: 20px;
            width: 95%;
            max-width: 900px;
            max-height: 90vh;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            gap: 12px;
            border: 1px solid #444;
        }
        .gs-fp-cb-header {
            margin: 0;
            border-bottom: 1px solid #444;
            padding-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 16px;
            font-weight: bold;
        }
        .gs-fp-cb-header-hint {
            font-size: 12px;
            color: #aaa;
            font-weight: normal;
        }
        .gs-fp-cb-cat-row {
            display: flex;
            gap: 6px;
            align-items: center;
            flex-wrap: wrap;
            padding: 4px 0;
        }
        .gs-fp-cb-cat-btn {
            padding: 4px 12px;
            border-radius: 14px;
            border: none;
            font-size: 12px;
            cursor: pointer;
            font-weight: bold;
            transition: 0.2s;
        }
        .gs-fp-cb-search {
            width: 100%;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid #555;
            background: #1e272e;
            color: #fff;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
        }
        .gs-fp-cb-scroll {
            display: flex;
            flex-direction: column;
            gap: 12px;
            overflow-y: auto;
            flex: 1;
            padding-right: 5px;
            max-height: 55vh;
        }
        .gs-fp-cb-scroll::-webkit-scrollbar {
            width: 4px;
        }
        .gs-fp-cb-scroll::-webkit-scrollbar-thumb {
            background: rgba(232, 164, 201, 0.3);
            border-radius: 4px;
        }
        .gs-fp-cb-row {
            background: #1e272e;
            padding: 12px;
            border-radius: 10px;
        }
        .gs-fp-cb-row-header {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
            align-items: center;
        }
        .gs-fp-cb-cat-tag {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: bold;
            white-space: nowrap;
            color: #1e272e;
        }
        .gs-fp-cb-title-input {
            flex: 1;
            background: transparent;
            border: none;
            border-bottom: 1px solid #555;
            color: #fff;
            padding: 5px;
            outline: none;
            font-size: 13px;
        }
        .gs-fp-cb-select {
            padding: 3px 6px;
            border-radius: 6px;
            border: 1px solid #555;
            background: #2f3640;
            color: #fff;
            font-size: 11px;
            cursor: pointer;
            outline: none;
        }
        .gs-fp-cb-content {
            width: 100%;
            height: 70px;
            background: #2f3640;
            color: #dfe6e9;
            border: 1px solid #555;
            border-radius: 8px;
            padding: 8px;
            box-sizing: border-box;
            resize: vertical;
            outline: none;
            font-size: 13px;
            line-height: 1.5;
        }
        .gs-fp-cb-btn {
            padding: 6px 14px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            transition: 0.2s;
            color: white;
        }
        .gs-fp-cb-btn:hover {
            filter: brightness(1.15);
        }
        .gs-fp-cb-footer {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding-top: 10px;
            border-top: 1px solid #444;
        }
        .gs-fp-cb-add-cat {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: 2px dashed #666;
            background: transparent;
            color: #888;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }
    `;
    document.head.appendChild(style);
}

// ==========================================
// FAB 建立 + 拖曳
// ==========================================
function _fpCreateFAB() {
    if (document.getElementById('gs-fp-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'gs-fp-fab';

    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('icon.png');
    img.alt = 'GeminiSaver Fairy';
    img.draggable = false;
    fab.appendChild(img);
    document.body.appendChild(fab);

    // 讀取記憶位置（chrome.storage 非同步）
    chrome.storage.local.get('gs_fab_position', (result) => {
        if (result.gs_fab_position) {
            try {
                const pos = result.gs_fab_position;
                fab.style.top = pos.top + 'px';
                fab.style.right = 'auto';
                fab.style.left = pos.left + 'px';
            } catch (_) { }
        }
    });

    // 拖曳邏輯
    let isDragging = false;
    let wasDragged = false;
    let startX, startY, startLeft, startTop;

    fab.addEventListener('mousedown', (e) => {
        isDragging = true;
        wasDragged = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = fab.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        fab.style.transition = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDragged = true;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // 邊界限制
        const maxLeft = window.innerWidth - 48;
        const maxTop = window.innerHeight - 48;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        fab.style.left = newLeft + 'px';
        fab.style.top = newTop + 'px';
        fab.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        fab.style.transition = '';

        // 記憶位置（chrome.storage）
        const rect = fab.getBoundingClientRect();
        chrome.storage.local.set({
            gs_fab_position: {
                left: rect.left,
                top: rect.top
            }
        });

        // 如果沒有拖曳 → toggle 面板
        if (!wasDragged) {
            _fpTogglePanel();
        }
    });
}

// ==========================================
// Toggle 面板
// ==========================================
function _fpTogglePanel() {
    const panel = document.getElementById('gs-fp-panel');
    if (!panel) return;
    _fpPanelOpen = !_fpPanelOpen;
    panel.classList.toggle('gs-fp-open', _fpPanelOpen);

    if (_fpPanelOpen) {
        _fpPositionPanel();
        _fpRefreshPageInfo();
    }
}

function _fpPositionPanel() {
    const fab = document.getElementById('gs-fp-fab');
    const panel = document.getElementById('gs-fp-panel');
    if (!fab || !panel) return;

    const fabRect = fab.getBoundingClientRect();
    const panelWidth = 320;

    // 面板頂部 = FAB 底部 + 8px 間隔
    let top = fabRect.bottom + 8;
    let left = fabRect.right - panelWidth;

    // 邊界修正
    if (left < 8) left = 8;
    if (left + panelWidth > window.innerWidth - 8) left = window.innerWidth - panelWidth - 8;
    if (top + 400 > window.innerHeight) {
        // 放不下 → 改往上彈出
        top = fabRect.top - 400 - 8;
        if (top < 8) top = 8;
    }

    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
}

// ==========================================
// 建立面板 DOM
// ==========================================
function _fpCreatePanel() {
    if (document.getElementById('gs-fp-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'gs-fp-panel';

    panel.innerHTML = `
        <!-- Header -->
        <div class="gs-fp-header">
            <div>
                <span class="gs-fp-header-title">GeminiSaver Fairy</span>
                <span class="gs-fp-header-ver" id="gs-fp-ver"></span>
            </div>
            <button class="gs-fp-close-btn" id="gs-fp-close">✕</button>
        </div>

        <!-- Quick Actions -->
        <div class="gs-fp-quick-actions">
            <button class="gs-fp-quick-btn" id="gs-fp-btn-dashboard" title="開啟GeminiSaver Fairy 對話備份資料庫">
                <span class="gs-fp-qicon">📚</span>
                <span>資料庫</span>
            </button>
            <button class="gs-fp-quick-btn" id="gs-fp-btn-icon" title="GEM ICON 替換設定">
                <span class="gs-fp-qicon">📸</span>
                <span>ICON</span>
            </button>
            <button class="gs-fp-quick-btn" id="gs-fp-btn-clipboard" title="Prompt 萬用剪貼簿">
                <span class="gs-fp-qicon">📋</span>
                <span>剪貼簿</span>
            </button>
            <button class="gs-fp-quick-btn" id="gs-fp-btn-reload" title="重新讀取對話">
                <span class="gs-fp-qicon">🔄</span>
                <span>重新讀取</span>
            </button>

        </div>

        <!-- Settings Card -->
        <div class="gs-fp-card">
            <div class="gs-fp-card-title">⚙️ 設定</div>



            <div class="gs-fp-row">
                <span class="gs-fp-row-label">⌨️ Ctrl+Enter 傳送</span>
                <div class="gs-fp-row-input">
                    <label class="gs-fp-toggle">
                        <input type="checkbox" id="gs-fp-ctrl-enter-toggle">
                        <span class="gs-fp-toggle-slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <!-- Current Page Card -->
        <div class="gs-fp-card" id="gs-fp-page-card" style="display:none;">
            <div class="gs-fp-card-title">📄 當前頁面</div>
            <div class="gs-fp-page-title" id="gs-fp-page-title">載入中...</div>
            <div class="gs-fp-page-info" id="gs-fp-page-info">--</div>
            <button class="gs-fp-dl-btn" id="gs-fp-dl-btn">💾 下載當前 (.txt)</button>
        </div>
    `;

    document.body.appendChild(panel);

    // ★ 動態注入版本號 ★
    const verEl = document.getElementById('gs-fp-ver');
    if (verEl) verEl.textContent = 'v' + GS_VERSION;

    // 關閉按鈕
    document.getElementById('gs-fp-close').addEventListener('click', () => {
        _fpPanelOpen = false;
        panel.classList.remove('gs-fp-open');
    });

    // 點擊面板外關閉
    document.addEventListener('click', (e) => {
        if (!_fpPanelOpen) return;
        const fab = document.getElementById('gs-fp-fab');
        if (panel.contains(e.target) || fab.contains(e.target)) return;
        _fpPanelOpen = false;
        panel.classList.remove('gs-fp-open');
    });
}

// ==========================================
// Quick Actions 事件
// ==========================================
function _fpInitQuickActions() {
    // 📚 Dashboard
    document.getElementById('gs-fp-btn-dashboard')?.addEventListener('click', () => {
        const targetUrl = chrome.runtime.getURL('dashboard.html');
        chrome.runtime.sendMessage({ action: 'openTab', url: targetUrl });
    });

    // 📸 Icon 設定面板
    document.getElementById('gs-fp-btn-icon')?.addEventListener('click', () => {
        if (typeof createIconPanel === 'function') {
            createIconPanel();
        }
        _fpTogglePanel(); // 收合浮動面板
    });

    // 📋 剪貼簿 → 開啟前台 Prompt 萬用剪貼簿
    document.getElementById('gs-fp-btn-clipboard')?.addEventListener('click', () => {
        _fpShowClipboardManager();
    });

    // 🔄 重新讀取
    document.getElementById('gs-fp-btn-reload')?.addEventListener('click', () => {
        if (typeof scrollToLoadAllMessages === 'function') {
            showToast('🔄 正在重新讀取對話...');
            scrollToLoadAllMessages().then(() => {
                if (typeof saveToStorage === 'function') saveToStorage();
                showToast('✅ 重新讀取完成！');
            });
        }
    });

}

// (每日備份設定已移至 popup.html)

// ==========================================
// ⌨️ Ctrl+Enter 傳送
// ==========================================
function _fpInitCtrlEnter() {
    const toggle = document.getElementById('gs-fp-ctrl-enter-toggle');
    if (!toggle) return;

    // 讀取設定
    chrome.storage.local.get('gs_ctrl_enter_enabled', (r) => {
        _fpCtrlEnterEnabled = !!r.gs_ctrl_enter_enabled;
        toggle.checked = _fpCtrlEnterEnabled;
        if (_fpCtrlEnterEnabled) _fpAttachCtrlEnterListener();
    });

    toggle.addEventListener('change', () => {
        _fpCtrlEnterEnabled = toggle.checked;
        chrome.storage.local.set({ gs_ctrl_enter_enabled: _fpCtrlEnterEnabled });
        if (_fpCtrlEnterEnabled) {
            _fpAttachCtrlEnterListener();
            showToast('⌨️ Ctrl+Enter 傳送已開啟');
        } else {
            _fpDetachCtrlEnterListener();
            showToast('⌨️ Ctrl+Enter 傳送已關閉');
        }
    });
}

function _fpAttachCtrlEnterListener() {
    if (_fpCtrlEnterListener) return; // 已掛載

    _fpCtrlEnterListener = (e) => {
        if (!_fpCtrlEnterEnabled) return;
        if (e.key !== 'Enter') return;

        // 只在 Gemini 輸入區域攔截
        const target = e.target;
        const isGeminiInput = target?.closest('.ql-editor, [contenteditable="true"]');
        if (!isGeminiInput) return;

        if (e.ctrlKey || e.metaKey) {
            // Ctrl+Enter → 傳送
            e.preventDefault();
            e.stopImmediatePropagation();
            // 找到傳送按鈕並點擊
            const sendBtn = document.querySelector('button.send-button, button[aria-label="傳送訊息"], button[aria-label="Send message"], button[data-at-shortcutkeys]');
            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
            } else {
                // fallback: 模擬原始 Enter 行為
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });
                // 暫時關閉攔截
                _fpCtrlEnterEnabled = false;
                target.dispatchEvent(enterEvent);
                _fpCtrlEnterEnabled = true;
            }
        } else if (!e.shiftKey) {
            // 純 Enter → 變成換行（Shift+Enter 行為）
            e.preventDefault();
            e.stopImmediatePropagation();

            // 插入換行
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const br = document.createElement('br');
                range.insertNode(br);
                // 移動游標到 br 後面
                range.setStartAfter(br);
                range.setEndAfter(br);
                selection.removeAllRanges();
                selection.addRange(range);
                // 觸發 input 事件讓 Gemini 知道內容變了
                target.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
        // Shift+Enter → 不攔截，保持原有行為
    };

    document.addEventListener('keydown', _fpCtrlEnterListener, true); // capture phase
}

function _fpDetachCtrlEnterListener() {
    if (_fpCtrlEnterListener) {
        document.removeEventListener('keydown', _fpCtrlEnterListener, true);
        _fpCtrlEnterListener = null;
    }
}

// ==========================================
// 當前頁面資訊
// ==========================================
function _fpRefreshPageInfo() {
    const card = document.getElementById('gs-fp-page-card');
    const titleEl = document.getElementById('gs-fp-page-title');
    const infoEl = document.getElementById('gs-fp-page-info');
    if (!card || !titleEl || !infoEl) return;

    const convId = typeof getConversationId === 'function' ? getConversationId() : null;
    if (!convId) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    const storageKey = `backup_${convId}`;

    chrome.storage.local.get(storageKey, (result) => {
        const data = result[storageKey];
        if (data) {
            const bName = data.botName || 'Gemini';
            titleEl.innerText = `${bName} — ${data.title}`;
            infoEl.innerText = `最後更新: ${data.lastUpdated || '--'}`;

            const dlBtn = document.getElementById('gs-fp-dl-btn');
            if (dlBtn) {
                dlBtn.onclick = () => {
                    const formatted = typeof formatContent === 'function' ? formatContent(data) : data.rawContent || '';
                    _fpDownloadFile(formatted, `${bName}-${data.title}`);
                };
            }
        } else {
            titleEl.innerText = '尚未備份';
            infoEl.innerText = '請稍候或重新整理頁面';
        }
    });
}

function _fpDownloadFile(content, title) {
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}_手動下載.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 200);
}

// ==========================================
// ℹ️ 關於對話框
// ==========================================
function _fpShowAboutDialog() {
    // 移除既有
    document.getElementById('gs-fp-about-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gs-fp-about-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:100000;display:flex;justify-content:center;align-items:center;';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#2f3640;color:white;padding:25px;border-radius:20px;width:85%;max-width:400px;text-align:center;display:flex;flex-direction:column;gap:12px;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid #444;';

    modal.innerHTML = `
        <h3 style="border-bottom:1px solid #444;padding-bottom:15px;margin:0;">ℹ️ 關於本工具</h3>
        <p style="font-size:14px;color:#aaa;margin:10px 0;">GeminiSaver Fairy 自動備份小精靈 v${GS_VERSION}</p>
        <p style="font-size:13px;color:#888;margin:0;">by <a href="https://www.threads.com/@minijinai75" target="_blank" style="color:#FFB7C5;text-decoration:none;">⚡minijinai75</a></p>
    `;

    const btnStyle = 'width:100%;padding:10px;border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:bold;transition:0.2s;color:white;';

    const notionBtn = document.createElement('button');
    notionBtn.style.cssText = btnStyle + 'background:#6c5ce7;';
    notionBtn.textContent = '📖 使用說明 & 更新紀錄';
    notionBtn.onclick = () => window.open('https://minijinai75.notion.site/geminisaver-fairy', '_blank');

    const marshmallowBtn = document.createElement('button');
    marshmallowBtn.style.cssText = btnStyle + 'background:#e17055;';
    marshmallowBtn.textContent = '💌 棉花糖 (問題回報/許願)';
    marshmallowBtn.onclick = () => window.open('https://marshmallow-qa.com/g5cbtosuz5fj93n', '_blank');

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = btnStyle + 'background:#555;margin-top:5px;';
    closeBtn.textContent = '關閉';
    closeBtn.onclick = () => overlay.remove();

    modal.append(notionBtn, marshmallowBtn, closeBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// ==========================================
// ★★★ Prompt 萬用剪貼簿 (前台版) ★★★
// ==========================================
const _FP_STORAGE_CLIPBOARD = 'gemini_clipboard_data';
const _FP_STORAGE_CATEGORIES = 'gemini_vault_categories';
const _FP_STORAGE_LOCKS = 'gemini_vault_locks';
const _FP_DEFAULT_CATEGORIES = ['角色設定', '系統指令', '對話模板', '咒語', '其他'];
const _FP_DEFAULT_CAT_COLORS = {
    '角色設定': '#E8A4C9', '系統指令': '#A7C7E7',
    '對話模板': '#B4E7CE', '咒語': '#FFCBA4', '其他': '#C8BFD4'
};

function _fpGetCatColor(name) {
    if (_FP_DEFAULT_CAT_COLORS[name]) return _FP_DEFAULT_CAT_COLORS[name];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return `hsl(${Math.abs(hash) % 360}, 60%, 75%)`;
}

function _fpShowClipboardManager() {
    // 移除既有
    document.getElementById('gs-fp-clipboard-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gs-fp-clipboard-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const box = document.createElement('div');
    box.id = 'gs-fp-clipboard-box';

    // Header
    const header = document.createElement('div');
    header.className = 'gs-fp-cb-header';
    header.innerHTML = `<span>💡 Prompt萬用剪貼簿</span><span class="gs-fp-cb-header-hint">右鍵連擊兩次刪除｜左鍵連擊兩次上鎖</span>`;
    box.appendChild(header);

    // 讀取資料
    chrome.storage.local.get([_FP_STORAGE_CLIPBOARD, _FP_STORAGE_CATEGORIES, _FP_STORAGE_LOCKS], (result) => {
        let clipData;
        try { clipData = JSON.parse(result[_FP_STORAGE_CLIPBOARD] || '[]'); } catch (e) { clipData = []; }
        if (!Array.isArray(clipData) || clipData.length === 0) {
            clipData = [{ title: '', content: '', category: '其他' }];
        }
        clipData.forEach(item => { if (!item.category) item.category = '其他'; });

        let userCategories;
        try {
            const s = JSON.parse(result[_FP_STORAGE_CATEGORIES] || 'null');
            userCategories = (Array.isArray(s) && s.length > 0) ? s : [..._FP_DEFAULT_CATEGORIES];
        } catch (e) {
            userCategories = [..._FP_DEFAULT_CATEGORIES];
        }

        let lockedCats;
        try {
            const s = JSON.parse(result[_FP_STORAGE_LOCKS] || '[]');
            lockedCats = Array.isArray(s) ? s : [];
        } catch (e) {
            lockedCats = [];
        }

        let filterCategory = '全部';
        let filterText = '';

        // 分類列
        const catRow = document.createElement('div');
        catRow.className = 'gs-fp-cb-cat-row';

        function renderCatRow() {
            catRow.innerHTML = '';
            const allBtn = document.createElement('button');
            allBtn.textContent = '全部';
            allBtn.className = 'gs-fp-cb-cat-btn';
            allBtn.style.cssText = filterCategory === '全部' ? 'background:#fff;color:#1e272e;' : 'background:#444;color:#ccc;';
            allBtn.onclick = () => { filterCategory = '全部'; renderCatRow(); renderFields(); };
            catRow.appendChild(allBtn);

            userCategories.forEach(cat => {
                const cc = _fpGetCatColor(cat);
                const isLocked = lockedCats.includes(cat);
                const b = document.createElement('button');
                b.textContent = (isLocked ? '🔒 ' : '') + cat;
                b.className = 'gs-fp-cb-cat-btn';
                const normalBg = filterCategory === cat ? `background:${cc};color:#1e272e;` : `background:#444;color:${cc};`;
                const borderStyle = isLocked ? `border:2px solid #FFD700;` : '';
                b.style.cssText = normalBg + borderStyle;
                b.onclick = () => { filterCategory = cat; renderCatRow(); renderFields(); };

                // 雙擊上鎖/解鎖
                b.ondblclick = (ev) => {
                    ev.preventDefault();
                    if (isLocked) {
                        lockedCats = lockedCats.filter(c => c !== cat);
                        showToast(`🔓 「${cat}」已解鎖`);
                    } else {
                        lockedCats.push(cat);
                        showToast(`🔒 「${cat}」已上鎖，無法刪除`);
                    }
                    chrome.storage.local.set({ [_FP_STORAGE_LOCKS]: JSON.stringify(lockedCats) });
                    renderCatRow();
                };

                // 右鍵刪除分類
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
                        b.style.cssText = 'padding:4px 12px;border-radius:14px;border:2px solid #ff4444;font-size:12px;cursor:pointer;font-weight:bold;background:#ff4444;color:white;';
                        deleteTimer = setTimeout(() => {
                            pendingDelete = false;
                            b.textContent = (isLocked ? '🔒 ' : '') + cat;
                            b.style.cssText = normalBg + borderStyle;
                        }, 3000);
                    } else {
                        clearTimeout(deleteTimer);
                        pendingDelete = false;
                        clipData.forEach(it => { if (it.category === cat) it.category = '其他'; });
                        userCategories = userCategories.filter(c => c !== cat);
                        lockedCats = lockedCats.filter(c => c !== cat);
                        chrome.storage.local.set({
                            [_FP_STORAGE_CATEGORIES]: JSON.stringify(userCategories),
                            [_FP_STORAGE_LOCKS]: JSON.stringify(lockedCats)
                        });
                        if (filterCategory === cat) filterCategory = '全部';
                        showToast(`🗑️ 已刪除分類「${cat}」`);
                        renderCatRow(); renderFields();
                    }
                };

                catRow.appendChild(b);
            });

            // 新增分類按鈕
            const addCatBtn = document.createElement('button');
            addCatBtn.textContent = '+';
            addCatBtn.title = '新增自訂分類';
            addCatBtn.className = 'gs-fp-cb-add-cat';
            addCatBtn.onclick = () => {
                const name = prompt('請輸入新分類名稱：');
                if (!name || !name.trim()) return;
                const t = name.trim();
                if (userCategories.includes(t)) { showToast('⚠️ 此分類已存在'); return; }
                userCategories.push(t);
                chrome.storage.local.set({ [_FP_STORAGE_CATEGORIES]: JSON.stringify(userCategories) });
                renderCatRow(); renderFields();
                showToast(`✅ 已新增分類「${t}」`);
            };
            catRow.appendChild(addCatBtn);
        }
        box.appendChild(catRow);

        // 搜尋
        const searchBox = document.createElement('input');
        searchBox.type = 'text';
        searchBox.placeholder = '🔍 搜尋 Prompt...';
        searchBox.className = 'gs-fp-cb-search';
        searchBox.oninput = () => { filterText = searchBox.value; renderFields(); };
        box.appendChild(searchBox);

        // 內容列表
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'gs-fp-cb-scroll';

        function renderFields() {
            scrollContainer.innerHTML = '';
            const filtered = clipData.filter((item) => {
                if (filterCategory !== '全部' && item.category !== filterCategory) return false;
                if (filterText) {
                    const q = filterText.toLowerCase();
                    return (item.title || '').toLowerCase().includes(q) || (item.content || '').toLowerCase().includes(q);
                }
                return true;
            });

            if (filtered.length === 0) {
                const empty = document.createElement('p');
                empty.style.cssText = 'text-align:center; color:#888; font-size:13px; padding:20px;';
                empty.textContent = (filterText || filterCategory !== '全部') ? '沒有符合的 Prompt' : '還沒有任何 Prompt，點下方「新增」開始！';
                scrollContainer.appendChild(empty);
                return;
            }

            filtered.forEach((item) => {
                const realIndex = clipData.indexOf(item);
                const row = document.createElement('div');
                row.className = 'gs-fp-cb-row';
                const catColor = _fpGetCatColor(item.category);
                row.style.borderLeft = `4px solid ${catColor}`;

                const rowHeader = document.createElement('div');
                rowHeader.className = 'gs-fp-cb-row-header';

                const catTag = document.createElement('span');
                catTag.className = 'gs-fp-cb-cat-tag';
                catTag.style.background = catColor;
                catTag.textContent = item.category || '其他';

                const titleInput = document.createElement('input');
                titleInput.type = 'text';
                titleInput.placeholder = '標題 (可不填寫)';
                titleInput.value = item.title || '';
                titleInput.className = 'gs-fp-cb-title-input';
                titleInput.oninput = () => { clipData[realIndex].title = titleInput.value; };

                const catSelect = document.createElement('select');
                catSelect.className = 'gs-fp-cb-select';
                userCategories.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    opt.textContent = cat;
                    if (cat === item.category) opt.selected = true;
                    catSelect.appendChild(opt);
                });
                catSelect.onchange = () => {
                    clipData[realIndex].category = catSelect.value;
                    catTag.textContent = catSelect.value;
                    const nc = _fpGetCatColor(catSelect.value);
                    catTag.style.background = nc;
                    row.style.borderLeftColor = nc;
                };

                // 複製按鈕
                const copyBtn = document.createElement('button');
                copyBtn.className = 'gs-fp-cb-btn';
                copyBtn.style.background = '#6c5ce7';
                copyBtn.textContent = '📋';
                copyBtn.title = '複製內容';
                copyBtn.onclick = () => {
                    if (!contentArea.value) { showToast('內容是空的！'); return; }
                    navigator.clipboard.writeText(contentArea.value).then(() => {
                        const orig = copyBtn.textContent;
                        copyBtn.textContent = '✅';
                        copyBtn.style.background = '#20bf6b';
                        setTimeout(() => { copyBtn.textContent = orig; copyBtn.style.background = '#6c5ce7'; }, 1500);
                    }).catch(() => showToast('❌ 複製失敗'));
                };

                // 刪除按鈕
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'gs-fp-cb-btn';
                deleteBtn.style.background = '#ee5a24';
                deleteBtn.textContent = '✕';
                deleteBtn.onclick = () => {
                    if (clipData.length <= 1) { showToast('⚠️ 至少需保留一個欄位！'); return; }
                    if (confirm(`確定刪除「${item.title || '未命名'}」？`)) {
                        clipData.splice(realIndex, 1);
                        renderFields();
                    }
                };

                rowHeader.append(catTag, titleInput, catSelect, copyBtn, deleteBtn);

                const contentArea = document.createElement('textarea');
                contentArea.placeholder = '在此貼上指令、角色設定或咒語...';
                contentArea.value = item.content || '';
                contentArea.className = 'gs-fp-cb-content';
                contentArea.oninput = () => { clipData[realIndex].content = contentArea.value; };

                row.append(rowHeader, contentArea);
                scrollContainer.appendChild(row);
            });
        }

        renderCatRow();
        renderFields();

        // 底部按鈕
        const footer = document.createElement('div');
        footer.className = 'gs-fp-cb-footer';

        const addBtn = document.createElement('button');
        addBtn.className = 'gs-fp-cb-btn';
        addBtn.style.background = '#0984e3';
        addBtn.textContent = '➕ 新增 Prompt';
        addBtn.onclick = () => {
            clipData.push({ title: '', content: '', category: filterCategory !== '全部' ? filterCategory : '其他' });
            filterText = '';
            searchBox.value = '';
            renderFields();
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        };

        const rightBtns = document.createElement('div');
        rightBtns.style.cssText = 'display:flex; gap:10px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'gs-fp-cb-btn';
        cancelBtn.style.background = '#555';
        cancelBtn.textContent = '取消';
        cancelBtn.onclick = () => overlay.remove();

        const saveBtn = document.createElement('button');
        saveBtn.className = 'gs-fp-cb-btn';
        saveBtn.style.background = '#6c5ce7';
        saveBtn.textContent = '💾 儲存並關閉';
        saveBtn.onclick = () => {
            const filteredData = clipData.filter(item => item.title.trim() !== '' || item.content.trim() !== '');
            const finalData = filteredData.length > 0 ? filteredData : [{ title: '', content: '', category: '其他' }];
            chrome.storage.local.set({ [_FP_STORAGE_CLIPBOARD]: JSON.stringify(finalData) });
            showToast('✅ Prompt萬用剪貼簿 已儲存');
            overlay.remove();
        };

        rightBtns.append(cancelBtn, saveBtn);
        footer.append(addBtn, rightBtns);
        box.append(scrollContainer, footer);
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// ==========================================
// 公開入口函式
// ==========================================
function initFloatingPanel() {
    try {
        _fpInjectStyles();
        _fpCreateFAB();
        _fpCreatePanel();
        _fpInitQuickActions();
        _fpInitCtrlEnter();
        _fpRefreshPageInfo();
        console.log('[GeminiSaver] ✨ 浮動控制面板已初始化');
    } catch (e) {
        console.error('[GeminiSaver] 浮動控制面板初始化失敗:', e);
    }
}
