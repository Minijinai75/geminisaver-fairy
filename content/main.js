// content/main.js — 核心備份邏輯 + 初始化
// 依賴：globals.js, watermark.js, folderManager.js, iconReplace.js

// ==========================================
// 核心備份邏輯 (效能優化版)
// ==========================================

function getFormattedTime() {
    return new Date().toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}

function getBotName() {
    const el = document.querySelector(".bot-name-text") ||
        document.querySelector('[data-test-id="bot-name"]') ||
        document.querySelector(".model-name");
    if (el) return el.innerText.trim();
    // URL fallback: /gem/ = Gem 對話, /app/ = 原生 Gemini
    if (window.location.pathname.includes('/gem/')) return '未知 Gem';
    return "Gemini";
}

// getConversationId() → 已移至 globals.js

// ★★★ 智慧合併 (v10.0.0) ★★★
function smartMerge(oldRaw, newRaw) {
    if (!oldRaw) return newRaw;
    if (!newRaw) return oldRaw;

    const oldBlocks = oldRaw.split(SEPARATOR).filter(b => b.trim() !== "");
    const newBlocks = newRaw.split(SEPARATOR).filter(b => b.trim() !== "");
    if (oldBlocks.length === 0) return newRaw;
    if (newBlocks.length === 0) return oldRaw;

    const firstNew = newBlocks[0];
    const compareLen = Math.min(20, firstNew.length);
    if (compareLen === 0) return oldRaw;

    const firstNewStart = firstNew.substring(0, compareLen);
    let matchIndex = -1;

    for (let i = 0; i < oldBlocks.length; i++) {
        if (oldBlocks[i].substring(0, compareLen) === firstNewStart) {
            matchIndex = i;
            break;
        }
    }

    if (matchIndex >= 0) {
        const mergedList = oldBlocks.slice(0, matchIndex);
        mergedList.push(...newBlocks);
        return mergedList.join(SEPARATOR) + SEPARATOR;
    } else {
        if (newBlocks.length >= oldBlocks.length) return newRaw;
        const lastOld = oldBlocks[oldBlocks.length - 1];
        const lastNew = newBlocks[newBlocks.length - 1];
        const compareLen3 = Math.min(20, lastNew.length);
        if (lastOld !== lastNew && (compareLen3 === 0 || !lastOld.includes(lastNew.substring(0, compareLen3)))) {
            return oldRaw + newRaw;
        }
        return oldRaw;
    }
}

// ★ 取得乾淨文字（移除無障礙隱藏標籤）★
function getCleanText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    // 移除 Gemini 的螢幕閱讀器隱藏標籤 ("You said" / "你說了")
    clone.querySelectorAll('.cdk-visually-hidden').forEach(h => h.remove());
    // ★ 將 clone 暫時掛載到 DOM，讓 innerText 能正確計算 CSS 排版的換行 ★
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
    hiddenContainer.appendChild(clone);
    _isCleaningText = true;
    try {
        document.body.appendChild(hiddenContainer);
        const text = clone.innerText.trim();
        return text;
    } finally {
        try { document.body.removeChild(hiddenContainer); } catch (e) { }
        _isCleaningText = false;
    }
}

// ★ 抓取對話內容 ★
function scrapeConversation() {
    const id = getConversationId();
    if (!id) return null;

    // ★ 標題偵測（用 URL 的對話 ID 從 sidebar 精準比對）★
    let title = 'Gemini_Chat';
    // 方法 1：從 sidebar 找到與當前對話 ID 匹配的項目
    const sidebarLinks = document.querySelectorAll('a[href]');
    for (const link of sidebarLinks) {
        if (link.href && link.href.includes('/' + id)) {
            const titleSpan = link.querySelector('.conversation-title');
            if (titleSpan && titleSpan.innerText.trim()) {
                title = titleSpan.innerText.trim();
                break;
            }
        }
    }
    // 方法 2：如果 sidebar 沒找到，嘗試 document.title
    if (title === 'Gemini_Chat') {
        const docTitle = document.title || '';
        if (docTitle && !DEFAULT_TITLES.includes(docTitle)) {
            title = docTitle.replace(/^(Google\s+)?Gemini\s*[-–—]\s*/, '').trim() || docTitle;
        }
    }
    // 方法 3：用第一則使用者訊息當標題
    if (title === 'Gemini_Chat') {
        const firstUser = document.querySelector('user-query .query-text');
        if (firstUser) {
            const firstText = getCleanText(firstUser);
            if (firstText) title = firstText.substring(0, 50);
        }
    }

    const botName = getBotName();
    const currentUrl = window.location.href;

    let contentText = '';
    const containers = document.querySelectorAll('.conversation-container');
    if (containers.length === 0) return null;

    containers.forEach(container => {
        const userMsg = container.querySelector('user-query .query-text');
        const botMsg = container.querySelector('model-response .markdown');
        const localBotNameEl = container.querySelector('.bot-name-text');
        const currentBotName = localBotNameEl ? localBotNameEl.innerText.trim() : botName;

        if (userMsg) {
            contentText += `你：\n${getCleanText(userMsg)}\n\n`;
        }
        if (botMsg) {
            contentText += `${currentBotName}(GEMINI)：\n${getCleanText(botMsg)}${SEPARATOR}`;
        }
    });

    if (!contentText) return null;

    return {
        id, title: title.replace(/[<>:"/\\|?*]/g, '_'),
        botName, url: currentUrl,
        contentText, containerCount: containers.length
    };
}

// ★★★ 主儲存函數 (含效能優化) ★★★
function saveToStorage() {
    if (isSaving) return;
    isSaving = true;

    try {
        const scraped = scrapeConversation();
        if (!scraped) { isSaving = false; return; }

        const { id, title, botName, url, contentText, containerCount } = scraped;

        // ★ quickHash 快速比較：容器數+內容長度未變則跳過 ★
        const quickHash = id + ':' + containerCount + ':' + contentText.length;
        const key = STORAGE_PREFIX + id;

        chrome.storage.local.get(key, (result) => {
            try {
                const existingData = result[key] || null;
                let oldRawContent = "";
                let oldTimestamp = 0;

                if (existingData) {
                    oldRawContent = existingData.rawContent || "";
                    oldTimestamp = existingData.timestamp || 0;
                }

                if (quickHash === lastContentHash && oldRawContent && (Date.now() - oldTimestamp < 60000)) {
                    // ★ v10.0.0: 內容沒變但標題可能被使用者手動修改 ★
                    const oldTitle = existingData ? existingData.title : '';
                    const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_');
                    if (existingData && oldTitle !== safeTitle) {
                        // 標題已更新 → 輕量級 metadata 更新（不重寫 rawContent）
                        const accountEmail = detectAccountEmail();
                        const chatLink = getChatLink(id);
                        const updatedData = {
                            ...existingData,
                            title: safeTitle,
                            url: url,
                            lastUpdated: getFormattedTime(),
                            accountEmail: accountEmail || existingData.accountEmail || null,
                            chatLink: chatLink || existingData.chatLink || null
                        };
                        chrome.storage.local.set({ [key]: updatedData }, () => {
                            if (!chrome.runtime.lastError) {
                                showToast("📝 標題已同步", { type: 'backup-cloud' });
                            }
                        });
                        return;
                    }
                    showToast("♻️", { type: 'backup-cloud' });
                    return;
                }

                // ★★★ 敏感內容遮罩保護 ★★★
                const SENSITIVE_MARKERS = ["a sensitive query", "sensitive content", "敏感內容"];
                const contentLower = contentText.toLowerCase();
                const containsSensitiveMarker = SENSITIVE_MARKERS.some(marker =>
                    contentLower.includes(marker.toLowerCase())
                );

                if (containsSensitiveMarker && oldRawContent && oldRawContent.length > contentText.length) {
                    console.log("[GeminiSaver] 偵測到敏感內容遮罩，保留原有備份");
                    showToast("🛡️ 偵測到遮罩，保留原備份", { type: 'backup-cloud' });
                    return;
                }

                const finalRawContent = smartMerge(oldRawContent, contentText);

                if (finalRawContent === oldRawContent && (Date.now() - oldTimestamp < 60000)) {
                    showToast("♻️", { type: 'backup-cloud' });
                    return;
                }

                lastContentHash = quickHash;

                // ★ v10.0.0: 帳號 Email + Chat Link 標註 ★
                const accountEmail = detectAccountEmail();
                const chatLink = getChatLink(id);

                const newData = {
                    id, title, botName, url,
                    rawContent: finalRawContent,
                    lastUpdated: getFormattedTime(),
                    timestamp: Date.now(),
                    accountEmail: accountEmail || (existingData ? existingData.accountEmail : null),
                    chatLink: chatLink || (existingData ? existingData.chatLink : null)
                };

                chrome.storage.local.set({ [key]: newData }, () => {
                    if (chrome.runtime.lastError) {
                        showToast("❌ 儲存失敗");
                        console.error("[GeminiSaver] 儲存失敗:", chrome.runtime.lastError);
                    } else {
                        // ★ 統一走 showToast 內建的 backup-cloud 開關過濾 ★
                        showToast("☁️", { type: 'backup-cloud' });
                    }
                });
            } catch (err) {
                console.error("[GeminiSaver] 儲存錯誤:", err);
                showToast("❌");
            } finally {
                isSaving = false;
            }
        });
    } catch (err) {
        console.error("[GeminiSaver] 抓取錯誤:", err);
        isSaving = false;
    }
}



// ==========================================
// 滾動預載入所有訊息（參考 AI Chat Exporter 邏輯）
// ==========================================
function scrollToLoadAllMessages() {
    return new Promise((resolve) => {
        const selector = "user-query, model-response";
        const observeTarget = document.querySelector("chat-window") || document.body;
        let lastCount = 0;
        let timeoutHandle;
        let observer;

        function scrollUp() {
            const els = document.querySelectorAll(selector);
            if (els.length > 0) {
                els[0].scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        }

        function check() {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            timeoutHandle = setTimeout(() => {
                const count = document.querySelectorAll(selector).length;
                if (count > lastCount) {
                    lastCount = count;
                    console.log(`[GeminiSaver] 偵測到新訊息，目前 ${count} 則`);
                    scrollUp();
                    check();
                } else {
                    if (observer) observer.disconnect();
                    console.log(`[GeminiSaver] 訊息載入完成，共 ${lastCount} 則`);
                    resolve(lastCount);
                }
            }, 3000);
        }

        lastCount = document.querySelectorAll(selector).length;
        if (lastCount < 20) {
            console.log(`[GeminiSaver] 訊息數 ${lastCount} < 20，不需預載`);
            resolve(lastCount);
            return;
        }

        console.log(`[GeminiSaver] 開始預載入，目前 ${lastCount} 則訊息`);
        showToast("📜 正在載入所有訊息...");

        observer = new MutationObserver(() => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            const count = document.querySelectorAll(selector).length;
            if (count > lastCount) {
                lastCount = count;
                scrollUp();
            }
            check();
        });
        observer.observe(observeTarget, { childList: true, subtree: true });

        scrollUp();
        check();
    });
}

// ==========================================
// 自動下載 & 自動重整
// ==========================================
function startAutoDownloadTimer(intervalMinutes) {
    if (autoDownloadInterval) clearInterval(autoDownloadInterval);
    if (!intervalMinutes || intervalMinutes <= 0) return;

    autoDownloadInterval = setInterval(() => {
        scrollToLoadAllMessages().then(() => {
            saveToStorage();
            setTimeout(() => {
                const id = getConversationId();
                if (!id) return;
                const key = STORAGE_PREFIX + id;
                chrome.storage.local.get(key, (result) => {
                    const data = result[key];
                    if (data) {
                        chrome.runtime.sendMessage({
                            action: "download",
                            filename: `GeminiBackup/${data.botName || "Gemini"}-${data.title}_${new Date().toISOString().slice(0, 10)}.txt`,
                            content: formatContent(data)
                        });
                    }
                });
            }, 3000);
        });
    }, intervalMinutes * 60 * 1000);
}

function startAutoRefreshTimer(intervalMinutes) {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    if (!intervalMinutes || intervalMinutes <= 0) return;

    autoRefreshInterval = setInterval(() => {
        scrollToLoadAllMessages().then(() => {
            saveToStorage();
            // ★ Bug 1 Fix: 先捲到頂端再 reload ★
            setTimeout(() => {
                window.scrollTo(0, 0);
                chrome.storage.local.set({ last_auto_refresh_ts: getFormattedTime() });
                window.location.reload();
            }, 3000);
        });
    }, intervalMinutes * 60 * 1000);
}

function formatContent(data) {
    const bName = data.botName || "Gemini";
    const dUrl = data.url || "https://gemini.google.com/";
    let safeContent = data.rawContent;
    if (bName !== "Gemini" && safeContent.includes("Gemini(GEMINI)：")) {
        safeContent = safeContent.replaceAll("Gemini(GEMINI)：", `${bName}(GEMINI)：`);
    }
    return `${bName}-${data.title}\n網址：${dUrl}\n最後更新時間 ${data.lastUpdated}\n---\n${safeContent}`;
}

// showToast() → 已移至 globals.js

// ==========================================
// 初始化 & MutationObserver
// ==========================================

// ★ debounced 儲存 + Icon 替換 ★
function debouncedSave() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => rIC(() => {
        if (document.hidden) return; // 背景 Tab 時跳過
        saveToStorage();
    }), 500);
}

function startObserver() {
    try {
        const target = document.querySelector('main') || document.body;
        if (!target) {
            console.warn('[GeminiSaver] Observer target not found, retry in 2s');
            setTimeout(startObserver, 2000);
            return;
        }
        const observer = new MutationObserver(() => {
            if (_isCleaningText) return; // ★ getCleanText 執行中，跳過 ★
            debouncedSave();
            replaceAllIcons(); // ★ 共用 Observer ★
        });
        observer.observe(target, { childList: true, subtree: true, characterData: true });
        if (DEBUG_MODE) console.log('[GeminiSaver] MutationObserver started');
    } catch (e) {
        console.error('[GeminiSaver] Observer failed:', e);
    }
}

// ★ 讀取設定並啟動 ★
function init() {
    try {
        if (!document.body) {
            setTimeout(init, 1000);
            return;
        }

        // ★ Bug 1 Fix: 禁止瀏覽器自動恢復捲動位置，確保 reload 後在頂端 ★
        if (history.scrollRestoration) {
            history.scrollRestoration = 'manual';
        }

        // ★ v10.0.0: 注入 Markdown 粗體修復 CSS ★
        injectMarkdownFix();

        // ★ v10.0.0: 引用回覆功能 ★
        initQuoteReply();

        // Icon 初始化
        lastGemId = getCurrentGemId();
        replaceAllIcons();

        // 啟動 MutationObserver
        startObserver();

        // ★ v10.0.0: GEMINI對話分類收納盒 ★
        initFolderManager();

        // ★ v10.0.0: 浮動控制面板 ★
        initFloatingPanel();

        // ★ v10.0.0: 初始化 Tab 標題同步 ★
        setTimeout(syncTabTitle, 2000);
        // 每 10 秒檢查一次 Tab 標題（輕量）
        setInterval(syncTabTitle, 10000);

        // 讀取設定 (自動下載、自動重整)
        chrome.storage.local.get(['autoDownloadMin', 'autoRefreshMin'], (result) => {
            if (result.autoDownloadMin && result.autoDownloadMin > 0) {
                startAutoDownloadTimer(result.autoDownloadMin);
            }
            if (result.autoRefreshMin && result.autoRefreshMin > 0) {
                startAutoRefreshTimer(result.autoRefreshMin);
            }
        });

        // ★ 低頻 fallback (60 秒) ★
        setInterval(() => {
            if (!document.hidden) debouncedSave();
        }, 60000);

        // ★ popstate 監聽已統一由 iconReplace.js 的 onNavigation() 處理 ★
        // （包含 replaceAllIcons + syncTabTitle + debouncedSave）

        console.log(`[GeminiSaver] v${GS_VERSION} initialized (MutationObserver + Icon + ScrollPreload + TabSync + MdFix + AccountTag + Watermark)`);
    } catch (e) {
        console.error('[GeminiSaver] init error:', e);
    }
}

// 接收來自 popup 的訊息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "scrape") {
        saveToStorage();
        sendResponse({ status: "ok" });
    } else if (msg.action === "openIconPanel") {
        createIconPanel();
        sendResponse({ status: "ok" });
    } else if (msg.action === "getTimerStatus") {
        sendResponse({
            autoDownload: !!autoDownloadInterval,
            autoRefresh: !!autoRefreshInterval
        });
    } else if (msg.action === "forceDownload") {
        showToast("📜 正在載入所有訊息...");
        scrollToLoadAllMessages().then(() => {
            saveToStorage();
            setTimeout(() => {
                const id = getConversationId();
                if (!id) return;
                const key = STORAGE_PREFIX + id;
                chrome.storage.local.get(key, (result) => {
                    const data = result[key];
                    if (data) {
                        chrome.runtime.sendMessage({
                            action: "download",
                            filename: `GeminiBackup/${data.botName || "Gemini"}-${data.title}_${new Date().toISOString().slice(0, 10)}.txt`,
                            content: formatContent(data)
                        });
                        showToast("📥 已觸發下載");
                    }
                });
            }, 3000);
        });
        sendResponse({ status: "ok" });
    } else if (msg.action === "startAutoDownload") {
        startAutoDownloadTimer(msg.minutes);
        sendResponse({ status: "ok" });
    } else if (msg.action === "stopAutoDownload") {
        if (autoDownloadInterval) clearInterval(autoDownloadInterval);
        autoDownloadInterval = null;
        sendResponse({ status: "ok" });
    } else if (msg.action === "startAutoRefresh") {
        startAutoRefreshTimer(msg.minutes);
        sendResponse({ status: "ok" });
    } else if (msg.action === "stopAutoRefresh") {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        sendResponse({ status: "ok" });
    }
    return true;
});

// ★ 延遲 1.5 秒啟動 ★
setTimeout(init, 1500);
