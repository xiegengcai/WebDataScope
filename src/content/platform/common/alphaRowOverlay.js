(function () {
    'use strict';

    function isRegular(checks) {
        return checks?.type === 'REGULAR';
    }

    function prodCorrColor(val) {
        if (val === '-') return '';
        if (val >= 0.7) return '#b91c1c';
        if (val >= 0.5) return '#b45309';
        return '#15803d';
    }

    function renderCheckBadge(el, checks) {
        // 仅依赖 failedNumRA + failedNumPPA，不再读 failedNum（WQ API 原始字段语义不一致）
        const { failedNum= 0, failedNumRA = 0, failedNumPPA = 0 } = checks;
        let symbol, bg, title;

        // 处理 failedNum > 0 的情况
        if(failedNum > 0) {
            symbol = '✗'; bg = '#dc2626'; title = `${failedNum} FAIL`;
            el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${bg};color:#fff;font-size:14px;font-weight:700;line-height:1;cursor:pointer;margin-top:8px;">${symbol}</span>`;
            el.title = title;
            return;
        }

        if (failedNumRA === 0 && failedNumPPA === 0) {
            symbol = '✓'; bg = '#16a34a'; title = `RA PASS`;
        } else if (failedNumPPA === 0) {
            symbol = '⚠'; bg = '#ca8a04'; title = `RA ${failedNumRA} FAIL / PPA PASS`;
        } else {
            symbol = '✗'; bg = '#dc2626'; title = `RA ${failedNumRA} / PPA ${failedNumPPA} FAIL`;
        }

        el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${bg};color:#fff;font-size:14px;font-weight:700;line-height:1;cursor:pointer;margin-top:8px;">${symbol}</span>`;
        el.title = title;
    }

    function renderPyramidBadge(el, val) {
        el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#6366f1;color:#fff;font-size:11px;font-weight:700;line-height:1;cursor:pointer;margin-top:8px;">${val}</span>`;
        el.title = `Pyramid Multiplier: ${val}`;
    }

    function renderOperatorBadge(el, val) {
        el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#0891b2;color:#fff;font-size:11px;font-weight:700;line-height:1;cursor:pointer;margin-top:8px;">${val}</span>`;
        el.title = `Operator Count: ${val}`;
    }

    function renderBookSize(cell, checks) {
        const wqppys = checks.WQPPYS || '-';
        const raw = checks.maxProdCorr;
        const numMatch = raw ? String(raw).match(/-?\d+\.?\d*/) : null;
        const prodCorrNum = numMatch ? Number(numMatch[0]) : NaN;
        const prodCorr = Number.isFinite(prodCorrNum) ? prodCorrNum.toString() : '';
        const color = prodCorrColor(prodCorr);
        if (wqppys == '-' ) {
            cell.innerHTML = `<span style="color:${color};font-weight:600;">${prodCorr}</span>`;
            // 切回无 overlay 分支时，必须清除上一次 overlay 残留的定位样式（回收行复用）
            cell.style.position = '';
            cell.style.textAlign = '';
        } else {
            const pyramidCount = wqppys.split('/').filter(Boolean).length;
            const overlay = `${pyramidCount ? pyramidCount + ' / ' : ''}${prodCorr}`;
            cell.innerHTML = `${wqppys}<span style="position:absolute;top:-2px;left:8px;color:${color};font-weight:600;pointer-events:none;white-space:nowrap;">${overlay}</span>`;
            cell.style.position = 'relative';
            cell.style.textAlign = 'left';
        }

    }

    // 首次渲染前快照注入点的原始 innerHTML，供 clearRowBadges 还原，避免回收行残留旧 badge
    function snapshotOrig(el) {
        if (el && el.dataset.wqpOrig === undefined) el.dataset.wqpOrig = el.innerHTML;
    }

    // 清除某行已注入的 badge 内容（checks 缺失或 alphaId 变更时调用）
    function clearRowBadges(row) {
        const codeBtn = row.querySelector('.alphas-list-table__clickable-icon.code-btn');
        if (codeBtn) codeBtn.innerHTML = codeBtn.dataset.wqpOrig || '';
        const compareEl = row.querySelector('.alpha-list-table__container--add-to-compare');
        if (compareEl) compareEl.innerHTML = compareEl.dataset.wqpOrig || '';
        const starEl = row.querySelector('.alphas-list-table__clickable-icon.star');
        if (starEl) starEl.innerHTML = starEl.dataset.wqpOrig || '';
        const bookSizeCell = row.querySelector('.alphas-list-table__cell-content--bookSize');
        if (bookSizeCell) {
            bookSizeCell.innerHTML = bookSizeCell.dataset.wqpOrig || '';
            bookSizeCell.style.position = '';
            bookSizeCell.style.textAlign = '';
        }
    }

    function processRow(row) {
        const idEl = row.querySelector('.alpha-id-cell__value');
        if (!idEl) return;
        const alphaId = idEl.textContent?.trim();
        if (!alphaId) return;

        // 关键修复：用 wqpRowId 把 badge 绑定到具体 alphaId。
        // 已为该 alphaId 渲染过 → 跳过；React 回收行若换了 alphaId，wqpRowId 不匹配会落空并强制重绘，
        // 从根本上消除「同一 DOM 行节点复用但 badge 不更新」的错乱。
        if (row.dataset.wqpRowDone && row.dataset.wqpRowId === alphaId) return;

        const checks = window.__wqp_alpha_checks?.get(alphaId);
        if (checks === undefined) {
            // 数据未到位：清掉可能残留的旧 badge（上一页），挂“待处理”等待补渲染
            clearRowBadges(row);
            row.dataset.wqpRowId = alphaId;
            return;
        }

        row.dataset.wqpRowDone = '1';
        row.dataset.wqpRowId = alphaId;

        const codeBtn = row.querySelector('.alphas-list-table__clickable-icon.code-btn');
        if (codeBtn) { snapshotOrig(codeBtn); renderCheckBadge(codeBtn, checks); }

        if (isRegular(checks)) {
            const compareEl = row.querySelector('.alpha-list-table__container--add-to-compare');
            if (compareEl && checks.pyramidMultiplier != null) { snapshotOrig(compareEl); renderPyramidBadge(compareEl, checks.pyramidMultiplier); }

            const starEl = row.querySelector('.alphas-list-table__clickable-icon.star');
            if (starEl && checks.operatorCount != null) { snapshotOrig(starEl); renderOperatorBadge(starEl, checks.operatorCount); }
        }

        const bookSizeCell = row.querySelector('.alphas-list-table__cell-content--bookSize');
        if (bookSizeCell) { snapshotOrig(bookSizeCell); renderBookSize(bookSizeCell, checks); }
    }

    function scanAll() {
        document.querySelectorAll('.rt-tr-group:not([data-wqp-row-done])').forEach(processRow);
    }

    function onDataUpdated() {
        // 数据已更新：清除所有已处理标记，重新扫描
        document.querySelectorAll('[data-wqp-row-done]').forEach(el => { delete el.dataset.wqpRowDone; });
        scanAll();
        // 兜底轮询：捕获 React 异步渲染的延迟 rows
        // Map 干净后，不存在 "alphaId 找不到导致 done 永远不设" 的死循环，1.2s 足够
        let attempts = 0;
        const stable = setInterval(() => {
            const pending = document.querySelectorAll('.rt-tr-group:not([data-wqp-row-done])').length;
            attempts++;
            if (pending === 0 || attempts >= 6) {
                clearInterval(stable);
                if (pending > 0) console.warn(`[WQP] ${pending} 行未在 1.2s 内处理`);
                return;
            }
            scanAll();
        }, 200);
    }

    function refreshBookSize() {
        document.querySelectorAll('.rt-tr-group[data-wqp-row-done]').forEach(row => {
            const idEl = row.querySelector('.alpha-id-cell__value');
            const alphaId = idEl?.textContent?.trim();
            if (!alphaId) return;
            const checks = window.__wqp_alpha_checks?.get(alphaId);
            if (checks === undefined) return;
            const bookSizeCell = row.querySelector('.alphas-list-table__cell-content--bookSize');
            if (bookSizeCell) { snapshotOrig(bookSizeCell); renderBookSize(bookSizeCell, checks); }
        });
    }

    function start() {
        // 防抖：合并短时间内多次 DOM 变化，避免高频回调（如虚拟滚动、tooltip、loading 动画）
        let debounceTimer = null;
        const observer = new MutationObserver((mutations) => {
            // 触发条件：addedNodes 含 .rt-tr-group（行新增），或任意 mutation 触及行内节点
            const relevant = mutations.some(m => {
                if ([...m.addedNodes].some(n =>
                    n.nodeType === 1 && (
                        n.classList?.contains('rt-tr-group') ||
                        n.querySelector?.('.rt-tr-group')
                    )
                )) return true;
                // 检查 target 本身或其祖先是否是 .rt-tr-group
                let el = m.target;
                while (el && el.nodeType === 1) {
                    if (el.classList?.contains('rt-tr-group')) return true;
                    el = el.parentElement;
                }
                return false;
            });
            if (!relevant) return;
            if (debounceTimer) return;
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                scanAll();
            }, 100);
        });
        const target = document.body || document.documentElement;
        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: false
        });
        scanAll();
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }

    window.addEventListener('__wqp_alpha_checks_updated', onDataUpdated);
    window.addEventListener('storage', (e) => {
        if (e.key === 'WQP_ProdMemoCache') refreshBookSize();
    });
})();
