const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, selectCards } = require('./helpers/userscript-harness.cjs');
const { listing, endpoint, sessionHeaders } = require('./fixtures/offers-response.cjs');

test('Chase session observation accepts only the known same-origin GET and required session headers', () => {
    const harness = createHarness(undefined, { seedSession: false });
    for (const [url, method, headers] of [
        [endpoint.replace('secure.chase.com', 'example.com'), 'GET', sessionHeaders()],
        [endpoint.replace('customer-offers', 'activate-offer'), 'GET', sessionHeaders()],
        [endpoint, 'POST', sessionHeaders()], [endpoint, 'GET', {}],
        [endpoint, 'GET', { ...sessionHeaders(), 'x-jpmc-csrf-token': '' }]
    ]) assert.equal(harness.captureSessionRequest(url, method, headers), null);
    assert.throws(() => harness.currentSession(), /Open Chase Offers/);
    const context = harness.captureSessionRequest(endpoint, 'GET', { ...sessionHeaders(), Authorization: 'never-retain', 'unrelated-header': 'ignored' });
    assert.equal(harness.captureSessionResponse(context, listing()), true);
    assert.equal(harness.sessionHeaders().authorization, undefined);
    assert.equal(harness.sessionHeaders()['unrelated-header'], undefined);
    const capturedAccounts = harness.getCapturedAccountsPayload();
    assert.equal(Object.hasOwn(capturedAccounts, 'customerOffers'), false);
    assert.equal(Object.hasOwn(capturedAccounts, 'primaryIndividualEnterprisePartyIdentifier'), false);
});

test('Chase native responses must match profile identity and newest request order', () => {
    const harness = createHarness(undefined, { seedSession: false });
    const first = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders());
    const second = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders('202'));
    assert.equal(harness.captureSessionResponse(second, listing('202')), true);
    assert.equal(harness.captureSessionResponse(first, listing()), false);
    assert.equal(harness.currentSession().accountId, '202');
    const changed = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders('101', '808'));
    assert.throws(() => harness.currentSession(), /Open Chase Offers/);
    assert.equal(harness.captureSessionResponse(changed, listing()), false);
    assert.equal(harness.captureSessionResponse(changed, { ...listing(), primaryIndividualEnterprisePartyIdentifier: '808' }), true);
    assert.equal(harness.currentSession().enterprisePartyIdentifier, '808');
});

test('Chase untrusted read descriptors cannot introduce arbitrary endpoints, mutations, or extra accounts', async () => {
    const harness = createHarness(() => jsonResponse(listing()));
    selectCards(harness);
    const descriptor = harness.buildOffersRequest('101');
    for (const invalid of [
        { ...descriptor, method: 'POST' },
        { ...descriptor, path: '/unverified-endpoint' },
        { ...descriptor, headers: { ...descriptor.headers, 'x-extra': 'disallowed' } },
        { ...descriptor, headers: { 'path-params': JSON.stringify({ enterprisePartyIdentifier: '909', primaryDigitalAccountIdentifierList: ['101', '202'] }) } }
    ]) await assert.rejects(harness.requestJson(invalid));
    assert.equal(harness.requests.length, 0);
});

test('Chase preserves leading zeros in synthetic profile and account identifiers through a scan', async () => {
    const profileIdentifier = '0000900';
    const accountIdentifier = '000101';
    const response = listing();
    response.primaryIndividualEnterprisePartyIdentifier = profileIdentifier;
    response.digitalProfileAccounts = [{ ...response.digitalProfileAccounts[0], digitalAccountIdentifier: accountIdentifier }];
    response.customerOffers[0].digitalAccountIdentifier = accountIdentifier;
    const harness = createHarness(() => jsonResponse(response), { seedSession: false });
    const capture = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders(accountIdentifier, profileIdentifier));
    assert.notEqual(capture, null);
    assert.equal(harness.captureSessionResponse(capture, response), true);
    assert.equal(harness.currentSession().enterprisePartyIdentifier, profileIdentifier);
    assert.equal(harness.currentSession().accountId, accountIdentifier);
    await harness.detectCards();
    harness.setCardSelected(accountIdentifier, true);
    await harness.scanOffers();
    assert.equal(harness.requests.length, 1);
    assert.deepEqual(JSON.parse(harness.requests[0].headers['path-params']), {
        enterprisePartyIdentifier: profileIdentifier,
        primaryDigitalAccountIdentifierList: [accountIdentifier]
    });
    assert.equal(harness.state.offers[0].accountId, accountIdentifier);
    assert.equal(harness.state.needsScan, false);
    assert.throws(() => harness.normalizeOffers(response, accountIdentifier, '900'), /identity|profile|session/i);
    const mismatchedCapture = harness.captureSessionRequest(endpoint, 'GET', sessionHeaders(accountIdentifier, '900'));
    assert.equal(harness.captureSessionResponse(mismatchedCapture, response), false);
});
