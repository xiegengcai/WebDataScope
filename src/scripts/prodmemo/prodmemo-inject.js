// ProdMemo Inject Script - 在 MAIN world 中运行，拦截 API 请求
(function () {
    console.log('[WQScope-ProdMemo] Inject script initialized.');

    // 避免重复注入
    if (window.__WQSCOPE_PRODMEMO_INJECTED__) return;
    window.__WQSCOPE_PRODMEMO_INJECTED__ = true;

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);

        try {
            const url = response.url;

            // 1. 拦截 Prod Correlation 数据
            if (url.includes('/correlations/prod')) {
                console.log('[WQScope-ProdMemo] Detected Prod Correlation URL:', url);

                const prodMatch = url.match(/\/alphas\/([^/]+)\/correlations\/prod/);
                if (prodMatch) {
                    const alphaId = prodMatch[1];

                    if (response.ok && response.status !== 204) {
                        try {
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
                                } catch (parseErr) {
                                    console.warn('[WQScope-ProdMemo] Failed to parse JSON', parseErr);
                                }
                            }).catch(err => {
                                console.warn('[WQScope-ProdMemo] Error reading clone text', err);
                            });
                        } catch (cloneErr) {
                            console.warn('[WQScope-ProdMemo] Error cloning response', cloneErr);
                        }
                    }
                }
            }

            // 2. 拦截 Alpha Page Load (Recordsets) 触发 UI 检查
            const recordsetsMatch = url.match(/\/alphas\/([^/]+)\/recordsets(?:[?#]|$)/);
            if (recordsetsMatch) {
                const alphaId = recordsetsMatch[1];
                window.postMessage({
                    type: 'WQSCOPE_PRODMEMO_VIEW',
                    alphaId: alphaId
                }, '*');
            }

        } catch (e) {
            console.error('[WQScope-ProdMemo] Error in fetch interceptor', e);
        }

        return response;
    };
})();
