function retryAfterMilliseconds(value, now = Date.now()) {
    if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
    const deadline = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(deadline) ? Math.max(0, deadline - now) : SETTINGS.defaultCooldownMilliseconds;
}
async function waitForRequestSlot() {
    while (Date.now() < state.nextRequestAt) {
        ensureRunning();
        await new Promise(resolve => setTimeout(resolve, Math.min(250, state.nextRequestAt - Date.now())));
    }
    ensureRunning();
    if (state.storageError) throw new Error(state.storageError);
    if (Date.now() < state.cooldownUntil) {
        throw new Error(`Rate limited. Try a new scan after ${new Date(state.cooldownUntil).toLocaleTimeString()}.`);
    }
}
async function requestGraphql(query, variablesFactory, session) {
    if (![LIST_OFFERS_QUERY, ACTIVATE_OFFER_QUERY].includes(query)) throw new Error('Unsupported US Bank operation.');
    await waitForRequestSlot();
    ensureSameSession(session);
    const headers = sessionHeaders();
    const variables = variablesFactory();
    // Reserve a slot before sending. A reload or closed tab releases Web Locks,
    // but must not permit a new tab to immediately overlap this pending request.
    state.nextRequestAt = Date.now() + SETTINGS.timeoutMilliseconds + SETTINGS.gapMilliseconds;
    savePacing();
    if (state.storageError) throw new Error(state.storageError);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SETTINGS.timeoutMilliseconds);
    try {
        const response = await fetch(SETTINGS.endpoint, {
            method: 'POST', credentials: 'same-origin', redirect: 'error',
            headers, cache: 'no-store', body: JSON.stringify({ query, variables }), signal: controller.signal
        });
        if (response.status === 429) {
            state.cooldownUntil = Math.max(state.cooldownUntil,
                Date.now() + retryAfterMilliseconds(response.headers.get('Retry-After')));
        }
        // Include body consumption in the response-completion pacing boundary.
        const responseText = await response.text();
        if (response.status === 429) throw new Error('US Bank returned HTTP 429. Cooling down; scan again later.');
        if (!response.ok) throw new Error(`US Bank returned HTTP ${response.status}. Scan again after resolving the error.`);
        let payload;
        try { payload = JSON.parse(responseText); }
        catch { throw new Error('US Bank returned a non-JSON response. Sign in and scan again.'); }
        ensureSameSession(session);
        return payload;
    } catch (error) {
        // Do not display browser errors that could contain URLs or session data.
        if (error.name === 'AbortError') throw new Error('Request timed out; result is unconfirmed. Scan again.');
        if (error instanceof TypeError) throw new Error('Network request failed; result is unconfirmed. Scan again.');
        throw error;
    } finally {
        clearTimeout(timeout);
        state.nextRequestAt = Date.now() + SETTINGS.gapMilliseconds;
        savePacing();
    }
}
