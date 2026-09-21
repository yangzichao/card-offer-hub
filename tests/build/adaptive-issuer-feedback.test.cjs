const assert = require('node:assert/strict');
const { test } = require('node:test');
const citi = require('../citi/helpers/userscript-harness.cjs');
const chase = require('../chase/helpers/userscript-harness.cjs');
const chaseFixtures = require('../chase/fixtures/offers-response.cjs');
const bofa = require('../bank-of-america/helpers/userscript-harness.cjs');
const usbank = require('../usbank/helpers/userscript-harness.cjs');
const wells = require('../wellsfargo/helpers/userscript-harness.cjs');
const amex = require('../amex/helpers/userscript-harness.cjs');
const amexFixtures = require('../amex/fixtures/synthetic-offers.cjs');

const issuers = [
    { id: 'citi-offer-lite', ...citi, prepare: harness => citi.selectCards(harness),
        response: () => citi.jsonResponse(citi.listing()) },
    { id: 'chase-offer-lite', ...chase, prepare: harness => chase.selectCards(harness),
        response: () => chase.jsonResponse(chaseFixtures.listing()) },
    { id: 'bofa-offer-lite', ...bofa, response: bofa.responder() },
    { id: 'usbank-offer-lite', ...usbank, response: () => usbank.jsonResponse(usbank.listing()) },
    { id: 'wellsfargo-offer-lite', ...wells, response: () => wells.jsonResponse(wells.listing()) },
    { id: 'amex-offer-lite', createHarness: amex.createUserscriptHarness,
        prepare: harness => amex.configureAccounts(harness),
        jsonResponse: (payload, status, retryAfter) => amex.jsonResponse(payload, status, { 'Retry-After': retryAfter }),
        response: request => amex.jsonResponse(amexFixtures.hubResponse(
            request.body.requestType === 'OFFERSHUB_LANDING' ? 'recommendedOffers' : 'addedToCardViewAll', [])) }
];
const scan = harness => harness.scanOffers ? harness.scanOffers() : harness.startScan();
const storage = harness => harness.userscriptStorage || harness.storage;

for (const issuer of issuers) {
    test(`${issuer.id}: accepted scan responses learn and restore without startup requests`, async () => {
        const harness = issuer.createHarness(issuer.response);
        issuer.prepare?.(harness);
        await scan(harness);
        assert.ok(harness.state.pacing.successCount > 0);
        const profile = storage(harness).get(`${issuer.id}:pacing`);
        assert.equal(profile.schemaVersion, 2);
        assert.equal(profile.currentGapMs, 1000);
        const reloaded = issuer.createHarness(undefined, { storage: storage(harness), userscriptStorage: storage(harness) });
        reloaded.restorePacing();
        assert.equal(reloaded.state.pacing.successCount, profile.successCount);
        assert.equal(reloaded.requests.length, 0);
        assert.deepEqual(Object.keys(profile).sort(), ['schemaVersion', 'revision', 'policyVersion', 'currentGapMs',
            'lastStableGapMs', 'successCount', 'observedActiveMs', 'lastRateLimitAt', 'consecutiveLimits',
            'updatedAt', 'nextRequestAt', 'cooldownUntil'].sort(), 'only pacing parameters, counters and times are saved');
    });

    test(`${issuer.id}: 429 retreats once, persists, and stops without automatic retries`, async () => {
        const harness = issuer.createHarness(() => issuer.jsonResponse({}, 429, '600'));
        issuer.prepare?.(harness);
        await scan(harness);
        assert.equal(harness.requests.length, 1);
        assert.equal(harness.state.pacing.currentGapMs, 2000);
        assert.equal(harness.state.pacing.consecutiveLimits, 1);
        const profile = storage(harness).get(`${issuer.id}:pacing`);
        assert.equal(profile.currentGapMs, 2000);
        assert.equal(profile.cooldownUntil - harness.requests[0].startedAt, 600000);
        const reloaded = issuer.createHarness(undefined, { storage: storage(harness), userscriptStorage: storage(harness) });
        reloaded.restorePacing();
        assert.equal(reloaded.state.pacing.currentGapMs, 2000);
        assert.equal(reloaded.state.cooldownUntil, profile.cooldownUntil);
        await scan(harness);
        assert.equal(harness.requests.length, 1, 'a second click during cooldown still sends nothing');
    });

    for (const status of [200, 401, 500]) {
        test(`${issuer.id}: an invalid HTTP ${status} response never counts as a stable sample`, async () => {
            const harness = issuer.createHarness(() => issuer.jsonResponse({}, status));
            issuer.prepare?.(harness);
            await scan(harness);
            assert.equal(harness.state.pacing.successCount, 0);
            assert.equal(harness.state.pacing.currentGapMs, 1000);
            assert.equal(harness.state.pacing.consecutiveLimits, 0);
        });
    }
}

test('BoA write acknowledgement is neutral, and an unconfirmed readback clears its prior successes', async () => {
    const harness = bofa.createHarness(bofa.responder([bofa.offer()], 'readback'));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.pacing.successCount, 0);
    assert.equal(harness.state.pacing.currentGapMs, 1000);
    assert.equal(harness.requests.filter(request => request.method === 'PUT').length, 1);
});

test('US Bank acknowledgement cannot make an unconfirmed activation a successful pacing sample', async () => {
    const harness = usbank.createHarness(request => usbank.jsonResponse(usbank.isActivation(request)
        ? usbank.acknowledgement() : usbank.listing()));
    await harness.scanOffers();
    await harness.addAllOffers();
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.pacing.successCount, 0);
    assert.equal(harness.state.pacing.currentGapMs, 1000);
    assert.equal(harness.requests.filter(usbank.isActivation).length, 1);
});

test('Amex shares a bank lock and stops before sending if another tab owns it', async () => {
    const harness = amex.createUserscriptHarness(undefined, { locked: true });
    amex.configureAccounts(harness);
    await harness.startScan();
    assert.equal(harness.requests.length, 0);
    assert.match(harness.state.status, /another tab/);
});

test('Amex cannot start a request when its learned profile cannot be persisted', async () => {
    const harness = amex.createUserscriptHarness(undefined, { storageWriteError: true });
    amex.configureAccounts(harness);
    await harness.startScan();
    assert.equal(harness.requests.length, 0);
    assert.match(harness.state.storageError, /Cannot save pacing/);
    assert.match(harness.state.status, /Cannot save pacing/);
});

test('confirmed BoA and US Bank writes learn only from verified reads, never acknowledgement', async () => {
    const deals = bofa.createHarness(bofa.responder());
    await deals.scanOffers();
    deals.state.consent = true;
    await deals.activateOffers();
    assert.equal(deals.state.confirmed, 1);
    assert.equal(deals.requests.length, 5);
    assert.equal(deals.state.pacing.successCount, 4, 'geo, list, preflight, verified readback');
    const cashBack = usbank.createHarness(usbank.successfulResponder(['a']));
    await cashBack.scanOffers();
    await cashBack.addAllOffers();
    assert.equal(cashBack.state.confirmed, 1);
    assert.equal(cashBack.requests.length, 4);
    assert.equal(cashBack.state.pacing.successCount, 3, 'scan, preflight, verified readback');
});

test('BoA changed eligibility is not rewarded as a successful preflight', async () => {
    const response = bofa.responder();
    const harness = bofa.createHarness(request => request.path === '/api/offers-details'
        ? bofa.jsonResponse({ offer: bofa.offer('101', { is_activated: true }) }) : response(request));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.equal(harness.state.pacing.successCount, 0);
    assert.equal(harness.requests.filter(request => request.method === 'PUT').length, 0);
});

for (const issuer of [issuers[0], issuers[5]]) {
    test(`${issuer.id}: 429 learning is durable before its body finishes or fails`, async () => {
        let harness;
        let bodyConsumed = false;
        harness = issuer.createHarness(() => {
            const response = issuer.jsonResponse({}, 429, '600');
            response[issuer.id === 'amex-offer-lite' ? 'json' : 'text'] = async () => {
                const saved = storage(harness).get(`${issuer.id}:pacing`);
                assert.equal(saved.currentGapMs, 2000);
                assert.equal(saved.consecutiveLimits, 1);
                bodyConsumed = true;
                throw new Error('Synthetic broken error body');
            };
            return response;
        });
        issuer.prepare?.(harness);
        await scan(harness);
        assert.equal(bodyConsumed, true);
        assert.equal(harness.requests.length, 1);
        assert.equal(harness.state.pacing.currentGapMs, 2000);
        assert.equal(harness.state.pacing.consecutiveLimits, 1, 'headers and failure do not learn the same limit twice');
    });
}
