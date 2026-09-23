const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { rawOffer, confirmation } = require('./fixtures/synthetic-offers.cjs');

// Amex answers its rate limit with a 429 that has no CORS headers, so page code only
// ever sees this error (2025-11 capture). Nothing in these tests uses a real capture.
function browserNetworkError() {
    return new TypeError('Failed to fetch');
}

function failSecondRequest(request, requestNumber) {
    if (requestNumber === 2) throw browserNetworkError();
    return jsonResponse(confirmation(request.body.identifier));
}

function preparedHarness(titles, fetchResponse) {
    const harness = createUserscriptHarness(fetchResponse);
    configureAccounts(harness);
    harness.state.offersByAccount.set('card-a', titles.map((title) =>
        harness.normalizeHubOffer(rawOffer(title, 'NOT_ENROLLED', { title }))));
    harness.state.scanReports.set('card-a', 'Complete');
    return harness;
}

function statusesOnCardA(harness) {
    return Array.from(harness.state.offersByAccount.get('card-a'), (offer) => offer.status);
}

const suspectedLimitMessage = 'Amex stopped answering ("Failed to fetch"), most likely its rate limit. '
    + 'Paused for the cooldown; later requests will be slower. No automatic retry was made.';

test('a failed fetch to the Amex gateway ends the run like a 429: cooldown, slower pace, that offer unconfirmed', async () => {
    const harness = preparedHarness(['Offer 1', 'Offer 2', 'Offer 3'], failSecondRequest);
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 2);
    assert.deepEqual(statusesOnCardA(harness), ['ENROLLED', 'UNCONFIRMED', 'ELIGIBLE']);
    assert.equal(harness.state.status, `${suspectedLimitMessage} 1 offers added.`);
    assert.equal(harness.state.cooldownUntil - harness.requests[1].startedAt, 120000);
    assert.equal(harness.state.pacing.currentGapMs, 2000);
    assert.equal(harness.state.pacing.consecutiveLimits, 1);
    const saved = harness.userscriptStorage.get('amex-offer-lite:pacing');
    assert.equal(saved.cooldownUntil, harness.state.cooldownUntil, 'the cooldown survives a reload');
    assert.equal(saved.currentGapMs, 2000);
    const events = harness.userscriptStorage.get('amex-offer-lite:pacing:diagnostics').events.slice(-3);
    assert.deepEqual(Array.from(events, (event) => event.kind), ['request-start', 'rate-limited', 'request-end']);
    assert.equal(events[2].outcome, 'limited');
    assert.ok(events.every((event) => !('httpStatus' in event)), 'no HTTP status is invented for a network error');
});

test('a click during the cooldown sends nothing; afterwards Add all resumes the rest at the slower pace', async () => {
    const harness = preparedHarness(['Offer 1', 'Offer 2', 'Offer 3', 'Offer 4'], failSecondRequest);
    await harness.startEnrollment();
    assert.equal(harness.requests[1].startedAt - harness.requests[0].startedAt, 1000);
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 2, 'the cooldown blocks a second click');
    harness.advanceTime(120000);
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 4);
    assert.equal(harness.requests[3].startedAt - harness.requests[2].startedAt, 2000);
    assert.deepEqual(statusesOnCardA(harness), ['ENROLLED', 'UNCONFIRMED', 'ENROLLED', 'ENROLLED']);
    assert.equal(harness.state.status, 'Enrollment complete. 2 offers added.');
});

test('a failed fetch while scanning stops the scan and starts the same cooldown', async () => {
    const harness = createUserscriptHarness(() => { throw browserNetworkError(); });
    configureAccounts(harness, ['card-a', 'card-b']);
    await harness.startScan();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.status, `${suspectedLimitMessage} Completed 0/2 cards; remaining results are incomplete.`);
    assert.equal(harness.state.cooldownUntil - harness.requests[0].startedAt, 120000);
    await harness.startScan();
    assert.equal(harness.requests.length, 1, 'a second click during the cooldown sends nothing');
});

test('a timeout keeps its own handling: unconfirmed and stopped, with no cooldown or slowdown', async () => {
    const harness = preparedHarness(['Offer 1', 'Offer 2'], () => {
        const timeout = new Error('The operation was aborted.');
        timeout.name = 'AbortError';
        throw timeout;
    });
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 1);
    assert.deepEqual(statusesOnCardA(harness), ['UNCONFIRMED', 'ELIGIBLE']);
    assert.equal(harness.state.status, 'Request timed out; the result is unconfirmed. No automatic retry was made. 0 offers added.');
    assert.equal(harness.state.cooldownUntil, 0);
    assert.equal(harness.state.pacing.currentGapMs, 1000);
});

test('a failed same-origin request is an ordinary network error, not a rate limit', async () => {
    const harness = createUserscriptHarness(() => { throw browserNetworkError(); });
    await harness.detectCards();
    assert.equal(harness.requests.length, 1);
    assert.match(harness.requests[0].url, /^https:\/\/global\.americanexpress\.com\/api\//);
    assert.equal(harness.state.status, 'Card detection failed: Failed to fetch');
    assert.equal(harness.state.cooldownUntil, 0);
    assert.equal(harness.state.pacing.currentGapMs, 1000);
});
