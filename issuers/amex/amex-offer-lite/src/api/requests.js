class RequestStopped extends Error {}
class RateLimited extends Error {}

function requireActiveRequest() {
    if (state.cancelRequested) throw new RequestStopped('Stopped. No further requests will be sent.');
}

const { waitForRequestSlot, withRequestSlot } = createHubRequestScheduler({
    state, gapMilliseconds: SETTINGS.requestGapMs, ensureRunning: requireActiveRequest, pacing,
    reservationMilliseconds: SETTINGS.requestTimeoutMs, persist: savePacing,
    checkStorage() { if (state.storageError) throw new Error(state.storageError); },
    cooldownError: () => new RateLimited('Cooling down after HTTP 429. Start again manually when the timer ends.'),
    onWait: remaining => setStatus(`Waiting ${Math.ceil(remaining / 1000)}s before the next request. Stop is available.`)
});
function retryAfterMilliseconds(value) {
    return hubRetryAfterMilliseconds(value, SETTINGS.rateLimitCooldownMs, Date.now(), SETTINGS.rateLimitCooldownMs);
}

function requestJson(url, options = {}) {
    return withRequestSlot(observe => sendJsonRequest(url, { ...options, observe }));
}

function requestHub(endpoint, accountToken, payload, validateResponse) {
    assertWhitelisted(accountToken);
    return requestJson(`${SETTINGS.functionsBase}/${endpoint}`, {
        accountToken, body: { accountNumberProxy: accountToken, locale: 'en-US', ...payload }, validateResponse
    });
}
