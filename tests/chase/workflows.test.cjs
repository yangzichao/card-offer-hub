const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, selectCards } = require('./helpers/userscript-harness.cjs');
const { listing, offer } = require('./fixtures/offers-response.cjs');

function accountForRequest(request) {
    return JSON.parse(request.headers['path-params']).primaryDigitalAccountIdentifierList[0];
}

test('Chase discovery reads page capture only and never selects cards or starts enrollment', async () => {
    const harness = createHarness(() => { throw new Error('must not fetch'); });
    assert.equal(harness.requests.length, 0);
    await harness.detectCards();
    assert.equal(harness.state.accounts.length, 2);
    assert.equal(harness.state.selected.size, 0);
    assert.equal(harness.state.offers.length, 0);
    await harness.scanOffers();
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.state.enrollmentSupported, false);
    assert.match(harness.state.status, /unavailable/);
});

test('Chase missing native page capture explains the missing session without fetching', async () => {
    const harness = createHarness(() => { throw new Error('must not fetch'); }, { seedSession: false });
    await harness.detectCards();
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.state.accounts.length, 0);
    assert.match(harness.state.status, /Chase|Offers/);
});

test('Chase scans only selected accounts, serially, with 1 second initially after response completion', async () => {
    const harness = createHarness(request => jsonResponse(listing(accountForRequest(request),
        [offer('a'), offer('a'), offer('already', 'ACTIVATED')])) , { responseDelay: 4000 });
    await harness.detectCards();
    harness.setCardSelected('101', true);
    harness.setCardSelected('202', true);
    await harness.scanOffers();
    assert.equal(harness.requests.length, 2);
    assert.equal(harness.maximumActive(), 1);
    assert.deepEqual(harness.requests.map(accountForRequest), ['101', '202']);
    assert.equal(harness.requests[1].startedAt - harness.requests[0].finishedAt, 1000);
    assert.equal(harness.state.offers.length, 4);
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.needsScan, false);
    for (const request of harness.requests) {
        assert.equal(request.method, 'GET');
        assert.equal(request.body, undefined);
    }
    const stored = JSON.stringify([...harness.storage]);
    for (const forbidden of ['synthetic-token', 'offerIdentifier', 'enterprisePartyIdentifier', 'primaryDigitalAccountIdentifierList']) {
        assert.equal(stored.includes(forbidden), false);
    }
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 2, 'unverified enrollment never issues any request');
});

test('Chase deselection excludes the account and preserves saved scan results', async () => {
    const harness = createHarness(request => jsonResponse(listing(accountForRequest(request))));
    selectCards(harness, ['101', '202']);
    harness.setCardSelected('202', false);
    await harness.scanOffers();
    assert.deepEqual(harness.requests.map(accountForRequest), ['101']);
    harness.setCardSelected('101', false);
    assert.equal(harness.state.offers.length, 1);
    assert.equal(harness.state.needsScan, true);
});

test('Chase stop during pacing and concurrent clicks cannot send a second request', async () => {
    const harness = createHarness(request => jsonResponse(listing(accountForRequest(request))),
        { onWait: access => access.stopRun() });
    selectCards(harness, ['101', '202']);
    const firstRun = harness.scanOffers();
    await harness.scanOffers();
    await firstRun;
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.maximumActive(), 1);
    assert.equal(harness.state.needsScan, true);
    assert.match(harness.state.status, /Stopped/);
});

test('Chase incomplete or mismatched offer response stops remaining selected-card scans', async () => {
    for (const response of [listing('999'), { ...listing(), customerOffers: [] }]) {
        const harness = createHarness(() => jsonResponse(response));
        selectCards(harness, ['101', '202']);
        await harness.scanOffers();
        assert.equal(harness.requests.length, 1);
        assert.equal(harness.state.needsScan, true);
        assert.equal(harness.state.offers.length, 0);
    }
});

test('Chase stop in flight keeps the current read result and never scans the next card', async () => {
    const harness = createHarness((request, access) => {
        access.stopRun();
        return jsonResponse(listing(accountForRequest(request)));
    });
    selectCards(harness, ['101', '202']);
    await harness.scanOffers();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.offers.length, 1);
    assert.equal(harness.state.completed, 1);
    assert.equal(harness.state.needsScan, true);
    assert.match(harness.state.status, /Stopped/);
});

test('Chase ineligible cards cannot be selected or scanned', async () => {
    const harness = createHarness(() => { throw new Error('must not fetch'); });
    await harness.detectCards();
    harness.state.accounts[0].eligible = false;
    harness.setCardSelected('101', true);
    await harness.scanOffers();
    assert.equal(harness.state.selected.size, 0);
    assert.equal(harness.requests.length, 0);
});

test('Chase a changed session identity blocks stale selections before a request', async () => {
    const { endpoint, sessionHeaders } = require('./fixtures/offers-response.cjs');
    const harness = createHarness(() => { throw new Error('must not fetch'); });
    selectCards(harness);
    const replacement = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders('101', '808'));
    harness.captureSessionResponse(replacement, { ...listing(), primaryIndividualEnterprisePartyIdentifier: '808' });
    await harness.scanOffers();
    assert.equal(harness.requests.length, 0);
    assert.match(harness.state.status, /session changed/);
    assert.equal(harness.state.needsScan, true);
});

test('Chase session replacement during an in-flight read prevents its stale response from appearing', async () => {
    const { endpoint, sessionHeaders } = require('./fixtures/offers-response.cjs');
    const harness = createHarness((request, access) => {
        const replacement = access.captureSessionRequest(endpoint, 'GET', sessionHeaders('101', '808'));
        access.captureSessionResponse(replacement, { ...listing(), primaryIndividualEnterprisePartyIdentifier: '808' });
        return jsonResponse(listing(accountForRequest(request)));
    });
    selectCards(harness);
    await harness.scanOffers();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.offers.length, 0);
    assert.equal(harness.state.needsScan, true);
    assert.match(harness.state.status, /session changed/);
});
