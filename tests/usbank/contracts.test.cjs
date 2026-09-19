const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, offer, listing, acknowledgement } = require('./helpers/userscript-harness.cjs');

test('only explicit eligible offers are available; unknown and conflicting states fail closed', () => {
    const harness = createHarness();
    const response = listing([
        offer('new'), offer('served', 'SERVED'), offer('active', 'ACTIVATED'), offer('unknown', null),
        offer('auto', 'NEW', { reward: { activationModel: 'AUTO_ACTIVATED' } }),
        offer('expired', 'NEW', { endDate: '2020-01-01T00:00:00Z' }),
        offer('future', 'NEW', { startDate: '2099-01-01T00:00:00Z' }),
        offer('bad-date', 'NEW', { endDate: null }), offer('hidden', 'NEW', { visibilityState: 'HIDDEN' }),
        offer('affiliate', 'NEW', { isAffiliateMarketing: true }),
        offer('link', 'NEW', { reward: { activationModel: 'ACTIVATABLE', purchaseRequirement: { merchantUrlLinkClickRequired: true } } }),
        offer('no-token', 'NEW', { adServeToken: '' }), offer('duplicate'), offer('duplicate', 'ACTIVATED')
    ]);
    const normalized = harness.normalizeListing(response);
    assert.deepEqual(Array.from(normalized.offers.filter(item => item.status === 'AVAILABLE'), item => item.offerId), ['new', 'served']);
    assert.equal(normalized.offers.find(item => item.offerId === 'duplicate').status, 'CONFLICT');
    assert.equal(harness.activationConfirmed(normalized, 'active'), true);
    assert.equal(harness.activationConfirmed(normalized, 'duplicate'), false);
});

test('activation acknowledgement alone never proves activated state', () => {
    const harness = createHarness();
    assert.equal(harness.activationAcknowledged(acknowledgement()), true);
    assert.equal(harness.activationConfirmed(harness.normalizeListing(listing()), 'a'), false);
    assert.equal(harness.activationAcknowledged({ data: { getActivateOffer: { requestId: '' } } }), false);
    for (const response of [{}, { errors: [{ message: 'sensitive error' }], data: acknowledgement().data }]) {
        assert.throws(() => harness.activationAcknowledged(response), /response was not recognized|GraphQL error/);
    }
});

test('activation request uses fresh listing context and exactly one observed activation event', () => {
    const harness = createHarness();
    const normalized = harness.normalizeListing(listing());
    const body = harness.activationBody(normalized.offers[0], normalized);
    assert.equal(body.request.sessionTokenId, 'synthetic-deals-session');
    assert.equal(body.request.clientEvents.length, 1);
    const event = body.request.clientEvents[0];
    assert.equal(event.clientOfferId, 'a');
    assert.equal(event.clientEventId, normalized.requestId);
    assert.equal(event.clientEventType, 'AdInteraction');
    assert.equal(event.clientEvent, 'ActivateOffer');
    assert.equal(event.clientEventMetadata.serveToken, 'synthetic-serve-a');
    assert.equal(event.curationId, 'Featured');
    harness.advance(1000 * 60 * 60 * 24 * 365 * 100);
    assert.throws(() => harness.activationBody(normalized.offers[0], normalized), /no longer eligible/);
});

test('malformed lists and HTTP 200 GraphQL partial errors are rejected', () => {
    const harness = createHarness();
    for (const response of [{}, listing([], { sessionTokenId: '' }), listing([{}]),
        { ...listing(), errors: [{ message: 'do not surface me' }] }]) {
        assert.throws(() => harness.normalizeListing(response));
    }
    assert.equal(harness.normalizeListing(listing([])).offers.length, 0);
});

test('session fields map to current page storage, never a captured credential', () => {
    const harness = createHarness();
    assert.deepEqual(JSON.parse(JSON.stringify(harness.readSession())), {
        sourceApplication: 'OLB', sourceCustomerId: 'synthetic-customer', userId: 'synthetic-user', sessionTokenId: 'synthetic-token'
    });
    assert.throws(() => createHarness(undefined, { session: {} }).readSession(), /session is unavailable/);
    assert.notEqual(harness.sessionHeaders()['correlation-id'], harness.sessionHeaders()['correlation-id']);
});
