// Passive: copies allowlisted context headers from the page's own savings
// requests. It never changes, delays or sends a request.
let krogerContextObserverInstalled = false;
function installKrogerContextObserver() {
    if (krogerContextObserverInstalled) return;
    krogerContextObserverInstalled = true;
    const page = typeof unsafeWindow === 'object' ? unsafeWindow : window;
    if (typeof page.fetch === 'function') {
        const originalFetch = page.fetch;
        page.fetch = function observedKrogerFetch(input, options) {
            try {
                const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
                captureKrogerContext(requestUrl, options?.headers !== undefined ? options.headers : input?.headers);
            } catch { /* Observation must not interrupt the page's own request. */ }
            return originalFetch.apply(this, arguments);
        };
    }
    const prototype = page.XMLHttpRequest?.prototype;
    if (!prototype) return;
    const requestMetadata = new WeakMap();
    const originalOpen = prototype.open;
    const originalSetRequestHeader = prototype.setRequestHeader;
    const originalSend = prototype.send;
    prototype.open = function observedKrogerOpen(method, requestUrl) {
        const result = originalOpen.apply(this, arguments);
        requestMetadata.set(this, { requestUrl: String(requestUrl), headers: {} });
        return result;
    };
    prototype.setRequestHeader = function observedKrogerHeader(name, value) {
        const result = originalSetRequestHeader.apply(this, arguments);
        const metadata = requestMetadata.get(this);
        const key = String(name).toLowerCase();
        if (metadata && KROGER_CONTEXT_HEADER_NAMES.includes(key)) metadata.headers[key] = String(value);
        return result;
    };
    prototype.send = function observedKrogerSend() {
        const metadata = requestMetadata.get(this);
        try { if (metadata) captureKrogerContext(metadata.requestUrl, metadata.headers); }
        catch { /* Observation must not interrupt the page's own request. */ }
        return originalSend.apply(this, arguments);
    };
}
