const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { hubResponse, rawOffer } = require('./fixtures/synthetic-offers.cjs');

function scanResponse(request) {
    return jsonResponse(request.body.requestType === 'OFFERSHUB_LANDING'
        ? hubResponse('recommendedOffers', [rawOffer('eligible')])
        : hubResponse('addedToCardViewAll', [rawOffer('enrolled', 'ENROLLED')]));
}

test('scan touches only whitelist cards, reads both lists, and serializes requests 0.5 seconds apart', async () => {
    const harness = createUserscriptHarness(scanResponse);
    configureAccounts(harness, ['card-a', 'card-b', 'card-c'], ['card-a', 'card-c']);
    await Promise.all([harness.startScan(), harness.startScan()]);
    assert.deepEqual(harness.requests.map((request) => request.body.accountNumberProxy), ['card-a', 'card-a', 'card-c', 'card-c']);
    assert.deepEqual(harness.requests.map((request) => request.body.requestType), ['OFFERSHUB_LANDING', 'ADDEDTOCARD_LANDING', 'OFFERSHUB_LANDING', 'ADDEDTOCARD_LANDING']);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.ok(harness.requests[index].startedAt - harness.requests[index - 1].startedAt >= 500);
    }
    assert.equal(harness.maximumActiveRequests(), 1);
    assert.equal(harness.state.offersByAccount.has('card-b'), false);
    assert.match(harness.state.status, /Scan complete: 2\/2/);
});

test('all returned pages are retained without a 100-offer cap, including informational cards', async () => {
    const harness = createUserscriptHarness((request) => {
        if (request.body.requestType === 'ADDEDTOCARD_LANDING') return jsonResponse(hubResponse('addedToCardViewAll', [rawOffer('offer-1', 'ENROLLED')]));
        return jsonResponse({ recommendedOffers: { offersList: {
            page1: Array.from({ length: 100 }, (_, index) => rawOffer(`offer-${index}`)),
            page2: Array.from({ length: 30 }, (_, index) => rawOffer(`offer-${index + 100}`)),
            page3: [rawOffer('information', 'NOT_ENROLLED', { offerType: 'CARD', ctaDetails: { ctaType: 'STANDARD' } })]
        } } });
    });
    configureAccounts(harness);
    await harness.startScan();
    const offers = harness.state.offersByAccount.get('card-a');
    assert.equal(offers.length, 131);
    assert.equal(offers.find((offer) => offer.id === 'offer-1').status, 'ENROLLED');
    assert.equal(offers.find((offer) => offer.id === 'information').enrollable, false);
});

test('an API error stops the run without hiding failure as zero offers or changing whitelist', async () => {
    const harness = createUserscriptHarness(() => jsonResponse({}, 400));
    configureAccounts(harness, ['card-a', 'card-b']);
    await harness.startScan();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.whitelist.size, 2);
    assert.match(harness.state.status, /HTTP 400/);
    assert.equal(harness.state.scanReports.get('card-a'), 'Not scanned');
    assert.equal(harness.state.scanReports.get('card-b'), 'Pending');
    assert.equal(harness.state.busy, null);
});

test('unknown list shapes stop as incomplete and never unlock enrollment', async () => {
    const harness = createUserscriptHarness((request, index) => index === 1 ? scanResponse(request) : jsonResponse({}));
    configureAccounts(harness);
    await harness.startScan();
    assert.equal(harness.state.scanReports.get('card-a'), 'Incomplete');
    assert.equal(harness.enrollmentCandidates().length, 0);
    assert.equal(harness.state.offersByAccount.get('card-a').length, 1);
});

test('empty whitelist and direct API calls for an unapproved card send nothing', async () => {
    const harness = createUserscriptHarness();
    configureAccounts(harness, ['card-a'], []);
    await harness.startScan();
    await assert.rejects(harness.getAllOffersForAccount('card-a'), /not in the detected whitelist/);
    await assert.rejects(harness.enrollOffer('card-a', 'offer-a'), /not in the detected whitelist/);
    assert.equal(harness.requests.length, 0);
});

test('a response for a different card stops the scan', async () => {
    const harness = createUserscriptHarness(() => jsonResponse(hubResponse('recommendedOffers', [], { accountNumberProxy: 'card-b' })));
    configureAccounts(harness);
    await harness.startScan();
    assert.match(harness.state.status, /different card/);
    assert.equal(harness.state.offersByAccount.size, 0);
});
