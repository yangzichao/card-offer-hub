const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, offer, listing, confirmation, selectCards } = require('./helpers/userscript-harness.cjs');

const card = accountId => ({ accountId, displayProductName: `Synthetic ${accountId}` });
function savedWorkspace() {
    const harness = createHarness(() => jsonResponse(listing()));
    selectCards(harness, ['card-a', 'card-b', 'removed']);
    harness.setCardSelected('card-b', false);
    return harness.scanOffers().then(() => harness);
}

test('one refresh updates all current cards, preserves opt-outs, removes old cards and never enrolls', async () => {
    const previous = await savedWorkspace();
    const harness = createHarness(request => jsonResponse(request.body.accountId
        ? listing([offer(`new-${request.body.accountId}`)])
        : listing([offer('default-must-not-be-assigned')], ['card-a', 'card-b', 'card-c'].map(card))),
    { storage: previous.storage, responseDelay: 800 });
    harness.restoreWorkspace();
    await harness.refreshAllCardsAndOffers();
    assert.deepEqual(harness.requests.map(request => request.body), [{}, { accountId: 'card-a' }, { accountId: 'card-b' }, { accountId: 'card-c' }]);
    assert.deepEqual(Array.from(harness.state.selected), ['card-a']);
    assert.deepEqual(Array.from(harness.state.offers, record => record.offerId), ['new-card-a', 'new-card-b', 'new-card-c']);
    assert.equal(harness.state.needsScan, false);
    assert.equal(harness.maximumActive(), 1);
    assert.ok(harness.requests.every(request => request.url.endsWith('/retrieve')));
    for (let index = 1; index < harness.requests.length; index++) {
        assert.equal(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt, 1000);
    }
    const restored = createHarness(() => { throw new Error('no startup requests'); }, { storage: harness.storage });
    restored.restoreWorkspace();
    assert.deepEqual(Array.from(restored.state.selected), ['card-a']);
    assert.equal(restored.state.offers.length, 3);
    assert.equal(restored.requests.length, 0);
});

test('an empty successful refresh clears removed cards and their offers', async () => {
    const previous = await savedWorkspace();
    const harness = createHarness(() => jsonResponse(listing([], [])), { storage: previous.storage });
    harness.restoreWorkspace();
    await harness.refreshAllCardsAndOffers();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.accounts.length, 0);
    assert.equal(harness.state.offers.length, 0);
    assert.equal(harness.state.selected.size, 0);
    assert.equal(harness.state.needsScan, false);
});

test('a failed refresh keeps old unscanned results and the last complete timestamp, then stops', async () => {
    const previous = await savedWorkspace();
    const timestamp = previous.state.lastScanAt;
    const harness = createHarness(request => request.body.accountId === 'card-b' ? jsonResponse({}, 500)
        : jsonResponse(request.body.accountId ? listing([offer('updated')]) : listing([], ['card-a', 'card-b', 'removed'].map(card))),
    { storage: previous.storage });
    harness.restoreWorkspace();
    await harness.refreshAllCardsAndOffers();
    assert.equal(harness.requests.length, 3);
    assert.equal(harness.state.lastScanAt, timestamp);
    assert.equal(harness.state.needsScan, true);
    assert.ok(harness.state.offers.some(record => record.accountId === 'removed' && record.offerId === 'offer-a'));
    await harness.addSavedOffers();
    assert.equal(harness.requests.length, 3);
});

test('stopping an all-card refresh during pacing prevents any further card requests', async () => {
    const harness = createHarness(() => jsonResponse(listing([], ['card-a', 'card-b'].map(card))),
        { onWait: access => access.stopRun() });
    await harness.refreshAllCardsAndOffers();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.needsScan, true);
    assert.match(harness.state.status, /Stopped/);
});

test('cached continuation verifies the login but never refreshes or replaces saved offers', async () => {
    const previous = await savedWorkspace();
    previous.setCardSelected('removed', false);
    const harness = createHarness(request => jsonResponse(request.url.endsWith('/enrollMerchantOffer')
        ? confirmation(request)
        : request.body.accountId ? listing([offer('offer-a', 'ENROLLED'), offer('remaining')])
            : listing([], ['card-a', 'card-b'].map(card))), { storage: previous.storage });
    harness.restoreWorkspace();
    harness.state.search = 'no matching offers';
    assert.equal(harness.canAddSavedOffers(), true);
    await harness.addSavedOffers();
    assert.deepEqual(harness.requests.map(request => request.body), [
        {}, { accountId: 'card-a', offerId: 'offer-a', oneClickEnroll: 'true' }
    ]);
    assert.equal(harness.state.confirmed, 1);
});

test('continue refuses to enroll when the restored selections belong to another login', async () => {
    const previous = await savedWorkspace();
    const harness = createHarness(() => jsonResponse(listing([], [card('other-login')])) , { storage: previous.storage });
    harness.restoreWorkspace();
    await harness.addSavedOffers();
    assert.equal(harness.requests.length, 1);
    assert.deepEqual(harness.requests[0].body, {});
    assert.equal(harness.state.selected.size, 0);
    assert.equal(harness.state.offers.length, 0);
    assert.match(harness.state.status, /do not match this login/);
});

test('a failed continuation needs an explicit refresh before another attempt', async () => {
    const previous = await savedWorkspace();
    const harness = createHarness(() => jsonResponse({}, 401), { storage: previous.storage });
    harness.restoreWorkspace();
    await harness.addSavedOffers();
    assert.equal(harness.canAddSavedOffers(), false);
    await harness.addSavedOffers();
    assert.equal(harness.requests.length, 1);
    assert.match(harness.state.status, /HTTP 401/);
});

test('a previously unconfirmed enrollment requires a refresh and is not replayed', async () => {
    const previous = await savedWorkspace();
    previous.markWorkspaceOfferPending(previous.state.offers[0]);
    const harness = createHarness(request => jsonResponse(request.body.accountId ? listing([offer('offer-a', 'ENROLLED')])
        : listing([], ['card-a', 'card-b', 'removed'].map(card))), { storage: previous.storage });
    harness.restoreWorkspace();
    assert.equal(harness.canAddSavedOffers(), false);
    await harness.addSavedOffers();
    assert.equal(harness.requests.length, 0);
    await harness.refreshAndAddOffers();
    assert.equal(harness.requests.length, 4);
    assert.ok(harness.state.offers.every(record => record.status === 'ENROLLED'));
    assert.ok(harness.requests.every(request => request.url.endsWith('/retrieve')));
});

test('refresh and add discovers offers on all cards then enrolls only selected cards without a second scan', async () => {
    const previous = await savedWorkspace();
    previous.setCardSelected('removed', false);
    const harness = createHarness(request => jsonResponse(request.url.endsWith('/enrollMerchantOffer')
        ? confirmation(request)
        : request.body.accountId ? listing([offer('offer-a', 'ENROLLED'), offer('new')])
            : listing([], ['card-a', 'card-b', 'card-c'].map(card))), { storage: previous.storage, responseDelay: 700 });
    harness.restoreWorkspace();
    harness.state.search = 'nothing visible';
    await harness.refreshAndAddOffers();
    assert.deepEqual(harness.requests.map(request => request.body), [
        {}, { accountId: 'card-a' }, { accountId: 'card-b' }, { accountId: 'card-c' },
        { accountId: 'card-a', offerId: 'new', oneClickEnroll: 'true' }
    ]);
    assert.deepEqual(Array.from(harness.state.selected), ['card-a']);
    assert.equal(harness.state.confirmed, 1);
    assert.equal(harness.maximumActive(), 1);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.equal(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt, 1000);
    }
});

test('zero cached available offers can still refresh and add new offers in one action', async () => {
    const previous = await savedWorkspace();
    previous.setCardSelected('removed', false);
    previous.state.offers.forEach(record => { record.status = 'ENROLLED'; });
    previous.saveWorkspace();
    const harness = createHarness(request => jsonResponse(request.url.endsWith('/enrollMerchantOffer')
        ? confirmation(request) : request.body.accountId ? listing([offer('new')])
            : listing([], [card('card-a')])), { storage: previous.storage });
    harness.restoreWorkspace();
    await harness.addSavedOffers();
    assert.equal(harness.requests.length, 0);
    await harness.refreshAndAddOffers();
    assert.equal(harness.requests.length, 3);
    assert.equal(harness.state.confirmed, 1);
});

test('refresh and add never writes after a partial refresh failure or a stop', async () => {
    for (const interrupted of [false, true]) {
        const previous = await savedWorkspace();
        previous.setCardSelected('removed', false);
        const harness = createHarness((request, access) => {
            if (request.body.accountId === 'card-b') {
                if (interrupted) access.stopRun();
                else return jsonResponse({}, 500);
            }
            return jsonResponse(request.body.accountId ? listing([offer('new')])
                : listing([], ['card-a', 'card-b'].map(card)));
        }, { storage: previous.storage });
        harness.restoreWorkspace();
        await harness.refreshAndAddOffers();
        assert.equal(harness.requests.length, 3);
        assert.ok(harness.requests.every(request => request.url.endsWith('/retrieve')));
        assert.equal(harness.state.needsScan, true);
        await harness.addSavedOffers();
        assert.equal(harness.requests.length, 3);
    }
});

test('refresh and add stops if any selected card disappeared, even when another selected card remains', async () => {
    const previous = await savedWorkspace();
    const harness = createHarness(() => jsonResponse(listing([], [card('card-a')])) , { storage: previous.storage });
    harness.restoreWorkspace();
    await harness.refreshAndAddOffers();
    assert.equal(harness.requests.length, 1);
    assert.match(harness.state.status, /do not match this login/);
});
