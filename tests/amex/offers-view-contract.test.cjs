const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { rawOffer, hubResponse } = require('./fixtures/synthetic-offers.cjs');

test('ADDEDTOCARD_LANDING reads addedToCardViewAll, never the landing preview', async () => {
    const harness = createUserscriptHarness((request) => jsonResponse(request.body.requestType === 'OFFERSHUB_LANDING'
        ? hubResponse('recommendedOffers', [rawOffer('eligible')])
        : { ...hubResponse('addedToCardViewAll', [rawOffer('full-1', 'ENROLLED'), rawOffer('full-2', 'ENROLLED')]),
            addedToCard: { offersList: { page1: [rawOffer('preview-only', 'ENROLLED')] } } }));
    configureAccounts(harness);
    await harness.startScan();
    const offers = harness.state.offersByAccount.get('card-a');
    assert.deepEqual(Array.from(offers, (offer) => offer.id), ['eligible', 'full-1', 'full-2']);
    assert.equal(harness.state.scanReports.get('card-a'), 'Complete');
});

test('seven whitelist cards all finish with the official full-view response shape', async () => {
    const harness = createUserscriptHarness((request) => jsonResponse(request.body.requestType === 'OFFERSHUB_LANDING'
        ? hubResponse('recommendedOffers', [rawOffer(`available-${request.body.accountNumberProxy}`)])
        : hubResponse('addedToCardViewAll', [rawOffer(`added-${request.body.accountNumberProxy}`, 'ENROLLED')])));
    configureAccounts(harness, Array.from({ length: 7 }, (_, index) => `card-${index}`));
    await harness.startScan();
    assert.equal(harness.requests.length, 14);
    assert.equal(harness.state.offersByAccount.size, 7);
    assert.ok([...harness.state.scanReports.values()].every((report) => report === 'Complete'));
    assert.match(harness.state.status, /Scan complete: 7\/7/);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.ok(harness.requests[index].startedAt - harness.requests[index - 1].startedAt >= 15000);
    }
});

test('one malformed added view preserves eligible data and does not block the next card', async () => {
    const harness = createUserscriptHarness((request) => {
        if (request.body.requestType === 'OFFERSHUB_LANDING') return jsonResponse(hubResponse('recommendedOffers', [rawOffer('eligible')]));
        return jsonResponse(request.body.accountNumberProxy === 'card-a' ? {} : hubResponse('addedToCardViewAll', []));
    });
    configureAccounts(harness, ['card-a', 'card-b']);
    await harness.startScan();
    assert.equal(harness.requests.length, 4);
    assert.equal(harness.state.scanReports.get('card-a'), 'Incomplete');
    assert.equal(harness.state.scanReports.get('card-b'), 'Complete');
    assert.equal(harness.state.offersByAccount.get('card-a').length, 1);
    assert.match(harness.state.status, /2\/2 cards attempted; 1 complete, 1 incomplete/);
    assert.equal(harness.enrollmentCandidates().length, 1);
    assert.equal(harness.enrollmentCandidates()[0].account.token, 'card-b');
});

test('a malformed recommended view does not prevent parsing the full added view', async () => {
    const harness = createUserscriptHarness((request) => jsonResponse(request.body.requestType === 'OFFERSHUB_LANDING'
        ? {} : hubResponse('addedToCardViewAll', [rawOffer('added', 'ENROLLED')])));
    configureAccounts(harness);
    await harness.startScan();
    assert.equal(harness.requests.length, 2);
    assert.equal(harness.state.offersByAccount.get('card-a')[0].status, 'ENROLLED');
    assert.equal(harness.state.scanReports.get('card-a'), 'Incomplete');
});

test('a missing full view is not silently interpreted as an empty list or replaced with the preview', () => {
    const harness = createUserscriptHarness();
    assert.throws(() => harness.offersInSection(hubResponse('addedToCard', []), 'addedToCardViewAll'), /not recognized/);
    assert.equal(harness.offersInSection(hubResponse('addedToCardViewAll', []), 'addedToCardViewAll').length, 0);
});
