// viewer.js — 對話回顧器核心邏輯
// 依賴：chrome.storage.local
// 入口：viewer.html?id={convId}

const STORAGE_PREFIX = 'backup_';
const SEPARATOR = '\n\n---\n\n';
const VIEWER_AVATAR_KEY = 'gs_viewer_avatars';
const VIEWER_ICON_SIZE_KEY = 'gs_viewer_icon_size';

// ==========================================
// 全域狀態
// ==========================================
let _viewerData = null;       // 當前載入的備份資料
let _viewerMessages = [];     // 解析後的訊息陣列
let _viewerAvatars = {};      // 頭像快取
let _searchTerm = '';         // 目前的搜尋關鍵字
let _viewerIconSize = 40;     // 頭像大小 (px)

// ==========================================
// 初始化
// ==========================================
async function initViewer() {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get('id');

    if (!convId) {
        showEmptyState('❓', '缺少對話 ID', '請從對話備份資料庫開啟此頁面。');
        return;
    }

    try {
        // 載入備份資料
        const key = STORAGE_PREFIX + convId;
        const result = await chrome.storage.local.get(key);
        const data = result[key];

        if (!data) {
            showEmptyState('📭', '找不到備份', `對話 ID: ${convId}<br>此對話可能已被刪除或尚未備份。`);
            return;
        }

        // 檢查 skeleton
        if (!data.rawContent || data.rawContent === '(掃描匯入 - 尚未備份內容)') {
            const link = data.chatLink || data.url || `https://gemini.google.com/app/${convId}`;
            showEmptyState(
                '⚠️',
                '尚未備份內容',
                `此對話只有標題和連結，尚未備份實際內容。<br><br>` +
                `<a href="${escapeHtml(link)}" target="_blank">🔗 前往 Gemini 開啟對話</a>` +
                `<br>開啟後小精靈會自動備份，之後再回來回顧。`
            );
            return;
        }

        _viewerData = data;

        // 載入頭像
        await loadAvatars();

        // 解析內容
        _viewerMessages = parseRawContent(data.rawContent, data.botName || 'Gemini');

        // 初始化主題設定
        initTheme();

        // 初始化頭像大小
        initIconSize();

        // 渲染 header
        renderHeader(data);

        // 渲染訊息
        renderMessages(_viewerMessages);

        // 設定 page title
        document.title = `💬 ${data.title || '對話回顧'} — GeminiSaver Fairy`;

        // 綁定事件
        bindEvents();

    } catch (err) {
        console.error('[Viewer] 初始化失敗:', err);
        showEmptyState('❌', '載入失敗', `錯誤：${err.message}`);
    }
}

// ==========================================
// rawContent 解析器
// ==========================================
function parseRawContent(raw, defaultBotName) {
    if (!raw) return [];

    const messages = [];
    // 先用 SEPARATOR 分割成回合
    const rounds = raw.split(SEPARATOR).filter(r => r.trim());

    for (const round of rounds) {
        // 每個 round 可能包含一個 user 訊息和一個 bot 訊息
        // 格式：你：\n{text}\n\n{BotName}(GEMINI)：\n{text}
        // 或可能只有 user 或只有 bot

        // 嘗試找 user 部分
        const userMatch = round.match(/^你：\n([\s\S]*?)(?=\n\n.+?\(GEMINI\)：|$)/);
        // 嘗試找 bot 部分
        const botMatch = round.match(/(.+?)\(GEMINI\)：\n([\s\S]*)$/);

        if (userMatch && userMatch[1].trim()) {
            messages.push({
                role: 'user',
                name: '你',
                text: userMatch[1].trim()
            });
        }

        if (botMatch) {
            messages.push({
                role: 'bot',
                name: botMatch[1].trim() || defaultBotName,
                text: botMatch[2].trim()
            });
        }

        // fallback: 如果都沒 match，但有內容，當成 bot 訊息
        if (!userMatch && !botMatch && round.trim()) {
            messages.push({
                role: 'bot',
                name: defaultBotName,
                text: round.trim()
            });
        }
    }

    return messages;
}

// ==========================================
// 渲染 Header
// ==========================================
function renderHeader(data) {
    const headerTitle = document.getElementById('headerTitle');
    const headerBotBadge = document.getElementById('headerBotBadge');
    const headerDate = document.getElementById('headerDate');
    const headerCount = document.getElementById('headerCount');
    const headerBotAvatar = document.getElementById('headerBotAvatar');

    headerTitle.textContent = '🔖 ' + (data.title || '未命名對話');
    headerBotBadge.textContent = data.botName || 'Gemini';
    headerDate.textContent = data.lastUpdated || '-';
    headerCount.textContent = _viewerMessages.length + ' 則訊息';

    // Bot 頭像
    const botKey = 'bot_' + (data.botName || 'default');
    const botAvatar = _viewerAvatars[botKey] || _viewerAvatars['bot_default'];
    if (botAvatar) {
        headerBotAvatar.innerHTML = `<img src="${botAvatar}" alt="Bot">`;
    } else {
        // 嘗試從 Icon 替換設定取得
        loadGemIcon(data.botName).then(icon => {
            if (icon) {
                headerBotAvatar.innerHTML = `<img src="${icon}" alt="Bot">`;
            }
        });
    }
}

// ==========================================
// 渲染訊息
// ==========================================
function renderMessages(messages) {
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML = '';

    if (messages.length === 0) {
        showEmptyState('📭', '沒有訊息', '此備份沒有可顯示的對話內容。');
        return;
    }

    // 移除原有的日期分隔線邏輯，依 USER 需求不顯示


    // 渲染每則訊息
    messages.forEach((msg, idx) => {
        const row = document.createElement('div');
        row.className = 'msg-row ' + msg.role;
        row.style.animationDelay = Math.min(idx * 0.08, 1.2) + 's';

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar ' + msg.role;
        avatar.title = msg.role === 'user' ? '點擊更換你的頭像' : '點擊更換 Bot 頭像';

        const avatarKey = msg.role === 'user' ? 'user' : ('bot_' + (msg.name || 'default'));
        const avatarUrl = _viewerAvatars[avatarKey] || _viewerAvatars[msg.role === 'user' ? 'user' : 'bot_default'];

        if (avatarUrl) {
            avatar.innerHTML = `<img src="${avatarUrl}" alt="${msg.role}">`;
        } else {
            avatar.textContent = msg.role === 'user' ? '👤' : '✨';
        }

        // 頭像點擊改為由設定面板處理（不再直接上傳）

        // Content wrapper
        const content = document.createElement('div');

        // Name
        const nameEl = document.createElement('div');
        nameEl.className = 'msg-name';
        nameEl.textContent = msg.name;

        // Bubble
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        bubble.innerHTML = renderMarkdown(msg.text);

        content.appendChild(nameEl);
        content.appendChild(bubble);

        row.appendChild(avatar);
        row.appendChild(content);
        chatArea.appendChild(row);
    });

    // Stats bar
    const stats = document.createElement('div');
    stats.className = 'stats-bar';
    const botName = _viewerData ? (_viewerData.botName || 'Gemini') : 'Gemini';
    const date = _viewerData ? (_viewerData.lastUpdated || '-') : '-';
    stats.innerHTML = `<span>💬 ${messages.length} 則訊息</span><span>·</span>` +
        `<span> ${escapeHtml(botName)}</span><span>·</span>` +
        `<span>📅 ${escapeHtml(date)}</span><span>·</span>` +
        `<span>🍀 GeminiSaver Fairy</span>`;
    chatArea.appendChild(stats);
}

// ==========================================
// 輕量 Markdown 渲染
// ==========================================
function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code (`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold (**)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic (*)
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

    // Blockquote (>)
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Ordered list (1. 2.) — 先處理避免被 UL 誤包
    html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
        const items = block.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        return '<ol>' + items + '</ol>';
    });

    // Unordered list (- or *)
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Line breaks → paragraphs
    html = html.split('\n\n').map(p => {
        p = p.trim();
        if (!p) return '';
        // 不要包裹已有塊級元素的段落
        if (p.startsWith('<pre>') || p.startsWith('<ul>') || p.startsWith('<ol>') || p.startsWith('<blockquote>')) {
            return p;
        }
        return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    // 搜尋高亮
    if (_searchTerm) {
        const escaped = _searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        // 只在文字節點中高亮，避免破壞 HTML 標籤
        html = html.replace(/>([^<]+)</g, (match, textContent) => {
            return '>' + textContent.replace(regex, '<span class="search-highlight">$1</span>') + '<';
        });
    }

    return html;
}

// ==========================================
// 搜尋功能
// ==========================================
function initSearch() {
    const input = document.getElementById('searchInput');
    let debounceTimer = null;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            _searchTerm = input.value.trim();
            renderMessages(_viewerMessages);

            // 自動捲動到第一個高亮
            if (_searchTerm) {
                const firstHighlight = document.querySelector('.search-highlight');
                if (firstHighlight) {
                    firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }, 300);
    });

    // ESC 清除搜尋
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            _searchTerm = '';
            renderMessages(_viewerMessages);
        }
    });
}

// ==========================================
// 頭像系統
// ==========================================
async function loadAvatars() {
    try {
        const result = await chrome.storage.local.get(VIEWER_AVATAR_KEY);
        _viewerAvatars = result[VIEWER_AVATAR_KEY] || {};
    } catch (e) {
        _viewerAvatars = {};
    }

    // ★ 自動從 gem_icon_settings 載入所有 Gem 圖示 ★
    try {
        const result = await chrome.storage.local.get('gem_icon_settings');
        const raw = result['gem_icon_settings'] || '{}';
        const settings = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const key in settings) {
            const entry = settings[key];
            if (entry && typeof entry === 'object' && entry.icon && entry.name) {
                const avatarKey = 'bot_' + entry.name;
                // 使用者自訂頭像優先，gem_icon_settings 作為 fallback
                if (!_viewerAvatars[avatarKey]) {
                    _viewerAvatars[avatarKey] = entry.icon;
                }
            }
        }
    } catch (e) { /* ignore */ }
}

async function loadGemIcon(botName) {
    try {
        const result = await chrome.storage.local.get('gem_icon_settings');
        const raw = result['gem_icon_settings'] || '{}';
        const settings = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const key in settings) {
            const entry = settings[key];
            if (entry && typeof entry === 'object' && entry.name === botName && entry.icon) {
                return entry.icon;
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

async function saveAvatars() {
    try {
        await chrome.storage.local.set({ [VIEWER_AVATAR_KEY]: _viewerAvatars });
    } catch (e) {
        console.error('[Viewer] 儲存頭像失敗:', e);
    }
}

function handleAvatarUpload(roleKey) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        showCropOverlay(file, roleKey);
    });
    input.click();
}

// ==========================================
// 互動式裁切 UI（拖曳 + 滾輪 + 滑桿縮放）
// ==========================================
function showCropOverlay(file, roleKey) {
    const reader = new FileReader();
    reader.onload = (ev) => {
        const imgSrc = ev.target.result;
        const img = new Image();
        img.onload = () => {
            // Overlay
            const overlay = document.createElement('div');
            overlay.className = 'settings-overlay';
            overlay.style.zIndex = '300';

            const panel = document.createElement('div');
            panel.className = 'settings-panel';
            panel.style.width = '340px';

            // Header
            const header = document.createElement('div');
            header.className = 'settings-header';
            const h3 = document.createElement('h3');
            h3.textContent = '✂️ 裁剪頭像';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'settings-close';
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', () => overlay.remove());
            header.appendChild(h3);
            header.appendChild(closeBtn);
            panel.appendChild(header);

            const body = document.createElement('div');
            body.className = 'settings-body';

            // 裁剪容器（圓形遮罩）
            const cropSize = 200;
            const cropContainer = document.createElement('div');
            cropContainer.style.cssText = `width:${cropSize}px;height:${cropSize}px;border-radius:50%;overflow:hidden;margin:0 auto;position:relative;cursor:grab;border:3px solid var(--settings-slider-accent);background:var(--settings-section-bg);`;

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
                offsetX = Math.min(0, Math.max(cropSize - imgW, offsetX));
                offsetY = Math.min(0, Math.max(cropSize - imgH, offsetY));
                cropImg.style.cssText = `position:absolute;left:${offsetX}px;top:${offsetY}px;width:${imgW}px;height:${imgH}px;pointer-events:none;user-select:none;`;
            }
            updateCropImg();
            cropContainer.appendChild(cropImg);

            // 拖曳
            let dragging = false, startX, startY, startOX, startOY;
            cropContainer.addEventListener('mousedown', (e) => {
                dragging = true; startX = e.clientX; startY = e.clientY; startOX = offsetX; startOY = offsetY;
                cropContainer.style.cursor = 'grabbing'; e.preventDefault();
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
                const cx = cropSize / 2, cy = cropSize / 2;
                offsetX = cx - (cx - offsetX) * (newScale / scale);
                offsetY = cy - (cy - offsetY) * (newScale / scale);
                scale = newScale;
                updateCropImg();
                zoomSlider.value = ((scale - scale0) / (scale0 * 4)) * 100;
            }, { passive: false });

            body.appendChild(cropContainer);

            // 縮放滑桿
            const zoomRow = document.createElement('div');
            zoomRow.className = 'settings-slider-row';
            zoomRow.style.marginTop = '12px';
            const zoomLabel = document.createElement('span');
            zoomLabel.textContent = '🔍';
            zoomLabel.style.fontSize = '16px';
            const zoomSlider = document.createElement('input');
            zoomSlider.type = 'range'; zoomSlider.min = '0'; zoomSlider.max = '100'; zoomSlider.value = '0';
            zoomSlider.addEventListener('input', () => {
                const pct = parseInt(zoomSlider.value) / 100;
                const newScale = scale0 + pct * scale0 * 4;
                const cx = cropSize / 2, cy = cropSize / 2;
                offsetX = cx - (cx - offsetX) * (newScale / scale);
                offsetY = cy - (cy - offsetY) * (newScale / scale);
                scale = newScale;
                updateCropImg();
            });
            zoomRow.appendChild(zoomLabel);
            zoomRow.appendChild(zoomSlider);
            body.appendChild(zoomRow);

            // 提示文字
            const hint = document.createElement('div');
            hint.style.cssText = 'text-align:center;font-size:11px;color:var(--text-muted);margin-top:4px;';
            hint.textContent = '拖曳調整位置，滾輪或滑桿縮放';
            body.appendChild(hint);

            // 確認 / 取消 按鈕
            const actionRow = document.createElement('div');
            actionRow.className = 'settings-btn-row';
            actionRow.style.justifyContent = 'center';
            actionRow.style.marginTop = '8px';

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'settings-btn settings-btn-primary';
            confirmBtn.textContent = '✅ 確認裁剪';
            confirmBtn.addEventListener('click', () => {
                const canvas = document.createElement('canvas');
                const outSize = 128;
                canvas.width = outSize; canvas.height = outSize;
                const ctx = canvas.getContext('2d');
                const srcX = -offsetX / scale;
                const srcY = -offsetY / scale;
                const srcSize = cropSize / scale;
                ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outSize, outSize);
                try {
                    const result = canvas.toDataURL('image/jpeg', 0.85);
                    _viewerAvatars[roleKey] = result;
                    saveAvatars().then(() => {
                        renderHeader(_viewerData);
                        renderMessages(_viewerMessages);
                    });
                    overlay.remove();
                } catch (err) {
                    console.warn('[Viewer] 裁剪失敗:', err);
                }
            });

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'settings-btn settings-btn-danger';
            cancelBtn.textContent = '↩ 取消';
            cancelBtn.addEventListener('click', () => overlay.remove());

            actionRow.appendChild(confirmBtn);
            actionRow.appendChild(cancelBtn);
            body.appendChild(actionRow);

            panel.appendChild(body);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            // ESC 關閉
            const escHandler = (e) => {
                if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
            };
            document.addEventListener('keydown', escHandler);
        };
        img.src = imgSrc;
    };
    reader.readAsDataURL(file);
}

// ==========================================
// 下載功能
// ==========================================
function handleDownload() {
    if (!_viewerData) return;

    const botName = _viewerData.botName || 'Gemini';
    const title = _viewerData.title || '未命名對話';
    const url = _viewerData.url || '';
    const date = _viewerData.lastUpdated || '';
    let content = _viewerData.rawContent || '';

    // 修正 botName
    if (botName !== 'Gemini' && content.includes('Gemini(GEMINI)：')) {
        content = content.replaceAll('Gemini(GEMINI)：', `${botName}(GEMINI)：`);
    }

    const formatted = `${botName}-${title}\n網址：${url}\n最後更新時間 ${date}\n---\n${content}`;

    const blob = new Blob(['\uFEFF' + formatted], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${botName}-${title}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ==========================================
// 工具函式
// ==========================================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showEmptyState(emoji, title, message) {
    const chatArea = document.getElementById('chatArea');
    chatArea.innerHTML = `
        <div class="empty-state">
            <div class="emoji">${emoji}</div>
            <h2>${title}</h2>
            <p>${message}</p>
        </div>
    `;
    // 隱藏 loading
    const loading = document.getElementById('loadingState');
    if (loading) loading.style.display = 'none';
}

// ==========================================
// 事件綁定
// ==========================================
function bindEvents() {
    // 搜尋
    initSearch();

    // 下載
    document.getElementById('btnDownload').addEventListener('click', handleDownload);

    // 設定面板
    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
        btnSettings.addEventListener('click', showSettingsPanel);
    }

    // Scroll to top
    const scrollBtn = document.getElementById('scrollTopBtn');
    window.addEventListener('scroll', () => {
        scrollBtn.classList.toggle('visible', window.scrollY > 300);
    });
    scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // Theme Toggle (櫻花粉與奶油護眼切換)
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            const isPink = document.body.classList.contains('theme-pink');
            if (isPink) {
                document.body.classList.remove('theme-pink');
                btnThemeToggle.innerText = '🌸';
                try { localStorage.setItem('gs_viewer_theme', 'default'); } catch (err) { }
            } else {
                document.body.classList.add('theme-pink');
                btnThemeToggle.innerText = '🎀';
                try { localStorage.setItem('gs_viewer_theme', 'pink'); } catch (err) { }
            }
        });
    }

    // Ctrl+F → focus 搜尋框
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput').focus();
        }
    });
}

// ==========================================
// 設定面板
// ==========================================
function initIconSize() {
    try {
        const saved = localStorage.getItem(VIEWER_ICON_SIZE_KEY);
        if (saved) {
            _viewerIconSize = parseInt(saved) || 40;
        }
        document.documentElement.style.setProperty('--avatar-size', _viewerIconSize + 'px');
    } catch (e) { /* ignore */ }
}

function applyIconSize(size) {
    _viewerIconSize = size;
    document.documentElement.style.setProperty('--avatar-size', size + 'px');
    try { localStorage.setItem(VIEWER_ICON_SIZE_KEY, size); } catch (e) { /* ignore */ }
}

function showSettingsPanel() {
    // 如果已經存在就移除
    const existing = document.querySelector('.settings-overlay');
    if (existing) { existing.remove(); return; }

    const botName = _viewerData ? (_viewerData.botName || 'default') : 'default';
    const botKey = 'bot_' + botName;
    const userAvatar = _viewerAvatars['user'];
    const botAvatar = _viewerAvatars[botKey] || _viewerAvatars['bot_default'];

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // ESC 關閉
    const escHandler = (e) => {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'settings-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'settings-header';
    const h3 = document.createElement('h3');
    h3.textContent = '⚙️ 回顧器設定';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => { overlay.remove(); document.removeEventListener('keydown', escHandler); });
    header.appendChild(h3);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'settings-body';

    // === Section 1: 頭像大小 ===
    const sizeSection = document.createElement('div');
    sizeSection.className = 'settings-section';
    const sizeTitle = document.createElement('div');
    sizeTitle.className = 'settings-section-title';
    sizeTitle.textContent = '📏 頭像大小';
    sizeSection.appendChild(sizeTitle);

    const sliderRow = document.createElement('div');
    sliderRow.className = 'settings-slider-row';
    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '20';
    sizeSlider.max = '64';
    sizeSlider.step = '2';
    sizeSlider.value = _viewerIconSize;
    const sizeValue = document.createElement('span');
    sizeValue.className = 'settings-slider-value';
    sizeValue.textContent = _viewerIconSize + 'px';

    sizeSlider.addEventListener('input', () => {
        const val = parseInt(sizeSlider.value);
        sizeValue.textContent = val + 'px';
        applyIconSize(val);
    });

    sliderRow.appendChild(sizeSlider);
    sliderRow.appendChild(sizeValue);
    sizeSection.appendChild(sliderRow);
    body.appendChild(sizeSection);

    // === Section 2: 使用者頭像 ===
    const userSection = document.createElement('div');
    userSection.className = 'settings-section';
    const userTitle = document.createElement('div');
    userTitle.className = 'settings-section-title';
    userTitle.textContent = '👤 使用者頭像';
    userSection.appendChild(userTitle);

    const userPreview = document.createElement('div');
    userPreview.className = 'settings-avatar-preview';
    if (userAvatar) {
        const img = document.createElement('img');
        img.className = 'settings-avatar-img';
        img.src = userAvatar;
        userPreview.appendChild(img);
    } else {
        const ph = document.createElement('div');
        ph.className = 'settings-avatar-placeholder';
        ph.style.background = 'var(--user-avatar-bg)';
        ph.textContent = '👤';
        userPreview.appendChild(ph);
    }
    const userInfo = document.createElement('div');
    const userInfoName = document.createElement('div');
    userInfoName.className = 'settings-avatar-info';
    userInfoName.textContent = '你';
    const userInfoHint = document.createElement('div');
    userInfoHint.className = 'settings-avatar-hint';
    userInfoHint.textContent = userAvatar ? '已自訂頭像' : '使用預設';
    userInfo.appendChild(userInfoName);
    userInfo.appendChild(userInfoHint);
    userPreview.appendChild(userInfo);
    userSection.appendChild(userPreview);

    const userBtnRow = document.createElement('div');
    userBtnRow.className = 'settings-btn-row';
    const userUploadBtn = document.createElement('button');
    userUploadBtn.className = 'settings-btn settings-btn-primary';
    userUploadBtn.textContent = '📤 上傳頭像';
    userUploadBtn.addEventListener('click', () => {
        handleAvatarUpload('user');
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
    });
    userBtnRow.appendChild(userUploadBtn);
    if (userAvatar) {
        const userResetBtn = document.createElement('button');
        userResetBtn.className = 'settings-btn settings-btn-danger';
        userResetBtn.textContent = '🗑 重設';
        userResetBtn.addEventListener('click', () => {
            delete _viewerAvatars['user'];
            saveAvatars().then(() => {
                renderHeader(_viewerData);
                renderMessages(_viewerMessages);
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            });
        });
        userBtnRow.appendChild(userResetBtn);
    }
    userSection.appendChild(userBtnRow);
    body.appendChild(userSection);

    // === Section 3: Bot 頭像 ===
    const botSection = document.createElement('div');
    botSection.className = 'settings-section';
    const botTitle = document.createElement('div');
    botTitle.className = 'settings-section-title';
    botTitle.textContent = '✨ Bot 頭像（' + (botName === 'default' ? 'Gemini' : botName) + '）';
    botSection.appendChild(botTitle);

    const botPreview = document.createElement('div');
    botPreview.className = 'settings-avatar-preview';
    if (botAvatar) {
        const img = document.createElement('img');
        img.className = 'settings-avatar-img';
        img.src = botAvatar;
        botPreview.appendChild(img);
    } else {
        const ph = document.createElement('div');
        ph.className = 'settings-avatar-placeholder';
        ph.style.background = 'var(--bot-avatar-bg)';
        ph.textContent = '✨';
        botPreview.appendChild(ph);
    }
    const botInfo = document.createElement('div');
    const botInfoName = document.createElement('div');
    botInfoName.className = 'settings-avatar-info';
    botInfoName.textContent = botName === 'default' ? 'Gemini' : botName;
    const botInfoHint = document.createElement('div');
    botInfoHint.className = 'settings-avatar-hint';
    botInfoHint.textContent = botAvatar ? '已自訂頭像' : '使用預設（可從 Gem Icon 設定自動套用）';
    botInfo.appendChild(botInfoName);
    botInfo.appendChild(botInfoHint);
    botPreview.appendChild(botInfo);
    botSection.appendChild(botPreview);

    const botBtnRow = document.createElement('div');
    botBtnRow.className = 'settings-btn-row';
    const botUploadBtn = document.createElement('button');
    botUploadBtn.className = 'settings-btn settings-btn-primary';
    botUploadBtn.textContent = '📤 上傳頭像';
    botUploadBtn.addEventListener('click', () => {
        handleAvatarUpload(botKey);
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
    });
    botBtnRow.appendChild(botUploadBtn);
    if (botAvatar) {
        const botResetBtn = document.createElement('button');
        botResetBtn.className = 'settings-btn settings-btn-danger';
        botResetBtn.textContent = '🗑 重設';
        botResetBtn.addEventListener('click', () => {
            delete _viewerAvatars[botKey];
            delete _viewerAvatars['bot_default'];
            saveAvatars().then(() => {
                renderHeader(_viewerData);
                renderMessages(_viewerMessages);
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            });
        });
        botBtnRow.appendChild(botResetBtn);
    }
    botSection.appendChild(botBtnRow);
    body.appendChild(botSection);

    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
}

// ==========================================
// 主題系統
// ==========================================
function initTheme() {
    try {
        const savedTheme = localStorage.getItem('gs_viewer_theme') || 'default';
        const btnThemeToggle = document.getElementById('btnThemeToggle');

        if (savedTheme === 'pink') {
            document.body.classList.add('theme-pink');
            if (btnThemeToggle) btnThemeToggle.innerText = '🎀';
        }
    } catch (e) {
        // 忽略 localStorage 錯誤
    }
}

// ==========================================
// 入口
// ==========================================
document.addEventListener('DOMContentLoaded', initViewer);
