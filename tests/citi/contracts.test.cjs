const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, offer, listing } = require('./helpers/userscript-harness.cjs');
const { enrollmentResponse } = require('./fixtures/enrollment-response.cjs');

test('observed nested response confirms without an account echo and needs a valid enrollment ID', () => {
    const harness = createHarness();
    const candidate = { offerId: 'synthetic-offer', accountId: 'synthetic-card' };
    const payload = enrollmentResponse(candidate.offerId);
    assert.equal(Object.hasOwn(payload.EnrolledOfferInfo, 'accountId'), false);
    assert.equal(harness.enrollmentConfirmed(payload, candidate), true);
    assert.equal(harness.enrollmentConfirmed(payload, { ...candidate, offerId: 'other-offer' }), false);
    for (const invalid of ['', '  ', null, false, 123, {}]) {
        payload.EnrolledOfferInfo.enrollmentId = invalid;
        assert.equal(harness.enrollmentConfirmed(payload, candidate), false);
    }
});

test('Citi categorization deduplicates IDs per card and refuses conflicting statuses', () => {
    const harness = createHarness();
    const payload = listing([offer('a'), offer('b'), offer('c', 'EXPIRED')]);
    payload.merchantOffers.push({ displayOffersCategory: 'Featured', offers: [offer('a'), offer('b', 'ENROLLED')] });
    const result = harness.normalizeOffers(payload, 'card-a');
    assert.deepEqual(Array.from(result, entry => [entry.offerId, entry.status]), [['a', 'AVAILABLE'], ['b', 'CONFLICT'], ['c', 'EXPIRED']]);
    assert.equal(result[0].accountId, 'card-a');
    assert.throws(() => harness.normalizeOffers({}, 'card-a'), /not recognized/);
    assert.throws(() => harness.normalizeOffers(listing([{}]), 'card-a'), /incomplete/);
});

test('Citi enrollment requires explicit confirmation and rejects conflicting IDs/status', () => {
    const harness = createHarness();
    const candidate = { offerId: 'a', accountId: 'card-a' };
    const success = { EnrolledOfferInfo: { enrollmentId: 'confirmation' }, MerchantOfferDetails: { offerId: 'a', offerStatus: 'ENROLLED' } };
    assert.equal(harness.enrollmentConfirmed(success, candidate), true);
    for (const response of [{}, { ...success, EnrolledOfferInfo: {} },
        { ...success, MerchantOfferDetails: {} }, { ...success, MerchantOfferDetails: [] },
        { ...success, MerchantOfferDetails: { offerId: 'another' } },
        { ...success, MerchantOfferDetails: { accountId: 'another' } },
        { ...success, MerchantOfferDetails: { offerStatus: 'AVAILABLE' } },
        { ...success, EnrolledOfferInfo: { enrollmentId: 'ok', accountId: 'another' } },
        { ...success, EnrolledOfferInfo: { enrollmentId: 'ok', offerId: 'another' } }]) {
        assert.equal(harness.enrollmentConfirmed(response, candidate), false);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(harness.enrollmentBody(candidate))), { offerId: 'a', accountId: 'card-a', oneClickEnroll: 'true' });
});

test('Citi session configuration comes from live cookies, including optional XSRF', () => {
    const harness = createHarness();
    assert.equal(harness.sessionHeaders().client_id, 'synthetic-client');
    harness.context.document.cookie += '; XSRF-TOKEN=synthetic-xsrf';
    assert.equal(harness.sessionHeaders()['X-XSRF-TOKEN'], 'synthetic-xsrf');
    assert.throws(() => createHarness(undefined, { cookie: '' }).sessionHeaders(), /session configuration/);
});

test('Citi Retry-After supports seconds, dates, and a fallback', () => {
    const harness = createHarness();
    assert.equal(harness.retryAfterMilliseconds('120'), 120000);
    assert.equal(harness.retryAfterMilliseconds('Wed, 01 Jan 2031 00:01:00 GMT', Date.parse('2031-01-01T00:00:00Z')), 60000);
    assert.equal(harness.retryAfterMilliseconds(null), 300000);
    assert.equal(harness.retryAfterMilliseconds('invalid'), 300000);
});

test('unknown storage schema is preserved and prevents requests', async () => {
    const saved = { schemaVersion: 999, cooldownUntil: 0, nextRequestAt: 0 };
    const storage = new Map([['citi-offer-lite:pacing', saved]]);
    const harness = createHarness(() => { throw new Error('must not fetch'); }, { storage });
    await harness.refreshAllCardsAndOffers();
    assert.equal(harness.requests.length, 0);
    assert.match(harness.state.storageError, /storage/);
    assert.deepEqual(storage.get('citi-offer-lite:pacing'), saved);
});
