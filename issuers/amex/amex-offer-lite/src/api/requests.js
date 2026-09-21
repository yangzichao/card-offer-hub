class RequestStopped extends Error {}
class RateLimited extends Error {}

function requireActiveRequest() {
    if (state.cancelRequested) throw new RequestStopped('Stopped. No further requests will be sent.');
}

const { waitForRequestSlot, withRequestSlot } = createHubRequestScheduler({
    state, gapMilliseconds: SETTINGS.requestGapMs, ensureRunning: requireActiveRequest,
    cooldownError: () => new RateLimited('Cooling down after HTTP 429. Start again manually when the timer ends.'),
    onWait: remaining => setStatus(`Waiting ${Math.ceil(remaining / 1000)}s before the next request. Stop is available.`)
});
function retryAfterMilliseconds(value) {
    return hubRetryAfterMilliseconds(value, SETTINGS.rateLimitCooldownMs, Date.now(), SETTINGS.rateLimitCooldownMs);
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
