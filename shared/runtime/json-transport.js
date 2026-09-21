// Request construction and response interpretation stay with the issuer.
// The caller must hold its scheduler slot until this promise settles.
async function hubSendJsonRequest({ url, options, timeoutMilliseconds, label, onRateLimited, onResponse = () => {}, allowEmptyResponse = false }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        onResponse(response.status);
        let persistenceError;
        if (response.status === 429) {
            try { onRateLimited(response.headers.get('Retry-After')); }
            catch (error) { persistenceError = error; }
        }
        // Body consumption is part of the request, including HTTP error bodies.
        const responseText = await response.text();
        if (persistenceError) throw persistenceError;
        if (response.status === 429) throw new Error(`${label} returned HTTP 429. Cooling down; scan again later.`);
        if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}. Sign in and scan again.`);
        // Acknowledgement only: callers must verify the actual result separately.
        if (allowEmptyResponse && response.status === 200 && responseText === '') return null;
        try { return JSON.parse(responseText); }
        catch { throw new Error(`${label} returned a non-JSON response. Sign in and scan again.`); }
    } catch (error) {
        // Browser network errors can include URLs or credentials. Never display them.
        if (error.name === 'AbortError') throw new Error('Request timed out; result is unconfirmed. Scan again.');
        if (error instanceof TypeError || error.name === 'TypeError') throw new Error('Network request failed; result is unconfirmed. Scan again.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function createHubJsonTransport({ state, settings, ensureRunning, savePacing, pacing }) {
    const scheduler = createHubRequestScheduler({ state, gapMilliseconds: settings.gapMilliseconds,
        reservationMilliseconds: settings.timeoutMilliseconds, ensureRunning, persist: savePacing, pacing,
        checkStorage() { if (state.storageError) throw new Error(state.storageError); } });
    function retryAfterMilliseconds(value, now = Date.now()) {
        return hubRetryAfterMilliseconds(value, settings.defaultCooldownMilliseconds, now);
    }
    function sendRequest(prepareRequest) {
        return scheduler.withRequestSlot(async observe => {
            const { url, options, validateResponse = () => {}, allowEmptyResponse = false } = await prepareRequest();
            ensureRunning();
            const payload = await hubSendJsonRequest({ url, options, label: settings.name, allowEmptyResponse,
                timeoutMilliseconds: settings.timeoutMilliseconds,
                onResponse: status => observe('neutral', status),
                onRateLimited(value) {
                    observe('limited');
                    pacing.rateLimited(value);
                    savePacing();
                    if (state.storageError) throw new Error(state.storageError);
                } });
            const outcome = validateResponse(payload);
            observe(outcome === true ? 'success' : outcome === false ? 'failure' : 'neutral');
            return payload;
        });
    }
    return { sendRequest, retryAfterMilliseconds, waitForRequestSlot: scheduler.waitForRequestSlot };
}
