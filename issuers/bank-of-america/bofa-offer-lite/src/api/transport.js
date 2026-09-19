function retryAfterMilliseconds(value) {
    if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
    const deadline = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : SETTINGS.defaultCooldownMilliseconds;
}
async function requestJson(path, method = 'POST', body) {
    const allowed = (path === '/geo' && method === 'GET')
        || (['/api/offers-search', '/api/offers-details'].includes(path) && method === 'POST')
        || (/^\/api\/activate-offer\/\d+$/.test(path) && method === 'PUT' && body === undefined);
    if (!allowed) throw new Error('Unsupported Deals request.');
    if (state.storageError) throw new Error(state.storageError);
    if (Date.now() < state.cooldownUntil) throw new Error('Rate limited. Wait for the saved cooldown to end before scanning.');
    while (Date.now() < state.nextRequestAt) {
        ensureRunning();
        await new Promise(resolve => setTimeout(resolve, Math.min(250, state.nextRequestAt - Date.now())));
    }
    ensureRunning();
    state.nextRequestAt = Date.now() + SETTINGS.timeoutMilliseconds + SETTINGS.gapMilliseconds;
    savePacing();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SETTINGS.timeoutMilliseconds);
    try {
        const headers = path === '/geo' ? {} : { 'X-Cardholder-Token': state.sessionToken };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(path, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'same-origin', redirect: 'error', signal: controller.signal
        });
        if (response.status === 429) {
            state.cooldownUntil = Math.max(state.cooldownUntil,
                Date.now() + retryAfterMilliseconds(response.headers.get('Retry-After')));
        }
        const responseText = await response.text();
        if (response.status === 429) throw new Error('HTTP 429. Cooling down; no automatic retry.');
        if (!response.ok) throw new Error(`Deals returned HTTP ${response.status}. Scan again after resolving the error.`);
        try { return JSON.parse(responseText); }
        catch { throw new Error('Unexpected Deals response. Sign in and scan again.'); }
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Request timed out. Activation may be unconfirmed; scan again.');
        if (error instanceof TypeError) throw new Error('Network failure. Activation may be unconfirmed; scan again.');
        throw error;
    } finally {
        clearTimeout(timeout);
        state.nextRequestAt = Date.now() + SETTINGS.gapMilliseconds;
        savePacing();
    }
}
