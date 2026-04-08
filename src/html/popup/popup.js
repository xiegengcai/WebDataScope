// Description: 弹出窗口的 JS 文件
console.log('popup.js loaded');

// 获取 HTML 元素
const dbAddressInput = document.getElementById('dbAddress');
const hiddenFeatureCheckbox = document.getElementById('hiddenFeature');
const dataAnalysisCheckbox = document.getElementById('dataAnalysis');
const geniusCombineTagCheckbox = document.getElementById('geniusCombineTag');
const geniusAlphaCountInput = document.getElementById('geniusAlphaCount');
const apiMonitorEnabledCheckbox = document.getElementById('apiMonitorEnabled');
const saveBtn = document.getElementById('saveBtn');
const statusText = document.getElementById('status');
const settingsForm = document.getElementById('settingsForm');
const exportCommunityBtn = document.getElementById('exportCommunityBtn');
const exportCommunityCompressedBtn = document.getElementById('exportCommunityCompressedBtn');
const importCommunityBtn = document.getElementById('importCommunityBtn');
const importCommunityFile = document.getElementById('importCommunityFile');

// ProdMemo 元素
const prodMemoCountEl = document.getElementById('prodmemo-count');
const exportProdMemoBtn = document.getElementById('exportProdMemoBtn');
const clearProdMemoBtn = document.getElementById('clearProdMemoBtn');
const importProdMemoBtn = document.getElementById('importProdMemoBtn');
const importProdMemoFile = document.getElementById('importProdMemoFile');

// 加载用户设置
function loadSettings() {
    statusText.textContent = '加载中...';
    chrome.storage.local.get('WQPSettings', ({ WQPSettings }) => {
        dbAddressInput.value = WQPSettings.apiAddress || '';
        hiddenFeatureCheckbox.checked = WQPSettings.hiddenFeatureEnabled || false;
        dataAnalysisCheckbox.checked = WQPSettings.dataAnalysisEnabled || false;
        geniusCombineTagCheckbox.checked = WQPSettings.geniusCombineTag || false;
        geniusAlphaCountInput.value = WQPSettings.geniusAlphaCount || 40;
        apiMonitorEnabledCheckbox.checked = WQPSettings.apiMonitorEnabled || false;

        saveBtn.disabled = !dbAddressInput.value.trim();
        statusText.textContent = '';
    });

    // 加载 ProdMemo 缓存数量
    loadProdMemoCount();

}

// 加载 ProdMemo 缓存数量
function loadProdMemoCount() {
    chrome.storage.local.get(null, (allData) => {
        let count = 0;
        for (const key of Object.keys(allData)) {
            if (key.startsWith('prod_memo_')) {
                count++;
            }
        }
        if (prodMemoCountEl) {
            prodMemoCountEl.textContent = count;
        }
    });
}

// 保存用户设置
function saveSettings(event) {
    event.preventDefault();
    saveBtn.disabled = true;
    const WQPSettings = {
        apiAddress: dbAddressInput.value.trim(),
        hiddenFeatureEnabled: hiddenFeatureCheckbox.checked,
        dataAnalysisEnabled: dataAnalysisCheckbox.checked,
        geniusCombineTag: geniusCombineTagCheckbox.checked,
        geniusAlphaCount: parseInt(geniusAlphaCountInput.value) || 40,
        apiMonitorEnabled: apiMonitorEnabledCheckbox.checked
    };

    if (!WQPSettings.apiAddress) {
        showStatusMessage('请输入有效的地址！', false);
        saveBtn.disabled = false;
        return;
    }
    chrome.storage.local.set({ WQPSettings }, () => {
        if (chrome.runtime.lastError) {
            showStatusMessage('保存失败，请重试！', false);
            saveBtn.disabled = false;
        } else {
            showStatusMessage('设置已保存！', true);
            setTimeout(() => {
                statusText.textContent = '';
                saveBtn.disabled = false;
            }, 2000);
        }
    });
}

// 显示状态信息
function showStatusMessage(message, isSuccess = true) {
    statusText.textContent = message;
    statusText.className = isSuccess ? 'success' : 'error';
}

// 事件监听：表单提交
settingsForm.addEventListener('submit', saveSettings);

// 监听输入框内容变化，启用或禁用按钮
dbAddressInput.addEventListener('input', () => {
    saveBtn.disabled = !dbAddressInput.value.trim();
});

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', loadSettings);

// ========== 社区数据 导出/导入 ==========
function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadBytes(filename, bytes, mime = 'application/octet-stream') {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function formatNow() {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function handleExportCommunity() {
    statusText.textContent = '导出中...';
    chrome.storage.local.get('WQPCommunityState', ({ WQPCommunityState }) => {
        try {
            if (!WQPCommunityState) {
                showStatusMessage('没有可导出的社区数据。', false);
                return;
            }
            const json = JSON.stringify(WQPCommunityState, null, 2);
            downloadText(`WQPCommunityState_${formatNow()}.json`, json);
            showStatusMessage('导出完成。', true);
        } catch (e) {
            console.error(e);
            showStatusMessage('导出失败。', false);
        }
    });
}

function handleExportCommunityCompressed() {
    statusText.textContent = '导出(压缩)中...';
    chrome.storage.local.get('WQPCommunityState', ({ WQPCommunityState }) => {
        try {
            if (!WQPCommunityState) {
                showStatusMessage('没有可导出的社区数据。', false);
                return;
            }
            // 使用 msgpack 编码 + pako 压缩
            const packed = msgpack.encode(WQPCommunityState);
            const deflated = pako.deflate(packed);
            downloadBytes(`WQPCommunityState_${formatNow()}.wqcs`, deflated, 'application/octet-stream');
            showStatusMessage('压缩导出完成。', true);
        } catch (e) {
            console.error(e);
            showStatusMessage('压缩导出失败。', false);
        }
    });
}

function handleImportClick() {
    if (importCommunityFile) importCommunityFile.value = '';
    importCommunityFile.click();
}

function handleImportFileChange(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    statusText.textContent = '导入中...';
    const isCompressed = /\.wqcs$/i.test(file.name);
    const reader = new FileReader();
    if (isCompressed) {
        reader.onload = () => {
            try {
                const arr = new Uint8Array(reader.result);
                const inflated = pako.inflate(arr);
                const obj = msgpack.decode(inflated);
                chrome.storage.local.set({ WQPCommunityState: obj }, () => {
                    if (chrome.runtime.lastError) {
                        showStatusMessage('写入存储失败。', false);
                    } else {
                        showStatusMessage('导入成功。', true);
                    }
                });
            } catch (e) {
                console.error(e);
                showStatusMessage('导入失败：压缩内容无法解析。', false);
            }
        };
        reader.onerror = () => showStatusMessage('读取文件失败。', false);
        reader.readAsArrayBuffer(file);
    } else {
        reader.onload = () => {
            try {
                const obj = JSON.parse(reader.result);
                chrome.storage.local.set({ WQPCommunityState: obj }, () => {
                    if (chrome.runtime.lastError) {
                        showStatusMessage('写入存储失败。', false);
                    } else {
                        showStatusMessage('导入成功。', true);
                    }
                });
            } catch (e) {
                console.error(e);
                showStatusMessage('导入失败：不是合法的 JSON。', false);
            }
        };
        reader.onerror = () => showStatusMessage('读取文件失败。', false);
        reader.readAsText(file, 'utf-8');
    }
}

exportCommunityBtn?.addEventListener('click', handleExportCommunity);
exportCommunityCompressedBtn?.addEventListener('click', handleExportCommunityCompressed);
importCommunityBtn?.addEventListener('click', handleImportClick);
importCommunityFile?.addEventListener('change', handleImportFileChange);

// ========== ProdMemo 导出/导入/清空 ==========
function handleExportProdMemo() {
    statusText.textContent = '导出中...';
    chrome.storage.local.get(null, (allData) => {
        try {
            const memoData = {};
            for (const [key, value] of Object.entries(allData)) {
                if (key.startsWith('prod_memo_')) {
                    memoData[key] = value;
                }
            }

            if (Object.keys(memoData).length === 0) {
                showStatusMessage('没有可导出的缓存数据。', false);
                return;
            }

            const json = JSON.stringify(memoData, null, 2);
            downloadText(`prodmemo_export_${formatNow()}.json`, json);
            showStatusMessage('导出完成。', true);
        } catch (e) {
            console.error(e);
            showStatusMessage('导出失败。', false);
        }
    });
}


function handleClearProdMemo() {
    if (!confirm('确定要清空所有 Prod Correlation 缓存数据吗？此操作不可恢复。')) {
        return;
    }

    statusText.textContent = '清空中...';
    chrome.storage.local.get(null, (allData) => {
        const keysToRemove = Object.keys(allData).filter(key => key.startsWith('prod_memo_'));

        if (keysToRemove.length === 0) {
            showStatusMessage('没有可清空的缓存数据。', false);
            return;
        }

        chrome.storage.local.remove(keysToRemove, () => {
            if (chrome.runtime.lastError) {
                showStatusMessage('清空失败。', false);
            } else {
                showStatusMessage(`已清空 ${keysToRemove.length} 条缓存数据。`, true);
                loadProdMemoCount();
            }
        });
    });
}

function handleImportProdMemoClick() {
    if (importProdMemoFile) importProdMemoFile.value = '';
    importProdMemoFile.click();
}

function handleImportProdMemoFileChange(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;

    statusText.textContent = '导入中...';
    const reader = new FileReader();

    reader.onload = () => {
        try {
            const importedData = JSON.parse(reader.result);

            // 验证数据格式并转换
            let validCount = 0;
            const dataToImport = {};

            for (const [key, value] of Object.entries(importedData)) {
                // 支持两种格式：
                // 1. 原 ProdMemo 格式: "alphaId" -> 转换为 "prod_memo_alphaId"
                // 2. WQScope 格式: "prod_memo_alphaId" -> 直接使用
                if (value && typeof value === 'object' && value.result !== undefined) {
                    let storageKey;
                    if (key.startsWith('prod_memo_')) {
                        storageKey = key;
                    } else {
                        // 原 ProdMemo 格式，需要添加前缀
                        storageKey = `prod_memo_${key}`;
                    }
                    dataToImport[storageKey] = value;
                    validCount++;
                }
            }

            if (validCount === 0) {
                showStatusMessage('导入失败：文件中没有有效的缓存数据。', false);
                return;
            }

            chrome.storage.local.set(dataToImport, () => {
                if (chrome.runtime.lastError) {
                    showStatusMessage('写入存储失败。', false);
                } else {
                    showStatusMessage(`成功导入 ${validCount} 条缓存数据。`, true);
                    loadProdMemoCount();
                }
            });
        } catch (e) {
            console.error(e);
            showStatusMessage('导入失败：不是合法的 JSON 文件。', false);
        }
    };

    reader.onerror = () => showStatusMessage('读取文件失败。', false);
    reader.readAsText(file, 'utf-8');
}


exportProdMemoBtn?.addEventListener('click', handleExportProdMemo);
clearProdMemoBtn?.addEventListener('click', handleClearProdMemo);
importProdMemoBtn?.addEventListener('click', handleImportProdMemoClick);
importProdMemoFile?.addEventListener('change', handleImportProdMemoFileChange);