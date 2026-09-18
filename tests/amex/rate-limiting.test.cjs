const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { hubResponse, rawOffer } = require('./fixtures/synthetic-offers.cjs');

for (const [retryAfter, expectedDelay] of [['300', 300000], ['1', 120000], ['invalid', 120000], [null, 120000]]) {
    test(`HTTP 429 stops without retries and preserves cooldown for Retry-After ${retryAfter}`, async () => {
        const harness = createUserscriptHarness(() => jsonResponse({}, 429, { 'Retry-After': retryAfter }));
        configureAccounts(harness, ['card-a', 'card-b']);
        await harness.startScan();
        assert.equal(harness.requests.length, 1);
        assert.equal(harness.state.cooldownUntil - harness.requests[0].startedAt, expectedDelay);
        await harness.startScan();
        assert.equal(harness.requests.length, 1);
        const nextVisit = createUserscriptHarness(undefined, { storage: harness.storage });
        nextVisit.restoreLocalSettings();
        assert.equal(nextVisit.state.cooldownUntil, harness.state.cooldownUntil);
    });
}

test('HTTP-date Retry-After is honored', () => {
    const harness = createUserscriptHarness();
    assert.equal(harness.retryAfterMilliseconds(new Date(1700000000000 + 600000).toUTCString()), 600000);
});

test('stop during the enforced gap prevents all remaining requests', async () => {
    const harness = createUserscriptHarness(() => jsonResponse(hubResponse('recommendedOffers', [rawOffer('offer-a')])), {
        onWait: (_, access) => access.cancelRun()
    });
    configureAccounts(harness, ['card-a', 'card-b']);
    await harness.startScan();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.scanReports.get('card-a'), 'Incomplete');
    assert.equal(harness.state.scanReports.get('card-b'), 'Pending');
    assert.equal(harness.state.busy, null);
});

test('stop during an in-flight read records its partial response but schedules no next request', async () => {
    let completeResponse;
    const response = new Promise((resolve) => { completeResponse = resolve; });
    const harness = createUserscriptHarness(() => response);
    configureAccounts(harness);
    const scan = harness.startScan();
    await Promise.resolve();
    harness.cancelRun();
    completeResponse(jsonResponse(hubResponse('recommendedOffers', [rawOffer('offer-a')])));
    await scan;
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.offersByAccount.get('card-a').length, 1);
    assert.equal(harness.enrollmentCandidates().length, 0);
});
