const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, seedSavedOffers, jsonResponse, listing, offer, confirmation } = require('./helpers/userscript-harness.cjs');
const savedName = 'Synthetic Card - 1234';
function previousWorkspace() {
    const harness = createHarness(() => { throw new Error('no startup requests'); });
    seedSavedOffers(harness);
    harness.state.accounts[0].name = savedName;
    harness.saveWorkspace();
    return harness;
}
function createCurrent(previous, options = {}) {
    return createHarness(request => {
        if (request.url.endsWith('/enrollMerchantOffer')) return jsonResponse(confirmation(request));
        if (request.body.accountId) return jsonResponse(listing(options.offers || [offer('a'), offer('b')]));
        return jsonResponse(listing([], options.cards || [{ accountId: 'new-id', displayProductName: savedName }]));
    }, { storage: previous.storage });
}
test('one saved-offers click reconciles a changed card ID and verifies fresh offers before adding', async () => {
    const previous = previousWorkspace();
    const next = createCurrent(previous, { offers: [offer('a', 'ENROLLED'), offer('b'), offer('new-only')] });
    next.restoreWorkspace();
    assert.equal(next.canAddSavedOffers(), true);
    assert.equal(next.requests.length, 0);
    await next.addSavedOffers();
    assert.deepEqual(next.requests.map(request => request.body), [
        {}, { accountId: 'new-id' }, { accountId: 'new-id', offerId: 'b', oneClickEnroll: 'true' }
    ]);
    assert.equal(next.state.confirmed, 1);
    assert.deepEqual(Array.from(next.state.offers, record => record.accountId), ['new-id', 'new-id']);
    assert.equal(next.state.lastScanAt, previous.state.lastScanAt, 'saved continuation keeps its scan timestamp');
});
test('a saved prior failure stays clickable and verifies current offers within that one click', async () => {
    const previous = previousWorkspace();
    previous.state.continuationBlocked = true;
    previous.state.offers[0].status = 'UNCONFIRMED';
    previous.saveWorkspace();
    const next = createCurrent(previous, { cards: [{ accountId: 'card-a', displayProductName: savedName }] });
    next.restoreWorkspace();
    assert.equal(next.canAddSavedOffers(), true);
    await next.addSavedOffers();
    assert.deepEqual(next.requests.map(request => request.body), [
        {}, { accountId: 'card-a' }, { accountId: 'card-a', offerId: 'b', oneClickEnroll: 'true' }
    ]);
    assert.equal(next.state.offers[0].status, 'UNCONFIRMED', 'an uncertain write never gets replayed by recovery');
    assert.equal(next.state.continuationBlocked, false);
});
test('unmatched, ambiguous, or suffix-free card identities preserve cache and send no write', async () => {
    for (const cards of [
        [{ accountId: 'new-id', displayProductName: 'Other Card - 9876' }],
        [{ accountId: 'one', displayProductName: savedName }, { accountId: 'two', displayProductName: savedName }],
        [{ accountId: 'new-id', displayProductName: 'Synthetic Card' }]
    ]) {
        const previous = previousWorkspace();
        if (cards[0].displayProductName === 'Synthetic Card') { previous.state.accounts[0].name = 'Synthetic Card'; previous.saveWorkspace(); }
        const saved = structuredClone(previous.storage.get('citi-offer-lite:workspace'));
        const next = createCurrent(previous, { cards }); next.restoreWorkspace();
        await next.addSavedOffers();
        assert.equal(next.requests.length, 1);
        assert.match(next.state.status, /saved offers were kept/i);
        const after = next.storage.get('citi-offer-lite:workspace');
        assert.deepEqual(after.accounts, saved.accounts);
        assert.deepEqual(after.offers, saved.offers);
        assert.deepEqual(after.selected, saved.selected);
    }
});
test('full refresh establishes current cards even when every saved ID is obsolete', async () => {
    const previous = previousWorkspace();
    const next = createCurrent(previous, { cards: [{ accountId: 'current-card', displayProductName: 'Current Card - 9876' }] });
    next.restoreWorkspace();
    await next.refreshAndAddOffers();
    assert.deepEqual(next.requests.map(request => request.body.accountId), [undefined, 'current-card', 'current-card', 'current-card']);
    assert.equal(next.state.confirmed, 2);
});
test('a failed full refresh after ID changes preserves the complete previous cache', async () => {
    const previous = previousWorkspace();
    const saved = structuredClone(previous.storage.get('citi-offer-lite:workspace'));
    const next = createHarness(request => request.body.accountId ? jsonResponse({}, 500)
        : jsonResponse(listing([], [{ accountId: 'new-id', displayProductName: savedName }])), { storage: previous.storage });
    next.restoreWorkspace(); await next.refreshAndAddOffers();
    const after = next.storage.get('citi-offer-lite:workspace');
    assert.deepEqual(after.accounts, saved.accounts);
    assert.deepEqual(after.offers, saved.offers);
    assert.deepEqual(after.selected, saved.selected);
    assert.equal(after.lastScanAt, saved.lastScanAt);
    assert.equal(next.requests.length, 2);
});
test('card-ID reconciliation preserves explicit opt-outs during a full refresh', async () => {
    const previous = previousWorkspace();
    previous.state.accounts.push({ accountId: 'old-opted-out', name: 'Other Card - 4321' });
    previous.saveWorkspace();
    const next = createCurrent(previous, { cards: [
        { accountId: 'new-id', displayProductName: savedName },
        { accountId: 'new-opted-out', displayProductName: 'Other Card - 4321' }
    ] });
    next.restoreWorkspace(); await next.refreshAndAddOffers();
    assert.deepEqual(Array.from(next.state.selected), ['new-id']);
    assert.ok(next.requests.filter(request => request.body.offerId).every(request => request.body.accountId === 'new-id'));
});
