# ProdMemo 功能整合清单

> 本文档记录了将 ProdMemo 插件功能整合到 WebDataScope 时所做的修改，便于后续版本更新时跟进处理。

## 一、新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/scripts/prodmemo/prodmemo-content.js` | ProdMemo 内容脚本，处理消息监听和 DOM 操作 |
| `src/css/prodmemo.css` | ProdMemo 样式文件 |

## 二、修改的文件

### 1. manifest.json

**修改位置**: `content_scripts` 和 `web_accessible_resources` 部分

**修改内容**:
```json
// 添加 ProdMemo content script
{
    "matches": [
        "*://platform.worldquantbrain.com/alpha/*",
        "*://platform.worldquantbrain.com/alphas/*",
        "*://platform.worldquantbrain.com/simulate*"
    ],
    "js": [
        "src/scripts/prodmemo/prodmemo-content.js"
    ],
    "css": [
        "src/css/prodmemo.css"
    ],
    "run_at": "document_start"
}
```

**注意事项**:
- 确保 `matches` 包含所有需要 ProdMemo 功能的页面
- `run_at: "document_start"` 确保尽早注入

---

### 2. src/scripts/background.js

**修改位置 1**: `chrome.webNavigation.onCommitted` 监听器

**修改内容**: 排除 genius 页面，避免干扰 genius 功能

```javascript
chrome.webNavigation.onCommitted.addListener((details) => {
    // 只处理顶层主框架，忽略 iframe
    if (details.frameId !== 0) return;
    if (!details.url || !details.url.includes('platform.worldquantbrain.com')) return;
    // 排除 genius 页面，避免干扰 genius 功能
    if (details.url.includes('/genius')) return;
    injectFetchInterceptor(details.tabId);
}, { url: [{ hostContains: 'platform.worldquantbrain.com' }] });
```

**注意事项**:
- 必须排除 genius 页面，否则 `injectFetchInterceptor` 会干扰 genius 功能的正常运行

---

**修改位置 2**: `injectFetchInterceptor` 函数内

**修改内容**: 在现有的 fetch 拦截器中添加 ProdMemo 的 API 拦截逻辑

```javascript
// 在 window.fetch = async function (...args) { ... } 内部添加：

// ========== ProdMemo 拦截逻辑 ==========
try {
    const responseUrl = response.url;

    // 1. 拦截 Prod Correlation 数据
    if (responseUrl.includes('/correlations/prod')) {
        const prodMatch = responseUrl.match(/\/alphas\/([^/]+)\/correlations\/prod/);
        if (prodMatch && response.ok && response.status !== 204) {
            const alphaId = prodMatch[1];
            const clone = response.clone();
            clone.text().then(text => {
                if (!text) return;
                try {
                    const data = JSON.parse(text);
                    window.postMessage({
                        type: 'WQSCOPE_PRODMEMO_DATA',
                        alphaId: alphaId,
                        data: data
                    }, '*');
                } catch (parseErr) {}
            }).catch(() => {});
        }
    }

    // 2. 拦截 Alpha Page Load (Recordsets) 触发 UI 检查
    const recordsetsMatch = responseUrl.match(/\/alphas\/([^/]+)\/recordsets(?:[?#]|$)/);
    if (recordsetsMatch) {
        const alphaId = recordsetsMatch[1];
        window.postMessage({
            type: 'WQSCOPE_PRODMEMO_VIEW',
            alphaId: alphaId
        }, '*');
    }

    // 3. 拦截 Alpha List API 在列表中显示 correlations
    if (responseUrl.includes('/users/self/alphas') && !responseUrl.includes('/alphas/')) {
        if (response.ok && response.status !== 204) {
            const clone = response.clone();
            clone.json().then(data => {
                if (data.results && Array.isArray(data.results)) {
                    const alphaIds = data.results.map(r => r.id);
                    const isDataMap = {};
                    data.results.forEach(alpha => {
                        const alphaId = alpha.id;
                        let isPassed = null;
                        let multiplier = null;
                        let pyramids = [];

                        if (alpha.is && alpha.is.checks) {
                            const checks = alpha.is.checks;
                            const hasFail = checks.some(c => c?.result === 'FAIL');
                            isPassed = !hasFail;

                            const pyramidCheck = checks.find(c => c && c.name === 'MATCHES_PYRAMID');
                            if (pyramidCheck) {
                                multiplier = pyramidCheck.multiplier;
                                if (pyramidCheck.pyramids && Array.isArray(pyramidCheck.pyramids)) {
                                    pyramids = pyramidCheck.pyramids.map(p => {
                                        const nameParts = p.name.split('/');
                                        return nameParts[nameParts.length - 1].toLowerCase();
                                    });
                                }
                            }
                        }

                        isDataMap[alphaId] = { isPassed, multiplier, pyramids: pyramids.join(',') };
                    });

                    window.postMessage({
                        type: 'WQSCOPE_PRODMEMO_LIST',
                        alphaIds: alphaIds,
                        isDataMap: isDataMap
                    }, '*');
                }
            }).catch(() => {});
        }
    }
} catch (e) {}
// ========== ProdMemo 拦截逻辑结束 ==========
```

**注意事项**:
- 此代码段需放在 `const response = await originalFetch.apply(this, args);` 之后
- 确保在 `return response;` 之前执行
- 使用 try-catch 包裹避免影响原有功能

---

### 3. src/html/popup/popup.html

**修改位置**: 在 `</form>` 之后，`</div>`（container 结束）之前

**修改内容**:
```html
<h2 style="margin-top:16px;text-align:left;">Prod Correlation 缓存</h2>
<div class="input-group">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span>已缓存 Alpha 数量:</span>
        <span id="prodmemo-count" style="font-weight:bold;color:#00dbb5;">0</span>
    </div>
    <div class="btn-row" style="width:100%">
        <button id="exportProdMemoBtn" type="button">导出缓存</button>
        <button id="clearProdMemoBtn" type="button" style="background-color:#dc3545;">清空缓存</button>
    </div>
    <button id="importProdMemoBtn" type="button" style="background-color:#6c757d;width:100%;margin-top:8px;">导入缓存</button>
    <input id="importProdMemoFile" type="file" accept="application/json,.json" style="display:none;" />
</div>
```

---

### 4. src/html/popup/popup.js

**修改位置**: 文件末尾，添加事件监听器之前

**修改内容 1 - 变量声明**（在文件开头附近添加）:
```javascript
// ProdMemo 元素
const prodMemoCountEl = document.getElementById('prodmemo-count');
const exportProdMemoBtn = document.getElementById('exportProdMemoBtn');
const clearProdMemoBtn = document.getElementById('clearProdMemoBtn');
const importProdMemoBtn = document.getElementById('importProdMemoBtn');
const importProdMemoFile = document.getElementById('importProdMemoFile');
```

**修改内容 2 - 加载缓存数量**（在 `loadSettings()` 函数末尾添加）:
```javascript
// 加载 ProdMemo 缓存数量
loadProdMemoCount();
```

**修改内容 3 - 新增函数**:
```javascript
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
```

**修改内容 4 - 事件处理函数**（在文件末尾添加）:
```javascript
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
```

---

## 三、数据存储格式

ProdMemo 使用以下存储键格式：

```
prod_memo_{alphaId}: {
    timestamp: <unix_timestamp>,
    result: {
        max: <number>,
        min: <number>,
        records: [...]  // 可选，详细分布数据
    }
}
```

**导入兼容性**:
- 支持原 ProdMemo 插件导出的格式（key 为 alphaId）
- 支持 WQScope 格式（key 为 prod_memo_alphaId）

---

## 四、列表视图增强功能（2026-04-08 更新）

### 1. Prod Corr 列整合显示

**位置**: `src/scripts/prodmemo/prodmemo-content.js` - `injectListCorrelationsOnce` 函数

**功能**: 将 Book Size 列替换为整合列，显示三部分数据：
- **Failed RA**: 红色（>0）/ 绿色（=0）
- **Failed PPA**: 红色（>0）/ 绿色（=0）
- **Prod Corr**: 按值大小显示不同颜色（>0.7 红色, >0.5 橙色, 其他绿色）

**显示格式**: `0 0 0.1234`

**依赖数据**: `isDataMap[alphaId].failedNumRA`, `isDataMap[alphaId].failedNumPPA`

**数据来源**: `background.js` 中 `getAlphaCheckStates` 函数计算

### 2. IS Checks 图标替换

**位置**: `src/scripts/prodmemo/prodmemo-content.js`

**功能**: 将 code-btn 图标替换为 IS 检查状态：
- ✓ 绿色 - IS Passed
- ✗ 红色 - IS Failed
- - 灰色 - No IS data

### 3. Star 图标替换为 Operator Count

**位置**: `src/scripts/prodmemo/prodmemo-content.js`

**功能**: 将 star 图标替换为 operatorCount 数值显示：
- 显示紫色徽章样式的数字
- 背景图置空

**依赖数据**: `isDataMap[alphaId].operatorCount`

**数据来源**: `alpha.regular?.operatorCount`

**重要注意**: `operatorCount` 可能为 `0`，这是有效值。在 background.js 中必须使用空值合并运算符 `??` 而不是逻辑或 `||`：

```javascript
// ✅ 正确：0 会被保留
operatorCount = alpha.regular?.operatorCount ?? null;

// ❌ 错误：0 会被转换为 null
operatorCount = alpha.regular?.operatorCount || null;
```

### 4. Multiplier 显示

**位置**: `src/scripts/prodmemo/prodmemo-content.js`

**功能**: 在 Compare 容器显示 Multiplier 值（如 `2.0x`）

---

## 五、background.js 数据传递

### 修改位置 1: `/users/self/alphas` 拦截

**整合逻辑**: 将原来的两个独立拦截合并为一个：
1. 先调用 `getAlphaCheckStates` 计算 `failedNumRA` 和 `failedNumPPA`
2. 从 `modifiedData` 提取完整数据创建 `isDataMap`
3. 发送 `WQSCOPE_PRODMEMO_LIST` 消息
4. 返回修改后的 Response

**isDataMap 数据结构**:
```javascript
{
    isPassed: boolean | null,
    multiplier: number | null,
    pyramids: string,
    failedNumRA: number,
    failedNumPPA: number,
    operatorCount: number | null
}
```

### 修改位置 2: 移除 prodmemo-inject.js 中的重复拦截

**说明**: `prodmemo-inject.js` 中的 Alpha List API 拦截逻辑已移除，统一由 `background.js` 处理。

---

## 六、CSS 样式更新

### 新增样式（prodmemo.css）

```css
/* Failed 颜色 */
.pass-color {
    color: #27ae60 !important;
    font-weight: 500;
}

.fail-color {
    color: #e74c3c !important;
    font-weight: 600;
}

/* Operator Count 徽章 */
.operator-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-top: 9px;
    background: #9b59b6;
    color: white;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
}

/* Multiplier 徽章 */
.multiplier-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 6px;
    margin-top: 9px;
    background: #3498db;
    color: white;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
}

/* IS Check 图标 */
.is-check-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-top: 9px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: bold;
    color: white;
}

.is-check-icon.is-pass { background: #27ae60; }
.is-check-icon.is-fail { background: #e74c3c; }
.is-check-icon.is-unknown { background: #7f8c8d; }
```

---

## 七、消息类型

| 消息类型 | 来源 | 说明 |
|---------|------|------|
| `WQSCOPE_PRODMEMO_DATA` | background.js (injectFetchInterceptor) | 传递 correlation 数据 |
| `WQSCOPE_PRODMEMO_VIEW` | background.js (injectFetchInterceptor) | 通知页面浏览 |
| `WQSCOPE_PRODMEMO_LIST` | background.js (injectFetchInterceptor) | 传递列表数据 |

---

## 八、版本更新跟进建议（重要）

### 更新检查清单

当 WebDataScope 更新版本时，需要检查以下修改是否被保留：

#### 1. background.js - `/users/self/alphas` 拦截逻辑

**关键代码位置**: `injectFetchInterceptor` 函数内

**必须保留的逻辑**:
- 先调用 `getAlphaCheckStates(originalData)` 计算 failedNumRA/failedNumPPA
- 从 `modifiedData` 提取数据创建 `isDataMap`（包含 operatorCount）
- 发送 `WQSCOPE_PRODMEMO_LIST` 消息
- 返回修改后的 Response

**检查点**:
```javascript
// 确认顺序：先 getAlphaCheckStates，再创建 isDataMap
const modifiedData = getAlphaCheckStates(originalData);
// ... 创建 isDataMap，包含 failedNumRA, failedNumPPA, operatorCount ...
window.postMessage({ type: 'WQSCOPE_PRODMEMO_LIST', ... });
return new Response(JSON.stringify(modifiedData), ...);
```

#### 2. prodmemo-inject.js - 移除重复拦截

**检查点**: 确认没有重复的 `/users/self/alphas` 拦截逻辑
- 只保留 `/correlations/prod` 和 `/recordsets` 拦截
- Alpha List 数据统一由 background.js 处理

#### 3. prodmemo-content.js - 列表视图注入

**关键函数**: `injectListCorrelationsOnce`

**必须保留的功能**:
- Prod Corr 列整合显示（Failed RA + Failed PPA + Prod Corr）
- IS Checks 图标替换（code-btn）
- Star 图标替换为 Operator Count
- Multiplier 显示

#### 4. prodmemo.css - 样式定义

**必须保留的样式**:
- `.pass-color` / `.fail-color` - Failed 数颜色
- `.operator-count-badge` - Operator Count 徽章
- `.multiplier-badge` - Multiplier 徽章
- `.is-check-icon` 及其状态样式

### 数据流验证

更新后验证数据流是否正常：
1. 打开 Alpha 列表页
2. 检查控制台是否有 `[WQScope-ProdMemo]` 日志
3. 确认 Prod Corr 列显示格式为 `0 0 0.1234`
4. 确认 Star 图标显示为数字
5. 确认 IS Checks 显示为 ✓/✗/-

### 常见问题

**Q: Prod Corr 列显示为 `- - -`**
A: 检查 background.js 中 `isDataMap` 是否正确传递数据

**Q: Failed RA/PPA 始终为 0**
A: 检查 `getAlphaCheckStates` 是否在创建 `isDataMap` 之前调用

**Q: Operator Count 显示为 `-`**
A: 
1. 检查 `alpha.regular?.operatorCount` 是否正确获取
2. 检查是否使用了 `??` 而不是 `||`（`0 || null` 会返回 `null`）
3. 检查 prodmemo-content.js 中是否正确判断：`operatorCount !== null && operatorCount !== undefined`

---

## 九、版本更新跟进建议（基础）

当 WebDataScope 更新版本时：

1. **检查 manifest.json** - 确保 content_scripts 和 web_accessible_resources 配置未被覆盖

2. **检查 background.js** - 如果 `injectFetchInterceptor` 函数有更新，需要重新添加 ProdMemo 拦截逻辑（详见第八节）

3. **检查 popup 文件** - 确保 popup.html 和 popup.js 中的 ProdMemo 相关代码未被覆盖

4. **保留新增文件** - `src/scripts/prodmemo/` 目录和 `src/css/prodmemo.css` 需要保留

---

## 十、调试方法

在浏览器开发者工具控制台查看以下日志：

```
[WQScope-ProdMemo] Content script loaded
[WQScope-ProdMemo] Received message: WQSCOPE_PRODMEMO_DATA {...}
[WQScope-ProdMemo] Received message: WQSCOPE_PRODMEMO_VIEW {...}
[WQScope-ProdMemo] Received message: WQSCOPE_PRODMEMO_LIST {...}
```

---

## 十一、更新历史

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-04-07 | v1.0 | 初始版本，基础 ProdMemo 功能整合 |
| 2026-04-08 | v1.1 | 列表视图增强：整合 Failed RA/PPA/Prod Corr 显示、IS Checks 图标替换、Star 图标替换为 Operator Count、Multiplier 显示 |
| 2026-04-08 | v1.1.1 | 修复 operatorCount 为 0 时的显示问题（使用 `??` 代替 `||`）|

---

*文档生成时间: 2026-04-08*
