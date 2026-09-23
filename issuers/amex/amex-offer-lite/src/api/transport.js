// Call only while holding a request slot. Same-offer enrollments share one slot;
// scan requests and different offers each acquire their own slot.
async function sendJsonRequest(url, { body, accountToken, source = 'WEB', observe = () => {}, validateResponse = () => {} } = {}) {
    requireActiveRequest();
    if (accountToken) assertWhitelisted(accountToken);
    let timeoutId;
    try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), SETTINGS.requestTimeoutMs);
        const headers = { Accept: 'application/json', 'ce-source': source, 'one-data-correlation-id': crypto.randomUUID() };
        if (body) headers['Content-Type'] = 'application/json';
        const response = await fetchTreatingNetworkErrorAsRateLimit(url, {
            method: body ? 'POST' : 'GET', credentials: 'include', headers,
            ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal
        }, observe);
        observe('neutral', response.status);
        if (response.status === 429) {
            observe('limited');
            pacing.rateLimited(response.headers.get('Retry-After'));
            const persisted = savePacing();
            // Consume the body before releasing the serial request slot.
            try { await response.json(); } catch { /* The 429 headers remain authoritative. */ }
            if (!persisted) throw new Error(state.storageError);
            throw new RateLimited('HTTP 429: this run stopped. No automatic retry will be made.');
        }
        if (!response.ok) {
            try { await response.json(); } catch { /* Keep the HTTP failure even for a non-JSON error page. */ }
            throw new Error(`HTTP ${response.status}. No automatic retry was made.`);
        }
        let payload;
        try {
            payload = await response.json();
        } catch {
            throw new Error('The response was not valid JSON; the result is unconfirmed.');
        }
        const outcome = validateResponse(payload);
        observe(outcome === true ? 'success' : outcome === false ? 'failure' : 'neutral');
        return payload;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Request timed out; the result is unconfirmed. No automatic retry was made.');
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
