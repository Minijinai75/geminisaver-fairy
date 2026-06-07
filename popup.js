// popup.js

document.addEventListener('DOMContentLoaded', () => {
    // ★ 動態注入版本號 ★
    const verEl = document.getElementById('gs-popup-ver');
    if (verEl) verEl.textContent = chrome.runtime.getManifest().version;

    const intervalInput = document.getElementById('intervalInput');
    const refreshInput = document.getElementById('refreshInput');

    const tsDownload = document.getElementById('ts-download');
    const tsRefresh = document.getElementById('ts-refresh');

    const currentPageSection = document.getElementById('current-page-section');
    const titleDiv = document.getElementById('title-preview');
    const lastUpdatedSpan = document.getElementById('lastUpdated');
    const previewArea = document.getElementById('preview');
    const downloadBtn = document.getElementById('downloadBtn');
    const testLink = document.getElementById('testDownloadLink');
    const openDashboardBtn = document.getElementById('openDashboardBtn');
    const iconPanelBtn = document.getElementById('iconPanelBtn');
    const aboutBtn = document.getElementById('aboutBtn');

    const statusMsg = document.getElementById('status-msg');
    const autoJsonToggle = document.getElementById('autoJsonToggle');
    const tsJsonBackup = document.getElementById('ts-json-backup');
    const backupCloudToggle = document.getElementById('backupCloudToggle');
    const tsCloudToast = document.getElementById('ts-cloud-toast');
    const generalToastToggle = document.getElementById('generalToastToggle');
    const tsGeneralToast = document.getElementById('ts-general-toast');
    const errorToastToggle = document.getElementById('errorToastToggle');
    const tsErrorToast = document.getElementById('ts-error-toast');

    function setSimpleToggleStatus(labelEl, enabled, onText = '已啟用', offText = '已關閉') {
        labelEl.innerText = enabled ? onText : offText;
        labelEl.style.background = enabled ? '#e8f0fe' : '#f1f3f4';
    }

    // === 0. 時間格式工具 ===
    function getFormattedTime() {
        return new Date().toLocaleString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    }

    // === 1. 初始化設定與讀取時間 ===
    chrome.storage.local.get([
        'last_auto_download_ts', 'last_auto_refresh_ts',
        'autoDownloadMin', 'autoRefreshMin',
        'gs_backup_cloud_icon_enabled',
        'gs_general_toast_enabled',
        'gs_error_toast_enabled'
    ], (result) => {
        // 自動下載/重整
        intervalInput.value = result.autoDownloadMin ?? 0;
        refreshInput.value = result.autoRefreshMin ?? 0;



        if (result.last_auto_download_ts) {
            tsDownload.innerText = `執行: ${result.last_auto_download_ts}`;
            tsDownload.style.background = '#e8f0fe';
        } else {
            tsDownload.innerText = "尚無紀錄";
            tsDownload.style.background = '#f1f3f4';
        }

        if (result.last_auto_refresh_ts) {
            tsRefresh.innerText = `重整: ${result.last_auto_refresh_ts}`;
            tsRefresh.style.background = '#e8f0fe';
        } else {
            tsRefresh.innerText = "尚無紀錄";
            tsRefresh.style.background = '#f1f3f4';
        }

        const cloudEnabled = result.gs_backup_cloud_icon_enabled === true;
        backupCloudToggle.checked = cloudEnabled;
        setSimpleToggleStatus(tsCloudToast, cloudEnabled, '已啟用', '預設關閉');

        const generalEnabled = result.gs_general_toast_enabled !== false;
        generalToastToggle.checked = generalEnabled;
        setSimpleToggleStatus(tsGeneralToast, generalEnabled);

        const errorEnabled = result.gs_error_toast_enabled !== false;
        errorToastToggle.checked = errorEnabled;
        setSimpleToggleStatus(tsErrorToast, errorEnabled);
    });

    // === 1.5 每日自動備份 JSON 初始化 ===
    chrome.runtime.sendMessage({ action: 'getAutoJsonBackupStatus' }, (resp) => {
        if (chrome.runtime.lastError || !resp) {
            tsJsonBackup.innerText = '無法取得';
            return;
        }
        autoJsonToggle.checked = resp.enabled;
        if (resp.lastDate) {
            tsJsonBackup.innerText = `上次: ${resp.lastDate}`;
            tsJsonBackup.style.background = '#e8f0fe';
        } else {
            tsJsonBackup.innerText = resp.enabled ? '等待備份...' : '未啟用';
            tsJsonBackup.style.background = '#f1f3f4';
        }
    });

    autoJsonToggle.addEventListener('change', () => {
        const enabled = autoJsonToggle.checked;
        chrome.runtime.sendMessage({ action: 'setAutoJsonBackup', enabled }, () => {
            if (enabled) {
                tsJsonBackup.innerText = '已啟用，等待備份...';
                tsJsonBackup.style.background = '#e8f0fe';
            } else {
                tsJsonBackup.innerText = '未啟用';
                tsJsonBackup.style.background = '#f1f3f4';
            }
        });
    });

    backupCloudToggle.addEventListener('change', () => {
        const enabled = backupCloudToggle.checked;
        chrome.storage.local.set({ 'gs_backup_cloud_icon_enabled': enabled }, () => {
            setSimpleToggleStatus(tsCloudToast, enabled, '已啟用', '預設關閉');
        });
    });

    generalToastToggle.addEventListener('change', () => {
        const enabled = generalToastToggle.checked;
        chrome.storage.local.set({ 'gs_general_toast_enabled': enabled }, () => {
            setSimpleToggleStatus(tsGeneralToast, enabled);
        });
    });

    errorToastToggle.addEventListener('change', () => {
        const enabled = errorToastToggle.checked;
        chrome.storage.local.set({ 'gs_error_toast_enabled': enabled }, () => {
            setSimpleToggleStatus(tsErrorToast, enabled);
        });
    });



    // 自動下載設定
    intervalInput.addEventListener('change', () => {
        const val = parseInt(intervalInput.value);
        if (!isNaN(val) && val >= 0) {
            chrome.storage.local.set({ 'autoDownloadMin': val });
            // 通知 content.js
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    if (val > 0) {
                        chrome.tabs.sendMessage(tabs[0].id, { action: "startAutoDownload", minutes: val });
                    } else {
                        chrome.tabs.sendMessage(tabs[0].id, { action: "stopAutoDownload" });
                    }
                }
            });
        }
    });

    // 自動重整設定
    refreshInput.addEventListener('change', () => {
        const val = parseInt(refreshInput.value);
        if (!isNaN(val) && val >= 0) {
            chrome.storage.local.set({ 'autoRefreshMin': val });
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    if (val > 0) {
                        chrome.tabs.sendMessage(tabs[0].id, { action: "startAutoRefresh", minutes: val });
                    } else {
                        chrome.tabs.sendMessage(tabs[0].id, { action: "stopAutoRefresh" });
                    }
                }
            });
        }
    });

    // === 2. 開啟 Dashboard ===
    openDashboardBtn.onclick = () => {
        const targetUrl = chrome.runtime.getURL("dashboard.html");
        chrome.tabs.query({}, (tabs) => {
            const existingTab = tabs.find(tab => tab.url === targetUrl);
            if (existingTab) {
                chrome.tabs.update(existingTab.id, { active: true });
                chrome.windows.update(existingTab.windowId, { focused: true });
                chrome.tabs.reload(existingTab.id);
            } else {
                chrome.tabs.create({ url: 'dashboard.html' });
            }
        });
    };

    // === 2.5 Icon 設定面板 ===
    iconPanelBtn.onclick = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id && tabs[0]?.url?.includes('gemini.google.com')) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "openIconPanel" }, (response) => {
                    if (chrome.runtime.lastError) {
                        statusMsg.innerText = "❌ 請先開啟 Gemini 頁面";
                    }
                });
            } else {
                statusMsg.innerText = "❌ 請先開啟 Gemini 頁面";
            }
        });
    };

    // === 2.6 關於 ===
    aboutBtn.onclick = () => {
        chrome.tabs.create({ url: 'https://minijinai75.notion.site/geminisaver-fairy' });
    };

    // === 2.7 匯入備份檔 ===
    const importBackupBtn = document.getElementById('importBackupBtn');
    const importBackupFile = document.getElementById('importBackupFile');
    const importStatus = document.getElementById('importStatus');

    importBackupBtn.onclick = () => importBackupFile.click();

    importBackupFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        importStatus.innerText = '⏳ 讀取中...';
        importStatus.style.color = '#888';

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const raw = JSON.parse(reader.result);
                if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
                    importStatus.innerText = '❌ 檔案格式不正確（需為 JSON 物件）';
                    importStatus.style.color = '#e74c3c';
                    return;
                }

                let storageData = null;
                let desc = '';

                // ★ 格式 A：每日自動備份（full_backup，有 data 欄位）
                if (raw.exportType === 'full_backup' && raw.data && typeof raw.data === 'object') {
                    storageData = raw.data;
                    const keyCount = Object.keys(storageData).length;
                    desc = `（自動備份格式）共 ${keyCount} 筆資料`;
                }
                // ★ 格式 B：Dashboard 匯出（有 backups 陣列）
                else if (raw.backups && Array.isArray(raw.backups)) {
                    storageData = {};
                    let count = 0;
                    for (const backup of raw.backups) {
                        if (backup && backup.key) {
                            const { key, ...backupData } = backup;
                            storageData[key] = backupData;
                            count++;
                        } else if (backup && backup.id) {
                            storageData[`backup_${backup.id}`] = backup;
                            count++;
                        }
                    }
                    // 還原設定
                    if (raw.settings) {
                        if (raw.settings.customPrompt !== undefined) {
                            storageData['gemini_custom_prompt_setting'] = raw.settings.customPrompt;
                        }
                        if (raw.settings.clipboard !== undefined) {
                            storageData['gemini_clipboard_data'] = JSON.stringify(raw.settings.clipboard);
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
                        for (const [jsonKey, storageKey] of Object.entries(settingsMap)) {
                            if (raw.settings[jsonKey] != null) {
                                storageData[storageKey] = raw.settings[jsonKey];
                            }
                        }
                    }
                    desc = `（備份檔格式）共 ${count} 筆對話`;
                }
                // ★ 格式 C：直接 storage dump（原始格式）
                else {
                    storageData = raw;
                    desc = `共 ${Object.keys(storageData).length} 筆資料`;
                }

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

                    chrome.storage.local.set(storageData, () => {
                        if (chrome.runtime.lastError) {
                            importStatus.innerText = `❌ 匯入失敗：${chrome.runtime.lastError.message}`;
                            importStatus.style.color = '#e74c3c';
                        } else {
                            let msg = `✅ 匯入成功！${desc}`;
                            if (keptLocalCount > 0) {
                                msg += `（保留本機 ${keptLocalCount} 筆）`;
                            }
                            importStatus.innerText = msg;
                            importStatus.style.color = '#27ae60';
                        }
                    });
                });
            } catch (err) {
                importStatus.innerText = '❌ JSON 解析失敗，請確認檔案格式';
                importStatus.style.color = '#e74c3c';
            }
        };
        reader.readAsText(file);
        importBackupFile.value = '';
    });


    // === 3. 強制觸發自動下載 ===
    testLink.onclick = (e) => {
        e.preventDefault();
        testLink.innerText = "指令中...";
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "forceDownload" }, () => {
                    if (chrome.runtime.lastError) {
                        testLink.innerText = "錯誤!";
                    } else {
                        testLink.innerText = "已觸發!";
                    }
                    setTimeout(() => testLink.innerText = "[強制觸發自動下載]", 2000);

                    const now = getFormattedTime();
                    tsDownload.innerText = `執行: ${now}`;
                    tsDownload.style.background = '#e8f0fe';
                });
            }
        });
    };

    // === 4. 即時抓取當前頁面內容 ===
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        const isGemini = currentTab.url && currentTab.url.includes("gemini.google.com");

        if (isGemini) {
            currentPageSection.style.display = 'block';
            statusMsg.innerText = "";

            // 從 storage 嘗試讀取當前頁面備份
            tryLoadFromStorage(currentTab.url);
        } else {
            statusMsg.innerText = "請在 Gemini 頁面使用此功能";
            currentPageSection.style.display = 'none';
        }
    });

    function tryLoadFromStorage(targetUrl) {
        chrome.storage.local.get(null, (items) => {
            const keys = Object.keys(items).filter(k => k.startsWith('backup_'));
            let foundData = null;
            for (const key of keys) {
                if (items[key].url === targetUrl) {
                    foundData = items[key];
                    break;
                }
            }
            if (foundData) updateUI(foundData);
            else {
                titleDiv.innerText = "等待頁面回應...";
                previewArea.value = "尚未抓取到內容，請稍待或是重新整理頁面。";
            }
        });
    }

    function updateUI(data) {
        if (data) {
            const bName = data.botName || "Gemini";
            titleDiv.innerText = `${bName}-${data.title}`;
            lastUpdatedSpan.innerText = data.lastUpdated || '--';
            const content = data.rawContent || '';
            previewArea.value = content.substring(0, 500) + (content.length > 500 ? "..." : "");
            downloadBtn.onclick = () => {
                const formatted = formatContent(data);
                downloadStringAsFile(formatted, `${bName}-${data.title}`);
            };
        }
    }

    function formatContent(data) {
        const bName = data.botName || "Gemini";
        const dUrl = data.url || "https://gemini.google.com/";
        let safeContent = data.rawContent || "";
        if (bName !== "Gemini" && safeContent.includes("Gemini(GEMINI)：")) {
            safeContent = safeContent.replaceAll("Gemini(GEMINI)：", `${bName}(GEMINI)：`);
        }
        return `${bName}-${data.title}\n網址：${dUrl}\n最後更新時間 ${data.lastUpdated}\n---\n${safeContent}`;
    }

    function downloadStringAsFile(content, title) {
        const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_');
        const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeTitle}_手動下載.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 200);
    }

    // === 5. 監聽 Storage 變化 ===
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.last_auto_download_ts) {
                tsDownload.innerText = `執行: ${changes.last_auto_download_ts.newValue}`;
                tsDownload.style.background = '#e8f0fe';
            }
            if (changes.last_auto_refresh_ts) {
                tsRefresh.innerText = `重整: ${changes.last_auto_refresh_ts.newValue}`;
                tsRefresh.style.background = '#e8f0fe';
            }
            if (changes.gs_backup_cloud_icon_enabled) {
                const enabled = changes.gs_backup_cloud_icon_enabled.newValue === true;
                backupCloudToggle.checked = enabled;
                setSimpleToggleStatus(tsCloudToast, enabled, '已啟用', '預設關閉');
            }
            if (changes.gs_general_toast_enabled) {
                const enabled = changes.gs_general_toast_enabled.newValue !== false;
                generalToastToggle.checked = enabled;
                setSimpleToggleStatus(tsGeneralToast, enabled);
            }
            if (changes.gs_error_toast_enabled) {
                const enabled = changes.gs_error_toast_enabled.newValue !== false;
                errorToastToggle.checked = enabled;
                setSimpleToggleStatus(tsErrorToast, enabled);
            }
            // 即時更新預覽
            const backupChanges = Object.keys(changes).filter(k => k.startsWith('backup_'));
            if (backupChanges.length > 0) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]?.url) tryLoadFromStorage(tabs[0].url);
                });
            }
            // 每日自動備份 JSON 狀態即時更新
            if (changes.gs_last_auto_json_date) {
                tsJsonBackup.innerText = `上次: ${changes.gs_last_auto_json_date.newValue}`;
                tsJsonBackup.style.background = '#e8f0fe';
            }
        }
    });
});
