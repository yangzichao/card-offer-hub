const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrap, offer, listing, createHarness } = require('./helpers/userscript-harness.cjs');

test('JSON-string data is decoded using array contents, not the misleading count', () => {
    const harness = createHarness();
    const offers = harness.normalizeOffers(listing([offer('1001'), offer('1002'), offer('1001')]));
    assert.deepEqual(Array.from(offers, item => item.offerId), ['1001', '1002']);
    assert.ok(offers.every(item => item.status === 'AVAILABLE'));
    assert.equal(harness.normalizeOffers(listing([])).length, 0);
});

test('activated, multi-card, other vendor, unknown state, and conflicting offers cannot be activated', () => {
    const harness = createHarness();
    const records = [offer('1', { isActivated: true }), offer('2', { multiCardFlag: true }),
        offer('3', { vendorName: 'OTHER' }), offer('4', {}, { cards: [{ productName: 'Synthetic' }] }),
        offer('5', {}, { status: 'UNKNOWN' }), offer('6', { isActivated: undefined }), offer('7')];
    const results = harness.normalizeOffers(listing(records, [offer('7'), offer('8')]));
    assert.equal(results.some(item => item.status === 'AVAILABLE'), false);
    assert.equal(results.find(item => item.offerId === '7').status, 'CONFLICT');
    assert.equal(results.find(item => item.offerId === '8').status, 'ACTIVATED');
});

test('malformed or failed listings fail closed', () => {
    const harness = createHarness();
    for (const payload of [null, {}, { ...listing(), data: {} }, { ...listing(), data: '<html>' },
        { ...listing(), status: { statusCode: 200, messages: [{ code: 'FAILURE' }] } },
        { ...listing(), data: JSON.stringify({ availableDeals: { cardlyticsEligibleDeals: [] } }) },
        listing([null]), listing([offer('../outside')])]) {
        assert.throws(() => harness.normalizeOffers(payload));
    }
});

test('activation matches captured contract: empty checksum, ENROLL, no email or card identifiers', () => {
    const harness = createHarness();
    const [normalized] = harness.normalizeOffers(listing());
    assert.deepEqual(JSON.parse(JSON.stringify(harness.enrollmentBody(normalized))), {
        offerIdCheckSumMap: { 1001: '' }, activityCode: 'ENROLL', displayType: 'Offer', sendEmailFlag: false
    });
    assert.throws(() => harness.enrollmentBody({ offerId: '1001', status: 'UNSUPPORTED' }));
    for (const payload of [{}, null, { status: 'success' }, { status: true }, { success: true }, { status: 'FAILED' }]) {
        assert.equal(harness.enrollmentConfirmed(payload), false);
    }
    assert.equal(harness.enrollmentConfirmed({ status: 'SUCCESS' }), true);
});

test('activation token comes from current page bootstrap without evaluating JavaScript', () => {
    const scripts = [bootstrap()];
    const harness = createHarness(undefined, { scripts });
    assert.equal(harness.activationUrl(), '/deals-portal/as/activateCLDeal?token=synthetic-token');
    scripts[0] = bootstrap('/deals-portal/as/activateCLDeal?token=new-synthetic');
    assert.match(harness.activationUrl(), /new-synthetic$/);
    for (const action of ['https://example.com/deals-portal/as/activateCLDeal?token=x', '/other?token=x',
        '/deals-portal/as/activateCLDeal', '/deals-portal/as/activateCLDeal?token=x&token=y',
        '/deals-portal/as/activateCLDeal?token=x&extra=y', '/deals-portal/as/activateCLDeal?token=x#fragment']) {
        assert.throws(() => createHarness(undefined, { scripts: [bootstrap(action)] }).activationUrl());
    }
    for (const invalidScripts of [[], [bootstrap(), bootstrap()], ['window.initialState = JSON.parse(alert("never"));']]) {
        assert.throws(() => createHarness(undefined, { scripts: invalidScripts }).activationUrl());
    }
});

test('Retry-After supports seconds, dates, and conservative fallback', () => {
    const harness = createHarness();
    assert.equal(harness.retryAfterMilliseconds('600'), 600000);
    assert.equal(harness.retryAfterMilliseconds('Thu, 01 Jan 1970 00:01:00 GMT', 0), 60000);
    assert.equal(harness.retryAfterMilliseconds('invalid'), 300000);
});
