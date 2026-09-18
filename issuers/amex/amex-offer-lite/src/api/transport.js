// Call only while holding a request slot. Same-offer enrollments share one slot;
// scan requests and different offers each acquire their own slot.
async function sendJsonRequest(url, { body, accountToken, source = 'WEB' } = {}) {
    requireActiveRequest();
    if (accountToken) assertWhitelisted(accountToken);
    let timeoutId;
    try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), SETTINGS.requestTimeoutMs);
        const headers = { Accept: 'application/json', 'ce-source': source, 'one-data-correlation-id': crypto.randomUUID() };
        if (body) headers['Content-Type'] = 'application/json';
        const response = await fetch(url, {
            method: body ? 'POST' : 'GET', credentials: 'include', headers,
            ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal
        });
        if (response.status === 429) {
            state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + retryAfterMilliseconds(response.headers.get('Retry-After')));
            persistCooldown();
            throw new RateLimited('HTTP 429: this run stopped. No automatic retry will be made.');
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}. No automatic retry was made.`);
        try {
            return await response.json();
        } catch {
            throw new Error('The response was not valid JSON; the result is unconfirmed.');
        }
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Request timed out; the result is unconfirmed. No automatic retry was made.');
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
