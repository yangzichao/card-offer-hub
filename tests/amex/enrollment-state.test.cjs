const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { rawOffer, confirmation } = require('./fixtures/synthetic-offers.cjs');

function prepareEnrollment(harness) {
    configureAccounts(harness);
    const offer = harness.normalizeHubOffer(rawOffer('offer-a'));
    harness.state.offersByAccount.set('card-a', [offer]);
    harness.state.scanReports.set('card-a', 'Complete · 1 offers');
    return offer;
}

for (const [description, response, expectedStatus] of [
    ['confirmed', jsonResponse(confirmation('offer-a')), 'ENROLLED'],
    ['rejected', jsonResponse({ status: { purpose: 'ERROR' } }), 'FAILED'],
    ['unconfirmed', jsonResponse({}), 'UNCONFIRMED'],
    ['rate limited', jsonResponse({}, 429), 'ELIGIBLE']
]) {
    test(`${description} enrollment persists state with no DOM badge`, async () => {
        const harness = createUserscriptHarness(() => response);
        const offer = prepareEnrollment(harness);
        await harness.startEnrollment();
        assert.equal(offer.status, expectedStatus);
        assert.equal(harness.state.busy, null);
    });
}

test('filtering while a request is in flight cannot lose its result', async () => {
    let finishRequest;
    const response = new Promise((resolve) => { finishRequest = resolve; });
    const harness = createUserscriptHarness(() => response);
    const offer = prepareEnrollment(harness);
    const enrollment = harness.startEnrollment();
    harness.state.filter = 'hidden';
    finishRequest(jsonResponse(confirmation('offer-a')));
    await enrollment;
    assert.equal(offer.status, 'ENROLLED');
});

test('incomplete scans cannot enroll and whitelist removal hides saved offers', async () => {
    const harness = createUserscriptHarness();
    prepareEnrollment(harness);
    harness.state.scanReports.set('card-a', 'Incomplete');
    await harness.startEnrollment();
    assert.equal(harness.requests.length, 0);
    harness.setCardWhitelisted('card-a', false);
    assert.equal(harness.state.offersByAccount.has('card-a'), true);
    assert.equal(harness.enrollmentCandidates().length, 0);
});
