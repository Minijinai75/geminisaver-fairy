// background.js — Service Worker

// 統一時間格式 (與 content.js 一致)
function getFormattedTime() {
    return new Date().toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ★ 新版 content.js 用的 download action ★
    if (request.action === "download") {
        try {
            const blob = new Blob(['\uFEFF' + request.content], { type: 'text/plain;charset=utf-8' });
            const reader = new FileReader();
            reader.onload = function () {
                chrome.downloads.download({
                    url: reader.result,
                    filename: request.filename,
                    conflictAction: 'uniquify',
                    saveAs: false
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error("[GeminiSaver] Download failed:", chrome.runtime.lastError.message);
                    } else {
                        chrome.storage.local.set({ 'last_auto_download_ts': getFormattedTime() });
                    }
                });
            };
            reader.readAsDataURL(blob);
        } catch (err) {
            console.error("[GeminiSaver] Download error:", err);
        }
        return true;
    }

    if (request.action === "download_file") {
        try {
            const blob = new Blob([request.content], { type: 'text/plain;charset=utf-8' });
            const reader = new FileReader();

            reader.onload = function () {
                const dataUrl = reader.result;

                chrome.downloads.download({
                    url: dataUrl,
                    filename: request.filename,
                    conflictAction: 'uniquify',
                    saveAs: false
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error("[GeminiSaver] Download failed:", chrome.runtime.lastError.message);
                        return;
                    }

                    const timestamp = getFormattedTime();
                    const key = request.storageKey;

                    if (key) {
                        chrome.storage.local.get([key], (result) => {
                            if (chrome.runtime.lastError) {
                                console.warn("[GeminiSaver] Storage get failed:", chrome.runtime.lastError.message);
                                return;
                            }

                            const oldData = result[key] || {};
                            const newData = {
                                ...oldData,
                                lastDownloadTime: timestamp,
                                lastDownloadId: downloadId
                            };

                            const updateObj = {};
                            updateObj[key] = newData;

                            chrome.storage.local.set(updateObj, () => {
                                if (chrome.runtime.lastError) {
                                    console.warn("[GeminiSaver] Storage set failed:", chrome.runtime.lastError.message);
                                }
                            });
                        });
                    }
                });
            };

            reader.onerror = function () {
                console.error("[GeminiSaver] FileReader error:", reader.error);
            };

            reader.readAsDataURL(blob);
        } catch (err) {
            console.error("[GeminiSaver] Download process error:", err);
        }

        return true;
    }

    // ★★★ 每日自動備份 JSON 設定開關 ★★★
    if (request.action === "setAutoJsonBackup") {
        const enabled = !!request.enabled;
        chrome.storage.local.set({ gs_auto_json_enabled: enabled }, () => {
            if (enabled) {
                setupAutoJsonAlarm();
                console.log("[GeminiSaver] 每日自動備份所有資料: 已啟用");
            } else {
                chrome.alarms.clear('gs-daily-json-backup');
                console.log("[GeminiSaver] 每日自動備份所有資料: 已關閉");
            }
        });
        sendResponse({ status: "ok" });
        return true;
    }

    if (request.action === "getAutoJsonBackupStatus") {
        chrome.storage.local.get(['gs_auto_json_enabled', 'gs_last_auto_json_date'], (result) => {
            sendResponse({
                enabled: !!result.gs_auto_json_enabled,
                lastDate: result.gs_last_auto_json_date || null
            });
        });
        return true;
    }

    // ★ v10.0.0: 浮動面板 openTab ★
    if (request.action === "openTab") {
        const targetUrl = request.url;
        chrome.tabs.query({}, (tabs) => {
            const existingTab = tabs.find(tab => tab.url === targetUrl || tab.url?.startsWith(targetUrl.split('#')[0]));
            if (existingTab) {
                chrome.tabs.update(existingTab.id, { active: true });
                chrome.windows.update(existingTab.windowId, { focused: true });
                // 如果有 hash 變化，需要 reload
                if (targetUrl.includes('#')) {
                    chrome.tabs.update(existingTab.id, { url: targetUrl });
                }
            } else {
                chrome.tabs.create({ url: targetUrl });
            }
        });
        sendResponse({ status: "ok" });
        return true;
    }
});

// ==========================================
// ★★★ 每日自動備份 JSON (chrome.alarms) ★★★
// ==========================================
const GS_ALARM_NAME = 'gs-daily-json-backup';

function getTodayStr() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function setupAutoJsonAlarm() {
    // 每 30 分鐘檢查一次（避免錯過午夜換日）
    chrome.alarms.create(GS_ALARM_NAME, { periodInMinutes: 30 });
    console.log("[GeminiSaver] Daily JSON backup alarm set (every 30 min check)");
}

// 執行每日備份（全量：所有設定 + 所有對話）
function performDailyJsonBackup() {
    const today = getTodayStr();
    chrome.storage.local.get(['gs_auto_json_enabled', 'gs_last_auto_json_date'], (result) => {
        if (!result.gs_auto_json_enabled) return;
        if (result.gs_last_auto_json_date === today) {
            console.log("[GeminiSaver] 今日已備份，跳過");
            return;
        }

        // 讀取所有 storage 資料（設定 + 對話）
        chrome.storage.local.get(null, (items) => {
            const allKeys = Object.keys(items);
            if (allKeys.length === 0) {
                console.log("[GeminiSaver] 沒有任何資料，跳過自動備份");
                return;
            }

            // ★ 使用與 Dashboard 匯出完全一致的格式（格式 B）★
            const backupKeys = allKeys.filter(k => k.startsWith('backup_'));
            const backups = backupKeys.map(key => ({ key, ...items[key] }));

            if (backups.length === 0) {
                console.log("[GeminiSaver] 沒有備份資料，跳過自動備份");
                return;
            }

            const STORAGE_PROMPT = 'gemini_custom_prompt_setting';
            const STORAGE_CLIPBOARD = 'gemini_clipboard_data';

            const exportData = {
                version: chrome.runtime.getManifest().version,
                exportDate: new Date().toISOString(),
                totalBackups: backups.length,
                backups: backups,
                settings: {
                    customPrompt: items[STORAGE_PROMPT] || '',
                    clipboard: (() => {
                        try { return JSON.parse(items[STORAGE_CLIPBOARD] || '[]'); }
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
            const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
            const reader = new FileReader();

            reader.onload = function () {
                const yyyymmdd = today.replace(/-/g, '');
                chrome.downloads.download({
                    url: reader.result,
                    filename: `GeminiBackup/GeminiSaver Fairy 自動備份小精靈備份檔案-${yyyymmdd}.json`,
                    conflictAction: 'uniquify',
                    saveAs: false
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        console.error("[GeminiSaver] 自動備份下載失敗:", chrome.runtime.lastError.message);
                        return;
                    }
                    // 記錄今日已備份
                    chrome.storage.local.set({
                        gs_last_auto_json_date: today,
                        gs_last_auto_json_ts: getFormattedTime()
                    }, () => {
                        console.log(`[GeminiSaver] ✅ 每日全量備份完成: ${allKeys.length} 個 key → GeminiSaver_FullBackup_${today}.json`);
                    });
                });
            };
            reader.readAsDataURL(blob);
        });
    });
}

// Alarm 觸發
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === GS_ALARM_NAME) {
        performDailyJsonBackup();
    }
});

// Service Worker 啟動時設定 alarm（若功能已啟用）
chrome.storage.local.get(['gs_auto_json_enabled'], (result) => {
    if (result.gs_auto_json_enabled) {
        setupAutoJsonAlarm();
        // 啟動時也檢查一次
        performDailyJsonBackup();
    }
});

