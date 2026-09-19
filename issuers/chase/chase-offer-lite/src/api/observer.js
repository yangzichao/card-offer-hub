let chaseSessionObserverInstalled = false;
function installSessionObserver() {
    if (chaseSessionObserverInstalled) return;
    chaseSessionObserverInstalled = true;
    const page = typeof unsafeWindow === 'object' ? unsafeWindow : window;
    if (typeof page.fetch === 'function') {
        const originalFetch = page.fetch;
        page.fetch = function observedChaseFetch(input, options) {
            let context = null;
            try {
                const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
                const method = options?.method || input?.method || 'GET';
                const headers = options?.headers !== undefined ? options.headers : input?.headers;
                context = captureSessionRequest(requestUrl, method, headers);
            } catch { /* Observation must not interrupt the page's own request. */ }
            const result = originalFetch.apply(this, arguments);
            if (context) {
                Promise.resolve(result).then(response => {
                    if (response.ok) response.clone().json().then(payload => captureSessionResponse(context, payload)).catch(() => {});
                }).catch(() => {});
            }
            return result;
        };
    }
    const prototype = page.XMLHttpRequest?.prototype;
    if (!prototype) return;
    const requestMetadata = new WeakMap();
    const originalOpen = prototype.open;
    const originalSetRequestHeader = prototype.setRequestHeader;
    const originalSend = prototype.send;
    prototype.open = function observedChaseOpen(method, requestUrl) {
        const result = originalOpen.apply(this, arguments);
        requestMetadata.set(this, { method, requestUrl: String(requestUrl), headers: {} });
        return result;
    };
    prototype.setRequestHeader = function observedChaseHeader(name, value) {
        const result = originalSetRequestHeader.apply(this, arguments);
        const metadata = requestMetadata.get(this);
        const key = String(name).toLowerCase();
        if (metadata && CHASE_SESSION_HEADER_NAMES.includes(key)) {
            metadata.headers[key] = metadata.headers[key] ? `${metadata.headers[key]}, ${value}` : String(value);
        }
        return result;
    };
    prototype.send = function observedChaseSend() {
        const metadata = requestMetadata.get(this);
        const context = metadata ? captureSessionRequest(metadata.requestUrl, metadata.method, metadata.headers) : null;
        if (context) this.addEventListener('load', () => {
            try {
                if (requestMetadata.get(this) !== metadata || this.status < 200 || this.status >= 300) return;
                const payload = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
                captureSessionResponse(context, payload);
            } catch { /* Ignore non-JSON, incomplete and foreign responses. */ }
        }, { once: true });
        return originalSend.apply(this, arguments);
    };
}
