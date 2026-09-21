const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse } = require('./helpers/userscript-harness.cjs');
const { listing, endpoint, dashboardEndpoint, dashboardHeaders, sessionHeaders } = require('./fixtures/offers-response.cjs');

test('Chase homepage default-card preview discovers cards with all cards selected and no requests', async () => {
    const harness = createHarness(() => jsonResponse(listing('202')), { seedSession: false });
    const preview = listing();
    preview.customerOffers[0].totalAvailableOfferCount = 37;
    const capture = harness.captureSessionRequest(dashboardEndpoint, 'GET', dashboardHeaders());
    assert.notEqual(capture, null);
    assert.equal(harness.captureSessionResponse(capture, preview), true);
    assert.equal(harness.currentSession().accountId, '101');
    await harness.detectCards();
    assert.equal(harness.state.accounts.length, 2);
    assert.equal(harness.state.selected.size, 2);
    assert.equal(harness.state.offers.length, 0, 'preview must not populate saved scan results');
    assert.equal(harness.requests.length, 0);
    assert.throws(() => harness.normalizeOffers(preview, '101'), /partial|incomplete/);
    harness.setCardSelected('101', false);
    await harness.scanOffers();
    assert.equal(harness.requests.length, 1);
    const request = harness.requests[0];
    assert.deepEqual(JSON.parse(request.headers['path-params']), {
        enterprisePartyIdentifier: '909', primaryDigitalAccountIdentifierList: ['202']
    });
    assert.equal(new URL(request.url, 'https://secure.chase.com').searchParams.get('offer-count'), '');
    assert.equal(harness.state.needsScan, false);
});

test('Chase empty requested-card lists are accepted only for the observed homepage query', () => {
    const harness = createHarness(undefined, { seedSession: false });
    for (const url of [endpoint,
        dashboardEndpoint.replace('OVERVIEW_DASHBOARD', 'OFFERS_HUB_ALL'),
        dashboardEndpoint.replace('CHASE_WEB', 'UNKNOWN'),
        dashboardEndpoint.replace('offer-count=12', 'offer-count=1'),
        dashboardEndpoint.replace('NEW%2CACTIVATED%2CSERVED', 'NEW'),
        `${dashboardEndpoint}&offerCategoryCodeList=TEST`
    ]) assert.equal(harness.captureSessionRequest(url, 'GET', dashboardHeaders()), null);
    for (const requestedAccounts of [null, {}, ['101', '202']]) {
        const headers = { ...dashboardHeaders(), 'path-params': JSON.stringify({
            enterprisePartyIdentifier: '909', primaryDigitalAccountIdentifierList: requestedAccounts
        }) };
        assert.equal(harness.captureSessionRequest(dashboardEndpoint, 'GET', headers), null);
    }
});

test('Chase detection refreshes legacy shopping-based blocks and selects all newly discovered cards', async () => {
    const harness = createHarness(() => jsonResponse(listing()), { seedSession: false });
    const payload = listing();
    payload.digitalProfileAccounts[0].shoppingEligibilityIndicator = false;
    delete payload.digitalProfileAccounts[1].shoppingEligibilityIndicator;
    const capture = harness.captureSessionRequest(dashboardEndpoint, 'GET', dashboardHeaders());
    assert.equal(harness.captureSessionResponse(capture, payload), true);
    harness.state.accounts = [{ accountId: '101', name: 'Saved card', eligible: false }];
    await harness.detectCards();
    assert.equal(harness.state.accounts.every(card => card.eligible), true);
    assert.equal(harness.state.selected.size, 2);
    assert.equal(harness.requests.length, 0);
    harness.setCardSelected('202', false);
    await harness.scanOffers();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.needsScan, false);
    assert.equal(harness.state.offers.length, 1);
});

test('Chase homepage discovery rejects wrong profiles, foreign cards and ambiguous default groups', () => {
    for (const mutate of [
        payload => { payload.primaryIndividualEnterprisePartyIdentifier = '808'; },
        payload => { payload.customerOffers = []; },
        payload => { payload.customerOffers.push(...listing('202').customerOffers); },
        payload => { payload.customerOffers[0].digitalAccountIdentifier = '303'; },
        payload => { delete payload.customerOffers[0].offers; },
        payload => { payload.digitalProfileAccounts.push(payload.digitalProfileAccounts[0]); }
    ]) {
        const harness = createHarness(undefined, { seedSession: false });
        const capture = harness.captureSessionRequest(dashboardEndpoint, 'GET', dashboardHeaders());
        const payload = listing();
        mutate(payload);
        assert.equal(harness.captureSessionResponse(capture, payload), false);
        assert.throws(() => harness.currentSession(), /Open Chase Offers/);
    }
});

test('Chase stale dashboard responses cannot replace newer card or profile sessions', () => {
    const harness = createHarness(undefined, { seedSession: false });
    const dashboard = harness.captureSessionRequest(dashboardEndpoint, 'GET', dashboardHeaders());
    const card = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders('202'));
    assert.equal(harness.captureSessionResponse(card, listing('202')), true);
    assert.equal(harness.captureSessionResponse(dashboard, listing()), false);
    assert.equal(harness.currentSession().accountId, '202');
    const changed = harness.captureSessionRequest(dashboardEndpoint, 'GET', dashboardHeaders('808'));
    assert.throws(() => harness.currentSession(), /Open Chase Offers/);
    assert.equal(harness.captureSessionResponse(changed, listing()), false);
    assert.equal(harness.captureSessionResponse(changed, {
        ...listing(), primaryIndividualEnterprisePartyIdentifier: '808'
    }), true);
});
