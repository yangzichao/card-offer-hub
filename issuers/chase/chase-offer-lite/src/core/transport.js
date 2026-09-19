function retryAfterMilliseconds(value, now = Date.now()) {
    if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) {
        const milliseconds = Number(value) * 1000;
        if (Number.isFinite(milliseconds)) return milliseconds;
    }
    const deadline = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(deadline) ? Math.max(0, deadline - now) : SETTINGS.defaultCooldownMilliseconds;
}
function ensureSelectedSession(accountId, { allowStopped = false } = {}) {
    if (!allowStopped) ensureRunning();
    if (!state.selected.has(accountId) || !state.accounts.some(card => card.accountId === accountId)) {
        throw new Error('Select a detected card before scanning.');
    }
    if (currentSession().enterprisePartyIdentifier !== state.sessionIdentity) {
        throw new Error('Chase session changed. Detect cards and select them again.');
    }
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
async function requestJson(descriptor) {
    await waitForRequestSlot();
    // Request descriptors must exactly match a fresh, selected-account read.
    // No arbitrary URL, method, or captured account-default request is replayed.
    let parameters;
    try { parameters = JSON.parse(descriptor.headers['path-params']); }
    catch { throw new Error('Invalid Chase read request. Detect cards again.'); }
    const accountId = String(parameters.primaryDigitalAccountIdentifierList?.[0] ?? '');
    ensureSelectedSession(accountId);
    const expected = buildOffersRequest(accountId);
    if (descriptor.method !== 'GET' || descriptor.path !== expected.path
        || JSON.stringify(descriptor.headers) !== JSON.stringify(expected.headers)) {
        throw new Error('Unsupported Chase read request.');
    }
    const headers = { ...sessionHeaders(), ...expected.headers };
    state.nextRequestAt = Date.now() + SETTINGS.timeoutMilliseconds + SETTINGS.gapMilliseconds;
    savePacing();
    if (state.storageError) throw new Error(state.storageError);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SETTINGS.timeoutMilliseconds);
    try {
        const response = await fetch(expected.path, {
            method: 'GET', credentials: 'same-origin', redirect: 'error',
            headers, signal: controller.signal
        });
        if (response.status === 429) {
            state.cooldownUntil = Math.max(state.cooldownUntil,
                Date.now() + retryAfterMilliseconds(response.headers.get('Retry-After')));
        }
        const responseText = await response.text();
        if (response.status === 429) throw new Error('Chase returned HTTP 429. Cooling down; scan again later.');
        if (!response.ok) throw new Error(`Chase returned HTTP ${response.status}. Sign in and scan again.`);
        let payload;
        try { payload = JSON.parse(responseText); }
        catch { throw new Error('Chase returned a non-JSON response. Sign in and scan again.'); }
        ensureSelectedSession(accountId, { allowStopped: true });
        return payload;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Request timed out. Scan again; no automatic retry was made.');
        if (error instanceof TypeError) throw new Error('Network request failed. Sign in and scan again.');
        throw error;
    } finally {
        clearTimeout(timeout);
        state.nextRequestAt = Date.now() + SETTINGS.gapMilliseconds;
        savePacing();
    }
}
