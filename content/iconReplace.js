// content/iconReplace.js — Icon 替換 + SPA 導航 + 設定面板
// 依賴：globals.js (ICON_*, showToast, syncTabTitle, SEPARATOR), folderManager.js (_fmOnNavigation)

// ★★★ 舊格式轉換工具 (向後相容 - 強化版) ★★★
function migrateOldSeparator(content) {
    if (!content) return content;
    if (content.includes("--------------------")) {
        content = content.replace(/\n{1,4}-{20,}\n{1,4}/g, SEPARATOR);
    }
    content = content.replace(/\n{3,}-{3,19}\n{3,}/g, SEPARATOR);
    return content;
}

// ==========================================
// Icon 替換功能 (原 v2.2.0 整合)
// ==========================================

function getCurrentGemId() {
    const path = window.location.pathname;
    const match = path.match(/\/gem\/([^\/]+)/);
    if (match && match[1]) return match[1];
    return 'default';
}

function getCurrentGemName() {
    let el = document.querySelector('.bot-name-text');
    if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
    el = document.querySelector('.bot-name');
    if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
    el = document.querySelector('bot-list-item[selected] .bot-name')
        || document.querySelector('bot-list-item.selected .bot-name');
    if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
    const h2s = document.querySelectorAll('h2');
    for (let i = 0; i < h2s.length; i++) {
        const txt = h2s[i].innerText || '';
        if (txt.indexOf(' said') > -1) return txt.replace(' said', '').trim();
    }
    el = document.querySelector('[data-test-id="bot-name"]');
    if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
    const gemId = getCurrentGemId();
    if (gemId === 'default') return 'Gemini';
    return 'Gem ' + gemId.substring(0, 6);
}

function loadIconSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(ICON_STORAGE_KEY, (result) => {
            try {
                const raw = result[ICON_STORAGE_KEY] || '{}';
                resolve(typeof raw === 'string' ? JSON.parse(raw) : raw);
            } catch (e) { resolve({}); }
        });
    });
}

function loadIconSettingsSync() {
    // 使用快取的同步版本
    return _cachedIconSettings || {};
}
let _cachedIconSettings = {};

// 啟動時預載入 icon 設定
chrome.storage.local.get([ICON_STORAGE_KEY, ICON_SIZE_KEY], (result) => {
    try {
        const raw = result[ICON_STORAGE_KEY] || '{}';
        _cachedIconSettings = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) { _cachedIconSettings = {}; }
    if (result[ICON_SIZE_KEY]) _iconSizePercent = parseInt(result[ICON_SIZE_KEY]) || 200;
});

// 監聽 storage 變化，保持快取同步
chrome.storage.onChanged.addListener((changes) => {
    if (changes[ICON_STORAGE_KEY]) {
        try {
            const raw = changes[ICON_STORAGE_KEY].newValue || '{}';
            _cachedIconSettings = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e) { _cachedIconSettings = {}; }
    }
    if (changes[ICON_SIZE_KEY]) {
        _iconSizePercent = parseInt(changes[ICON_SIZE_KEY].newValue) || 200;
    }
});

function saveIconSettings(settings) {
    _cachedIconSettings = settings;
    chrome.storage.local.set({ [ICON_STORAGE_KEY]: JSON.stringify(settings) });
}

function getIconForGem(gemId) {
    const settings = loadIconSettingsSync();
    const val = settings[gemId];
    if (val) {
        if (typeof val === 'string') return val;
        return val.icon || null;
    }
    const currentName = getCurrentGemName();
    if (currentName && currentName !== 'Gemini') {
        const keys = Object.keys(settings);
        for (let i = 0; i < keys.length; i++) {
            const entry = settings[keys[i]];
            if (entry && typeof entry === 'object' && entry.name === currentName) {
                return entry.icon || null;
            }
        }
    }
    return null;
}

function getNameForGem(gemId, settings) {
    const val = settings[gemId];
    if (!val) return null;
    if (typeof val === 'string') return null;
    return val.name || null;
}

function getThumbForGem(gemId, settings) {
    const val = settings[gemId];
    if (!val) return null;
    if (typeof val === 'string') return val;
    return val.icon || null;
}

function setIconForGem(gemId, base64) {
    const settings = loadIconSettingsSync();
    const name = getCurrentGemName();
    settings[gemId] = { icon: base64, name: name };
    saveIconSettings(settings);
}

function removeIconForGem(gemId) {
    const settings = loadIconSettingsSync();
    delete settings[gemId];
    saveIconSettings(settings);
}

function getUserAvatarUrl() {
    const img = document.querySelector('img.gbii')
        || document.querySelector('img.gb_Q')
        || document.querySelector('a[aria-label*="Google"] img[src*="googleusercontent"]')
        || document.querySelector('img[src*="googleusercontent.com/a/"]')
        || document.querySelector('img[src*="googleusercontent.com/ogw/"]');
    if (img && img.src) return img.src;
    return null;
}

function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function (ev) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const size = 128;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const sw = img.width, sh = img.height;
            const side = Math.min(sw, sh);
            const sx = (sw - side) / 2, sy = (sh - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
            try {
                callback(canvas.toDataURL('image/jpeg', 0.8));
            } catch (canvasErr) {
                console.warn('[Icon] canvas.toDataURL 失敗:', canvasErr);
                callback(ev.target.result);
            }
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

// === Icon 替換邏輯 ===
function getReplacementUrl() {
    const gemId = getCurrentGemId();
    if (gemId === 'default') return null; // ★ 原生 Gemini 不替換 Icon ★
    const customIcon = getIconForGem(gemId);
    return customIcon || null; // ★ 沒設定 → 不替換，保持原樣 ★
}

function swapAvatar(bardAvatar) {
    if (bardAvatar.getAttribute(ICON_MARK)) return false;
    const parent = bardAvatar.closest('model-response');
    if (!parent) return false;
    const replacementUrl = getReplacementUrl();
    if (!replacementUrl) return false;
    const targetContainer = bardAvatar.querySelector('bot-logo')
        || bardAvatar.querySelector('.avatar_primary_animation')
        || bardAvatar.querySelector('.avatar_primary_model')
        || bardAvatar.querySelector('.avatar_primary')
        || bardAvatar.querySelector('.avatar-container');
    if (!targetContainer) return false;
    const children = targetContainer.children;
    for (let i = 0; i < children.length; i++) children[i].style.display = 'none';
    const childNodes = targetContainer.childNodes;
    for (let j = 0; j < childNodes.length; j++) {
        if (childNodes[j].nodeType === 3) childNodes[j].textContent = '';
    }
    const replacement = document.createElement('img');
    replacement.src = replacementUrl;
    replacement.setAttribute(ICON_MARK, '1');
    const sz = _iconSizePercent + '%';
    replacement.style.cssText = `width:${sz};height:${sz};object-fit:cover;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:block;`;
    targetContainer.style.position = 'relative';
    targetContainer.style.overflow = 'visible';
    targetContainer.appendChild(replacement);
    bardAvatar.setAttribute(ICON_MARK, '1');
    return true;
}

function replaceAllIcons() {
    if (iconPanelVisible) return;
    let count = 0;
    const bardAvatars = document.querySelectorAll('bard-avatar');
    for (let i = 0; i < bardAvatars.length; i++) {
        if (swapAvatar(bardAvatars[i])) count++;
    }
    if (count > 0 && DEBUG_MODE) console.log('[Icon] 替換了 ' + count + ' 個 icon');
}

function reapplyAllIcons() {
    const marked = document.querySelectorAll('img[' + ICON_MARK + ']');
    for (let i = 0; i < marked.length; i++) marked[i].parentNode.removeChild(marked[i]);
    const avatars = document.querySelectorAll('bard-avatar[' + ICON_MARK + ']');
    for (let j = 0; j < avatars.length; j++) avatars[j].removeAttribute(ICON_MARK);
    const hidden = document.querySelectorAll('bard-avatar [style*="display: none"], bard-avatar [style*="display:none"]');
    for (let k = 0; k < hidden.length; k++) hidden[k].style.display = '';
    replaceAllIcons();
}

// === SPA 導航偵測 ===
function onNavigation() {
    const currentId = getCurrentGemId();
    if (lastGemId !== null && currentId !== lastGemId) {
        if (DEBUG_MODE) console.log('[Icon] Gem 切換: ' + lastGemId + ' → ' + currentId);
        reapplyAllIcons();
    }
    lastGemId = currentId;
    setTimeout(replaceAllIcons, 500);
    // ★ v10.0.0: 導航時同步 Tab 標題 ★
    setTimeout(syncTabTitle, 800);
    // ★ v10.0.0: 收納盒 SPA 導航重新渲染 ★
    _fmOnNavigation();
    // ★ 方案 B：SPA 導航後觸發備份重試（修正 /app/ → /gem/ 時 botName 錯誤）★
    setTimeout(debouncedSave, 1500);
}

(function wrapHistoryMethods() {
    ['pushState', 'replaceState'].forEach(methodName => {
        const wrapFlag = '__multiTool_wrapped_' + methodName;
        if (history[wrapFlag]) return;
        const original = history[methodName];
        history[methodName] = function () {
            const result = original.apply(this, arguments);
            onNavigation();
            return result;
        };
        history[wrapFlag] = true;
    });
    window.addEventListener('popstate', onNavigation);
})();

// === Icon 設定面板 (全螢幕居中 Overlay + 裁剪工具) ===
function createIconPanel() {
    const existing = document.getElementById('gem-icon-overlay');
    if (existing) { existing.remove(); iconPanelVisible = false; return; }

    iconPanelVisible = true;
    const gemId = getCurrentGemId();
    const gemName = getCurrentGemName();
    const currentIcon = getIconForGem(gemId);
    const settings = loadIconSettingsSync();
    const gemKeys = Object.keys(settings);

    const IC = {
        primary: '#E8A4C9', primaryDark: '#C77DA8',
        bg: '#2D2B3D', bgLight: '#3D3A52', bgPanel: '#1E1D2B',
        text: '#EEEDF5', textSub: '#A09CB6',
        success: '#66D9A0', danger: '#FF6B81', border: '#4A4762'
    };

    // ★ 全螢幕半透明背景 ★
    const overlay = document.createElement('div');
    overlay.id = 'gem-icon-overlay';
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:999997; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);';

    // 點背景關閉
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.remove(); iconPanelVisible = false; }
    });

    // ESC 關閉
    const escHandler = (e) => {
        if (e.key === 'Escape') { overlay.remove(); iconPanelVisible = false; document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    // ★ 居中面板 ★
    const panel = document.createElement('div');
    panel.id = 'gem-icon-panel';
    panel.style.cssText = `width:380px; max-height:80vh; background:${IC.bg}; border:1px solid ${IC.border}; border-radius:16px; box-shadow:0 12px 48px rgba(0,0,0,0.6); overflow:hidden; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:${IC.text}; font-size:13px; animation:gemIconFadeIn 0.2s ease;`;

    // 動畫
    if (!document.getElementById('gem-icon-anim-style')) {
        const animStyle = document.createElement('style');
        animStyle.id = 'gem-icon-anim-style';
        animStyle.textContent = '@keyframes gemIconFadeIn { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }';
        document.head.appendChild(animStyle);
    }

    // Header
    const header = document.createElement('div');
    header.style.cssText = `background:linear-gradient(135deg, ${IC.primary}, ${IC.primaryDark}); padding:14px 16px; display:flex; justify-content:space-between; align-items:center;`;
    const headerTitle = document.createElement('span');
    headerTitle.style.cssText = 'font-weight:bold; font-size:14px;';
    headerTitle.textContent = '📷 Icon 設定';
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'cursor:pointer; font-size:16px; opacity:0.8; padding:4px;';
    closeBtn.onclick = () => { overlay.remove(); iconPanelVisible = false; document.removeEventListener('keydown', escHandler); };
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.style.cssText = `padding:16px; overflow-y:auto; max-height:calc(80vh - 50px);`;

    // Gem info
    const gemInfo = document.createElement('div');
    gemInfo.style.cssText = `background:${IC.bgLight}; padding:12px; border-radius:10px; margin-bottom:14px;`;
    const gemLabel = document.createElement('div');
    gemLabel.style.cssText = `color:${IC.textSub}; font-size:11px; margin-bottom:4px;`;
    gemLabel.textContent = '目前 Gem';
    const gemValue = document.createElement('div');
    gemValue.style.cssText = 'font-weight:bold; font-size:14px;';
    gemValue.textContent = gemName + (gemId !== 'default' ? ' (' + gemId.substring(0, 8) + ')' : '');
    gemInfo.appendChild(gemLabel); gemInfo.appendChild(gemValue); content.appendChild(gemInfo);

    // Preview
    const previewBox = document.createElement('div');
    previewBox.style.cssText = 'text-align:center; margin-bottom:14px;';
    const previewLabel = document.createElement('div');
    previewLabel.style.cssText = `color:${IC.textSub}; font-size:11px; margin-bottom:8px;`;
    previewLabel.textContent = currentIcon ? '目前自訂 Icon' : '尚未設定（使用預設頭像）';
    const previewImg = document.createElement('div');
    previewImg.style.cssText = `width:80px; height:80px; border-radius:50%; margin:0 auto; border:3px solid ${IC.border}; overflow:hidden; background:${IC.bgLight}; display:flex; align-items:center; justify-content:center;`;
    if (currentIcon) {
        const img = document.createElement('img');
        img.src = currentIcon;
        img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
        previewImg.appendChild(img);
    } else {
        const fallbackUrl = getUserAvatarUrl();
        if (fallbackUrl) {
            const fbImg = document.createElement('img');
            fbImg.src = fallbackUrl;
            fbImg.style.cssText = 'width:100%; height:100%; object-fit:cover; opacity:0.5;';
            previewImg.appendChild(fbImg);
        } else { previewImg.textContent = '👤'; previewImg.style.fontSize = '28px'; }
    }
    previewBox.appendChild(previewLabel); previewBox.appendChild(previewImg); content.appendChild(previewBox);

    // ★★★ 裁剪區域（隱藏，上傳後顯示）★★★
    const cropArea = document.createElement('div');
    cropArea.id = 'gem-icon-crop-area';
    cropArea.style.cssText = 'display:none; text-align:center; margin-bottom:14px;';
    content.appendChild(cropArea);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; justify-content:center;';

    const createPanelBtn = (text, color) => {
        const btn = document.createElement('button');
        btn.innerText = text;
        btn.style.cssText = `background:${color}; color:${IC.text}; border:none; padding:8px 15px; border-radius:20px; cursor:pointer; font-size:13px; box-shadow:0 3px 6px rgba(0,0,0,0.2); font-weight:bold; transition:transform 0.1s, background 0.2s; white-space:nowrap;`;
        btn.onmouseenter = () => { btn.style.transform = 'scale(1.05)'; };
        btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
        return btn;
    };

    const uploadBtn = createPanelBtn('📤 上傳圖片', IC.primary);
    // ★ 原生 Gemini 不支援 Icon 替換 ★
    if (gemId === 'default') {
        uploadBtn.style.opacity = '0.4';
        uploadBtn.style.cursor = 'not-allowed';
        uploadBtn.onclick = () => showToast('⚠️ 請先進入 Gem 對話頁面');
        const notGemHint = document.createElement('div');
        notGemHint.style.cssText = `color:${IC.danger}; font-size:11px; text-align:center; margin-bottom:10px;`;
        notGemHint.textContent = '⚠️ 目前不在 Gem 頁面，Icon 替換僅支援 Gem 對話';
        content.appendChild(notGemHint);
    } else {
        uploadBtn.onclick = () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                showCropUI(file, cropArea, btnRow, IC);
            };
            input.click();
        };
    }
    btnRow.appendChild(uploadBtn);

    if (currentIcon) {
        const resetBtn = createPanelBtn('🗑 重設', IC.danger);
        resetBtn.onclick = () => {
            removeIconForGem(getCurrentGemId());
            reapplyAllIcons();
            showToast('🗑 已重設為預設頭像');
            overlay.remove(); iconPanelVisible = false;
            document.removeEventListener('keydown', escHandler);
            createIconPanel();
        };
        btnRow.appendChild(resetBtn);
    }
    content.appendChild(btnRow);

    // Compress note
    const compressNote = document.createElement('div');
    compressNote.style.cssText = `color:${IC.textSub}; font-size:10px; text-align:center; margin-bottom:14px; line-height:1.4;`;
    compressNote.textContent = '📦 上傳後可裁剪，最終壓縮為 128×128 JPEG';
    content.appendChild(compressNote);

    // ★ Icon 大小滑桿 ★
    const sizeSection = document.createElement('div');
    sizeSection.style.cssText = `background:${IC.bgLight}; padding:12px; border-radius:10px; margin-bottom:14px;`;
    const sizeLabel = document.createElement('div');
    sizeLabel.style.cssText = `color:${IC.textSub}; font-size:11px; margin-bottom:8px; display:flex; justify-content:space-between;`;
    const sizeLabelText = document.createElement('span');
    sizeLabelText.textContent = '🔍 Icon 顯示大小';
    const sizeValue = document.createElement('span');
    sizeValue.style.cssText = `color:${IC.primary}; font-weight:bold;`;
    sizeValue.textContent = _iconSizePercent + '%';
    sizeLabel.appendChild(sizeLabelText);
    sizeLabel.appendChild(sizeValue);
    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '100';
    sizeSlider.max = '500';
    sizeSlider.step = '10';
    sizeSlider.value = _iconSizePercent;
    sizeSlider.style.cssText = 'width:100%; cursor:pointer; accent-color:' + IC.primary + ';';
    sizeSlider.oninput = () => {
        const val = parseInt(sizeSlider.value);
        sizeValue.textContent = val + '%';
    };
    sizeSlider.onchange = () => {
        const val = parseInt(sizeSlider.value);
        _iconSizePercent = val;
        chrome.storage.local.set({ [ICON_SIZE_KEY]: val });
        reapplyAllIcons();
        replaceAllIcons();
        showToast('🔍 Icon 大小：' + val + '%');
    };
    sizeSection.appendChild(sizeLabel);
    sizeSection.appendChild(sizeSlider);
    content.appendChild(sizeSection);

    // Gem list
    if (gemKeys.length > 0) {
        const listSection = document.createElement('div');
        const listLabel = document.createElement('div');
        listLabel.style.cssText = `color:${IC.textSub}; font-size:11px; margin-bottom:8px; border-top:1px solid ${IC.border}; padding-top:12px;`;
        listLabel.textContent = '📋 已設定的 Gem（' + gemKeys.length + ' 個）';
        listSection.appendChild(listLabel);

        gemKeys.forEach(key => {
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; gap:8px; padding:6px 8px; background:${IC.bgLight}; border-radius:8px; margin-bottom:4px;`;
            const thumb = document.createElement('img');
            thumb.src = getThumbForGem(key, settings);
            thumb.style.cssText = 'width:28px; height:28px; border-radius:50%; object-fit:cover; flex-shrink:0;';
            const savedName = getNameForGem(key, settings);
            const label = document.createElement('span');
            label.style.cssText = 'flex:1; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            if (key === 'default') return; // ★ 不顯示原生 Gemini 項目 ★
            else if (savedName) label.textContent = savedName;
            else label.textContent = key.substring(0, 12);
            if (key === gemId) { label.textContent += ' ⬅ 目前'; label.style.color = IC.success; }
            const delBtn = document.createElement('span');
            delBtn.textContent = '✕';
            delBtn.style.cssText = `cursor:pointer; color:${IC.danger}; font-size:14px; padding:2px 4px; flex-shrink:0;`;
            delBtn.onclick = () => { removeIconForGem(key); if (key === gemId) reapplyAllIcons(); showToast('🗑 已移除'); overlay.remove(); iconPanelVisible = false; createIconPanel(); };
            row.appendChild(thumb); row.appendChild(label); row.appendChild(delBtn);
            listSection.appendChild(row);
        });
        content.appendChild(listSection);
    }

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `text-align:center; color:${IC.textSub}; font-size:10px; margin-top:12px; padding-top:8px; border-top:1px solid ${IC.border};`;
    footer.textContent = `GeminiSaver Fairy 自動備份小精靈 v${GS_VERSION} · Icon 設定`;
    content.appendChild(footer);
    panel.appendChild(content);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

// ★★★ 裁剪 UI ★★★
function showCropUI(file, cropArea, btnRow, IC) {
    const reader = new FileReader();
    reader.onload = function (ev) {
        const imgSrc = ev.target.result;
        const img = new Image();
        img.onload = function () {
            // 隱藏按鈕列
            btnRow.style.display = 'none';
            cropArea.style.display = 'block';
            cropArea.innerHTML = '';

            const cropTitle = document.createElement('div');
            cropTitle.style.cssText = `color:${IC.textSub}; font-size:11px; margin-bottom:10px;`;
            cropTitle.textContent = '✂️ 拖曳調整位置，滾輪或滑桿縮放';
            cropArea.appendChild(cropTitle);

            // 裁剪容器（圓形遮罩）
            const cropSize = 200;
            const cropContainer = document.createElement('div');
            cropContainer.style.cssText = `width:${cropSize}px; height:${cropSize}px; border-radius:50%; overflow:hidden; margin:0 auto 12px; position:relative; cursor:grab; border:3px solid ${IC.primary}; background:${IC.bgLight};`;

            const cropImg = document.createElement('img');
            cropImg.src = imgSrc;
            cropImg.draggable = false;

            // 計算初始大小：讓圖片最短邊填滿裁剪區
            const scale0 = cropSize / Math.min(img.width, img.height);
            let scale = scale0;
            let imgW = img.width * scale;
            let imgH = img.height * scale;
            let offsetX = (cropSize - imgW) / 2;
            let offsetY = (cropSize - imgH) / 2;

            function updateCropImg() {
                imgW = img.width * scale;
                imgH = img.height * scale;
                // 限制不超出
                offsetX = Math.min(0, Math.max(cropSize - imgW, offsetX));
                offsetY = Math.min(0, Math.max(cropSize - imgH, offsetY));
                cropImg.style.cssText = `position:absolute; left:${offsetX}px; top:${offsetY}px; width:${imgW}px; height:${imgH}px; pointer-events:none; user-select:none;`;
            }
            updateCropImg();
            cropContainer.appendChild(cropImg);

            // 拖曳
            let dragging = false, startX, startY, startOX, startOY;
            cropContainer.addEventListener('mousedown', (e) => {
                dragging = true; startX = e.clientX; startY = e.clientY; startOX = offsetX; startOY = offsetY;
                cropContainer.style.cursor = 'grabbing';
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                offsetX = startOX + (e.clientX - startX);
                offsetY = startOY + (e.clientY - startY);
                updateCropImg();
            });
            document.addEventListener('mouseup', () => { dragging = false; cropContainer.style.cursor = 'grab'; });

            // 觸控拖曳
            cropContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    dragging = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY; startOX = offsetX; startOY = offsetY;
                    e.preventDefault();
                }
            }, { passive: false });
            document.addEventListener('touchmove', (e) => {
                if (!dragging || e.touches.length !== 1) return;
                offsetX = startOX + (e.touches[0].clientX - startX);
                offsetY = startOY + (e.touches[0].clientY - startY);
                updateCropImg();
            });
            document.addEventListener('touchend', () => { dragging = false; });

            // 滾輪縮放
            cropContainer.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                const newScale = Math.max(scale0, Math.min(scale0 * 5, scale + delta * scale0));
                // 以裁剪區中心為縮放中心
                const cx = cropSize / 2;
                const cy = cropSize / 2;
                offsetX = cx - (cx - offsetX) * (newScale / scale);
                offsetY = cy - (cy - offsetY) * (newScale / scale);
                scale = newScale;
                updateCropImg();
                zoomSlider.value = ((scale - scale0) / (scale0 * 4)) * 100;
            }, { passive: false });

            cropArea.appendChild(cropContainer);

            // 縮放滑桿
            const zoomRow = document.createElement('div');
            zoomRow.style.cssText = 'display:flex; align-items:center; gap:8px; justify-content:center; margin-bottom:12px;';
            const zoomLabel = document.createElement('span');
            zoomLabel.style.cssText = `color:${IC.textSub}; font-size:11px;`;
            zoomLabel.textContent = '🔍';
            const zoomSlider = document.createElement('input');
            zoomSlider.type = 'range'; zoomSlider.min = '0'; zoomSlider.max = '100'; zoomSlider.value = '0';
            zoomSlider.style.cssText = 'width:160px; accent-color:' + IC.primary + ';';
            zoomSlider.addEventListener('input', () => {
                const pct = parseInt(zoomSlider.value) / 100;
                const newScale = scale0 + pct * scale0 * 4;
                const cx = cropSize / 2;
                const cy = cropSize / 2;
                offsetX = cx - (cx - offsetX) * (newScale / scale);
                offsetY = cy - (cy - offsetY) * (newScale / scale);
                scale = newScale;
                updateCropImg();
            });
            zoomRow.appendChild(zoomLabel); zoomRow.appendChild(zoomSlider);
            cropArea.appendChild(zoomRow);

            // 確認 / 取消 按鈕
            const actionRow = document.createElement('div');
            actionRow.style.cssText = 'display:flex; gap:8px; justify-content:center;';

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = '✅ 確認裁剪';
            confirmBtn.style.cssText = `background:${IC.success}; color:#1E1D2B; border:none; padding:8px 20px; border-radius:20px; cursor:pointer; font-size:13px; font-weight:bold; box-shadow:0 3px 6px rgba(0,0,0,0.2);`;
            confirmBtn.onclick = () => {
                // 用 canvas 裁剪出圓形區域對應的正方形
                const canvas = document.createElement('canvas');
                const outSize = 128;
                canvas.width = outSize; canvas.height = outSize;
                const ctx = canvas.getContext('2d');
                // 將裁剪區域映射回原圖座標
                const srcX = -offsetX / scale;
                const srcY = -offsetY / scale;
                const srcSize = cropSize / scale;
                ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outSize, outSize);
                try {
                    const result = canvas.toDataURL('image/jpeg', 0.85);
                    setIconForGem(getCurrentGemId(), result);
                    reapplyAllIcons();
                    showToast('✅ Icon 已設定！');
                    // 關閉 overlay 再重新開啟以刷新
                    const ov = document.getElementById('gem-icon-overlay');
                    if (ov) { ov.remove(); iconPanelVisible = false; }
                    createIconPanel();
                } catch (err) {
                    console.warn('[Icon] 裁剪失敗:', err);
                    showToast('❌ 裁剪失敗');
                }
            };

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '↩ 取消';
            cancelBtn.style.cssText = `background:${IC.bgLight}; color:${IC.text}; border:1px solid ${IC.border}; padding:8px 20px; border-radius:20px; cursor:pointer; font-size:13px; font-weight:bold;`;
            cancelBtn.onclick = () => {
                cropArea.style.display = 'none';
                cropArea.innerHTML = '';
                btnRow.style.display = 'flex';
            };

            actionRow.appendChild(confirmBtn); actionRow.appendChild(cancelBtn);
            cropArea.appendChild(actionRow);
        };
        img.src = imgSrc;
    };
    reader.readAsDataURL(file);
}
