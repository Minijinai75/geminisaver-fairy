// content/globals.js — 全域變數 + 共用工具函式
// 載入順序：globals → watermark → folderManager → iconReplace → main

// === 版本號（唯一來源：manifest.json）===
const GS_VERSION = chrome.runtime.getManifest().version;

// === 全域變數 ===
let saveDebounceTimer = null;
let lastContentHash = '';
let isSaving = false;
let _isCleaningText = false; // ★ getCleanText 執行中標記（防止 Observer 遞迴）★
let autoDownloadInterval;
let autoRefreshInterval;
const DEBUG_MODE = false;
const SEPARATOR = "\n\n---\n\n";

// === 設定常數 ===
const STORAGE_PREFIX = "backup_";


// === Icon 替換常數 ===
const ICON_MARK = 'data-icon-swapped';
const ICON_STORAGE_KEY = 'gem_icon_settings';
const ICON_SIZE_KEY = 'gem_icon_size_percent';
const BACKUP_CLOUD_TOAST_KEY = 'gs_backup_cloud_icon_enabled';
const GENERAL_TOAST_KEY = 'gs_general_toast_enabled';
const ERROR_TOAST_KEY = 'gs_error_toast_enabled';
let iconPanelVisible = false;
let _iconSizePercent = 200; // 預設 200%
let _backupCloudToastEnabled = false; // 方案 C：預設關閉
let _generalToastEnabled = true;
let _errorToastEnabled = true;
let lastGemId = null;

chrome.storage.local.get([BACKUP_CLOUD_TOAST_KEY, GENERAL_TOAST_KEY, ERROR_TOAST_KEY], (result) => {
    _backupCloudToastEnabled = result[BACKUP_CLOUD_TOAST_KEY] === true;
    _generalToastEnabled = result[GENERAL_TOAST_KEY] !== false;
    _errorToastEnabled = result[ERROR_TOAST_KEY] !== false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[BACKUP_CLOUD_TOAST_KEY]) {
        _backupCloudToastEnabled = changes[BACKUP_CLOUD_TOAST_KEY].newValue === true;
    }
    if (changes[GENERAL_TOAST_KEY]) {
        _generalToastEnabled = changes[GENERAL_TOAST_KEY].newValue !== false;
    }
    if (changes[ERROR_TOAST_KEY]) {
        _errorToastEnabled = changes[ERROR_TOAST_KEY].newValue !== false;
    }
});

// ★★★ requestIdleCallback 相容性 ★★★
const rIC = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));

// ★★★ 共用常數：預設標題（防 document.title 污染）★★★
const DEFAULT_TITLES = ['Gemini', 'Gemini - Google', 'Google Gemini', 'Google Gemini - Gemini'];

// ==========================================
// ★★★ v10.0.0 新功能：Tab 標題同步 ★★★
// ==========================================
function syncTabTitle() {
    try {
        const convId = getConversationId();
        if (!convId) return;
        // 方法 1：從 sidebar 找到匹配的對話標題
        const sidebarLinks = document.querySelectorAll('a[href]');
        for (const link of sidebarLinks) {
            if (link.href && link.href.includes('/' + convId)) {
                const titleSpan = link.querySelector('.conversation-title');
                if (titleSpan && titleSpan.innerText.trim()) {
                    const convTitle = titleSpan.innerText.trim();
                    if (document.title !== convTitle + ' - Gemini') {
                        document.title = convTitle + ' - Gemini';
                    }
                    return;
                }
            }
        }
        // 方法 2：從 document.title 取得（若非預設值）
        const docTitle = document.title || '';
        if (docTitle && !DEFAULT_TITLES.includes(docTitle) && !docTitle.includes(' - Gemini')) {
            document.title = docTitle + ' - Gemini';
        }
    } catch (e) { /* 靜默失敗 */ }
}

// ==========================================
// ★★★ v10.0.0 新功能：Markdown 粗體修復 ★★★
// ==========================================
function injectMarkdownFix() {
    if (document.getElementById('gemini-md-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'gemini-md-fix-style';
    // Gemini 會在粗體文字中間注入 <span> 元素，導致 **text** 被打斷
    // 這段 CSS 確保 model-response 中的粗體樣式不受影響
    style.textContent = `
        model-response .markdown strong,
        model-response .markdown b {
            font-weight: 700 !important;
        }
        model-response .markdown em,
        model-response .markdown i {
            font-style: italic !important;
        }
        /* 修復被 span 打斷的粗體：確保 strong 內的 span 繼承粗體 */
        model-response .markdown strong span,
        model-response .markdown b span {
            font-weight: inherit !important;
        }
        model-response .markdown em span,
        model-response .markdown i span {
            font-style: inherit !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
}

// ==========================================
// ★★★ v10.0.0 新功能：帳號 Email 偵測 ★★★
// ==========================================
function detectAccountEmail() {
    try {
        // 方法 1：Google 帳號按鈕的 aria-label 中含有 email
        const accountBtn = document.querySelector('a[aria-label*="@"]');
        if (accountBtn) {
            const match = accountBtn.getAttribute('aria-label').match(/[\w.+-]+@[\w.-]+/)
            if (match) return match[0];
        }
        // 方法 2：帳號選單中的 data-email 屬性
        const emailEl = document.querySelector('[data-email]');
        if (emailEl) return emailEl.getAttribute('data-email');
        // 方法 3：帳號圖片附近的文字
        const profileLinks = document.querySelectorAll('a[href*="accounts.google.com"]');
        for (const link of profileLinks) {
            const text = link.textContent || link.getAttribute('aria-label') || '';
            const match = text.match(/[\w.+-]+@[\w.-]+/);
            if (match) return match[0];
        }
    } catch (e) { /* 靜默失敗 */ }
    return null;
}

function getChatLink(convId) {
    if (!convId) return null;
    // 使用目前頁面的完整 URL 作為 Chat Link
    return window.location.href;
}

// ==========================================
// ★★★ v10.0.0 新功能：引用回覆 ★★★
// ==========================================
let _quoteBtn = null;
let _quoteText = '';

function initQuoteReply() {
    document.addEventListener('mouseup', (e) => {
        // 如果點擊的是引用按鈕本身，不要處理
        if (_quoteBtn && _quoteBtn.contains(e.target)) return;

        // 只在 model-response 區域內觸發
        const responseEl = e.target.closest('model-response, .response-container, .model-response-text');
        if (!responseEl) {
            removeQuoteBtn();
            return;
        }
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        if (!text || text.length < 2) {
            removeQuoteBtn();
            return;
        }
        _quoteText = text;
        showQuoteBtn(e.clientX, e.clientY);
    });

    // 點擊其他地方時移除按鈕
    document.addEventListener('mousedown', (e) => {
        if (_quoteBtn && !_quoteBtn.contains(e.target)) {
            removeQuoteBtn();
        }
    });
}

function showQuoteBtn(x, y) {
    removeQuoteBtn();
    const btn = document.createElement('button');
    btn.textContent = '💬 引用';
    btn.setAttribute('data-geminisaver-quote', 'true');
    btn.style.cssText = `
        position: fixed;
        left: ${Math.min(x, window.innerWidth - 100)}px;
        top: ${Math.max(y - 40, 10)}px;
        z-index: 99998;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: transform 0.15s, opacity 0.2s;
        opacity: 0;
        transform: translateY(5px);
    `;
    document.body.appendChild(btn);
    // 動畫淡入
    requestAnimationFrame(() => {
        btn.style.opacity = '1';
        btn.style.transform = 'translateY(0)';
    });

    // 使用 mousedown 而非 click，避免被 mouseup 搶先移除
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const textToQuote = _quoteText;
        setTimeout(() => {
            insertQuoteToInput(textToQuote);
            removeQuoteBtn();
        }, 50);
    });

    _quoteBtn = btn;
}

function removeQuoteBtn() {
    if (_quoteBtn) {
        _quoteBtn.remove();
        _quoteBtn = null;
        _quoteText = '';
    }
}

function insertQuoteToInput(text) {
    // 格式化為 blockquote
    const quotedLines = text.split('\n').map(line => '> ' + line).join('\n');
    const quoteBlock = quotedLines + '\n\n';

    // 找到 Gemini 輸入框（rich-textarea 優先）
    const inputEl = document.querySelector('rich-textarea [contenteditable="true"]') ||
        document.querySelector('.ql-editor[contenteditable="true"]') ||
        document.querySelector('[contenteditable="true"][role="textbox"]') ||
        document.querySelector('.input-area [contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"]');

    if (!inputEl) {
        // Fallback：找不到輸入框，複製到剪貼簿
        navigator.clipboard.writeText(quoteBlock).then(() => {
            showToast('💬 引用已複製！請 Ctrl+V 貼到輸入框');
        }).catch(() => {
            showToast('❌ 無法複製引用文字');
        });
        return;
    }

    // ★ DOM Range 直接插入方案（參考 Gemini Voyager）★
    try {
        inputEl.focus();
        const sel = window.getSelection();

        // 判斷現有內容是否為空
        const existingText = (inputEl.textContent || '').trim();
        const insertText = existingText.length === 0 ? quoteBlock : '\n' + quoteBlock;

        // 把游標移到內容最後
        const range = document.createRange();
        range.selectNodeContents(inputEl);
        range.collapse(false); // collapse 到末端
        sel.removeAllRanges();
        sel.addRange(range);

        // 用 createTextNode + Range.insertNode 直接插入
        const textNode = document.createTextNode(insertText);
        const currentRange = sel.getRangeAt(0);
        currentRange.insertNode(textNode);

        // 游標移到插入文字之後
        currentRange.setStartAfter(textNode);
        currentRange.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(currentRange);

        // 觸發 input 事件，讓 Gemini 感知內容變化
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));

        // 確保 focus
        inputEl.focus();
        setTimeout(() => inputEl.focus(), 50);

        showToast('💬 引用已插入');
    } catch (err) {
        // DOM 插入失敗時，fallback 到剪貼簿
        navigator.clipboard.writeText(quoteBlock).then(() => {
            showToast('💬 引用已複製！請 Ctrl+V 貼上');
        }).catch(() => {
            showToast('❌ 無法複製引用文字');
        });
    }
}

// ==========================================
// ★★★ 共用工具：取得對話 ID ★★★
// ==========================================
function getConversationId() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(p => p.length > 0);
    const lastPart = parts[parts.length - 1];
    if (lastPart && /^[a-zA-Z0-9_]+$/.test(lastPart) && lastPart !== 'app') {
        return lastPart;
    }
    return null;
}

// ==========================================
// ★★★ 共用工具：Toast 通知 ★★★
// ==========================================
let toastTimeout = null;
function _getToastStyle(isBackupCloudToast) {
    if (isBackupCloudToast) {
        return "position:fixed; top:10px; left:50%; right:auto; transform:translateX(-50%); background:rgba(0,0,0,0.35); color:white; padding:2px 6px; border-radius:10px; font-size:12px; line-height:1; z-index:99999; opacity:0; transition:opacity 0.2s; box-shadow:none; font-weight:600; pointer-events:none;";
    }
    return "position:fixed; top:10px; left:50%; right:auto; transform:translateX(-50%); background:rgba(0,0,0,0.82); color:white; padding:6px 10px; border-radius:12px; font-size:12px; line-height:1.2; z-index:99999; opacity:0; transition:opacity 0.25s; box-shadow:0 2px 10px rgba(0,0,0,0.25); font-weight:700; pointer-events:none;";
}

function _isErrorToast(msg, options = {}) {
    if (options.level === 'error') return true;
    return /^❌/.test(msg) || msg.includes('錯誤') || msg.includes('失敗');
}

function showToast(msg, options = {}) {
    try {
        const isBackupCloudToast = options.type === 'backup-cloud';
        const isErrorToast = _isErrorToast(msg, options);

        if (isBackupCloudToast && !_backupCloudToastEnabled) return;
        if (!isBackupCloudToast && isErrorToast && !_errorToastEnabled) return;
        if (!isBackupCloudToast && !isErrorToast && !_generalToastEnabled) return;

        if (!document.body) return;
        let toast = document.getElementById("gemini-saver-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "gemini-saver-toast";
            document.body.appendChild(toast);
        }
        toast.style.cssText = _getToastStyle(isBackupCloudToast);
        toast.innerText = msg;
        toast.style.opacity = "1";
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => { toast.style.opacity = "0"; }, isBackupCloudToast ? 700 : 1500);
    } catch (e) { /* 靜默失敗 */ }
}
