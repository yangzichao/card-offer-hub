class RequestStopped extends Error {}
class RateLimited extends Error {}

function requireActiveRequest() {
    if (state.cancelRequested) throw new RequestStopped('Stopped. No further requests will be sent.');
}

async function waitForRequestSlot() {
    requireActiveRequest();
    if (Date.now() < state.cooldownUntil) throw new RateLimited('Cooling down after HTTP 429. Start again manually when the timer ends.');
    while (Date.now() < state.nextRequestAt) {
        requireActiveRequest();
        const remainingMs = state.nextRequestAt - Date.now();
        setStatus(`Waiting ${Math.ceil(remainingMs / 1000)}s before the next request. Stop is available.`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(250, remainingMs)));
    }
    requireActiveRequest();
}

function retryAfterMilliseconds(headerValue) {
    if (!headerValue) return SETTINGS.rateLimitCooldownMs;
    const seconds = Number(headerValue);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(headerValue) - Date.now();
    return Number.isFinite(delay) ? Math.max(SETTINGS.rateLimitCooldownMs, delay) : SETTINGS.rateLimitCooldownMs;
}

async function withRequestSlot(operation) {
    if (state.requestInFlight) throw new Error('Another request is still active.');
    state.requestInFlight = true;
    try {
        await waitForRequestSlot();
        return await operation();
    } finally {
        // A slot holds one scan request or one complete concurrent offer batch.
        // The next slot waits from the last response, including failures.
        state.nextRequestAt = Math.max(state.nextRequestAt, Date.now() + SETTINGS.requestGapMs);
        state.requestInFlight = false;
    }
}

function requestJson(url, options = {}) {
    return withRequestSlot(() => sendJsonRequest(url, options));
}

function requestHub(endpoint, accountToken, payload) {
    assertWhitelisted(accountToken);
    return requestJson(`${SETTINGS.functionsBase}/${endpoint}`, {
        accountToken, body: { accountNumberProxy: accountToken, locale: 'en-US', ...payload }
    });
}
