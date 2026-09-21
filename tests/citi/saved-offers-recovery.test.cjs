const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, listing, confirmation, seedSavedOffers } = require('./helpers/userscript-harness.cjs');

const cards = [{ accountId: 'card-a', displayProductName: 'Synthetic Card A' }];

test('stop while waiting to send an enrollment preserves AVAILABLE in memory and storage', async () => {
    let shouldStop = true;
    const harness = createHarness(request => jsonResponse(request.url.endsWith('/retrieve')
        ? listing([], cards) : confirmation(request)), {
        onWait: access => { if (shouldStop) access.stopRun(); }
    });
    seedSavedOffers(harness);
    await harness.addSavedOffers();
    assert.equal(harness.requests.length, 1, 'only the ownership check was sent');
    assert.deepEqual(Array.from(harness.state.offers, offer => offer.status), ['AVAILABLE', 'AVAILABLE']);
    assert.equal(harness.canAddSavedOffers(), true);
    const restored = createHarness(() => { throw new Error('no startup requests'); }, { storage: harness.storage });
    restored.restoreWorkspace();
    assert.equal(restored.canAddSavedOffers(), true);
    assert.deepEqual(Array.from(restored.state.offers, offer => offer.status), ['AVAILABLE', 'AVAILABLE']);
    shouldStop = false;
    await harness.addSavedOffers();
    assert.deepEqual(harness.requests.map(request => request.body), [
        {}, {}, { accountId: 'card-a', offerId: 'a', oneClickEnroll: 'true' },
        { accountId: 'card-a', offerId: 'b', oneClickEnroll: 'true' }
    ]);
});

test('manual continuation after stopping a confirmed write skips the completed offer', async () => {
    let shouldStop = true;
    const harness = createHarness((request, access) => {
        if (request.url.endsWith('/retrieve')) return jsonResponse(listing([], cards));
        if (shouldStop) access.stopRun();
        return jsonResponse(confirmation(request));
    });
    seedSavedOffers(harness);
    await harness.addSavedOffers();
    assert.equal(harness.canAddSavedOffers(), true);
    shouldStop = false;
    await harness.addSavedOffers();
    assert.deepEqual(harness.requests.map(request => request.body), [
        {}, { accountId: 'card-a', offerId: 'a', oneClickEnroll: 'true' },
        {}, { accountId: 'card-a', offerId: 'b', oneClickEnroll: 'true' }
    ]);
});

test('stop does not unlock an in-flight enrollment whose response is unconfirmed or fails', async () => {
    for (const status of [200, 500]) {
        const harness = createHarness((request, access) => {
            if (request.url.endsWith('/retrieve')) return jsonResponse(listing([], cards));
            access.stopRun();
            return jsonResponse({}, status);
        });
        seedSavedOffers(harness);
        await harness.addSavedOffers();
        assert.equal(harness.canAddSavedOffers(), false);
        assert.match(harness.savedOffersBlockReason(), /1 saved offer\(s\) have an unconfirmed add result/);
        await harness.addSavedOffers();
        assert.equal(harness.requests.length, 2);
    }
});

test('saved-offer blockers explain conflicting data and an incomplete first scan separately', () => {
    const harness = createHarness(() => { throw new Error('no requests'); });
    seedSavedOffers(harness);
    harness.state.offers[0].status = 'CONFLICT';
    assert.match(harness.savedOffersBlockReason(), /conflicting statuses for 1 saved offer/);
    harness.state.offers[0].status = 'AVAILABLE';
    harness.state.lastScanAt = 0;
    assert.match(harness.savedOffersBlockReason(), /first offer refresh did not finish/);
    assert.equal(harness.canAddSavedOffers(), false);
});
