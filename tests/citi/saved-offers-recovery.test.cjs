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

test('Stop preserves the unconfirmed item but lets the user continue remaining offers', async () => {
    let first = true;
    const harness = createHarness((request, access) => {
        if (request.url.endsWith('/retrieve')) return jsonResponse(listing([], cards));
        if (first) { first = false; access.stopRun(); return jsonResponse({}); }
        return jsonResponse(confirmation(request));
    });
    seedSavedOffers(harness);
    await harness.addSavedOffers();
    assert.equal(harness.canAddSavedOffers(), true);
    assert.match(harness.state.status, /Stopped/);
    assert.equal(harness.requests.length, 2);
    await harness.addSavedOffers();
    assert.deepEqual(harness.requests.filter(request => request.body.offerId).map(request => request.body.offerId), ['a', 'b']);
    assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
});

test('transport failures require verification on the next explicit click, without disabling it', async () => {
    const harness = createHarness(request => request.url.endsWith('/retrieve')
        ? jsonResponse(listing([], cards)) : jsonResponse({}, 500));
    seedSavedOffers(harness);
    await harness.addSavedOffers();
    assert.equal(harness.canAddSavedOffers(), true);
    const restored = createHarness(() => { throw new Error('no requests'); }, { storage: harness.storage });
    restored.restoreWorkspace();
    assert.equal(restored.canAddSavedOffers(), true);
    assert.equal(restored.requests.length, 0, 'reloading never automatically resumes');
});

test('conflicting offers are skipped and an incomplete scan does not permanently disable recovery', async () => {
    const harness = createHarness(request => jsonResponse(request.url.endsWith('/retrieve')
        ? listing([], cards) : confirmation(request)));
    seedSavedOffers(harness);
    harness.state.offers[0].status = 'CONFLICT';
    assert.equal(harness.savedOffersBlockReason(), '');
    await harness.addSavedOffers();
    assert.deepEqual(harness.requests.filter(request => request.body.offerId).map(request => request.body.offerId), ['b']);
    harness.state.lastScanAt = 0;
    assert.equal(harness.canAddSavedOffers(), true);
});

test('Stop during refresh-and-add also leaves completed scans ready to continue', async () => {
    const harness = createHarness((request, access) => {
        if (request.url.endsWith('/retrieve')) return jsonResponse(listing(undefined, cards));
        access.stopRun();
        return jsonResponse(confirmation(request));
    });
    seedSavedOffers(harness);
    await harness.refreshAndAddOffers();
    assert.equal(harness.canAddSavedOffers(), true);
    assert.equal(harness.state.needsScan, false);
    assert.match(harness.state.status, /Stopped/);
});

test('upgrading a legacy cache with one unknown result can add all 225 remaining offers', async () => {
    const { offer } = require('./helpers/userscript-harness.cjs');
    const first = createHarness(() => { throw new Error('no request while seeding'); });
    seedSavedOffers(first, ['card-a'], Array.from({ length: 226 }, (_, index) => offer(String(index))));
    first.markWorkspaceOfferPending(first.state.offers[0]);
    const key = 'citi-offer-lite:workspace';
    const legacy = structuredClone(first.storage.get(key));
    legacy.schemaVersion = 2;
    delete legacy.selectionInitialized;
    delete legacy.continuationBlocked;
    first.storage.set(key, legacy);
    const next = createHarness(request => jsonResponse(request.url.endsWith('/retrieve')
        ? listing([], cards) : confirmation(request)), { storage: first.storage });
    next.restoreWorkspace();
    assert.equal(next.canAddSavedOffers(), true);
    assert.equal(next.requests.length, 0);
    await next.addSavedOffers();
    const writes = next.requests.filter(request => request.body.offerId);
    assert.equal(writes.length, 225);
    assert.equal(new Set(writes.map(request => request.body.offerId)).size, 225);
    assert.ok(writes.every(request => request.body.offerId !== '0'));
    assert.equal(next.state.confirmed, 225);
    assert.equal(next.state.offers[0].status, 'UNCONFIRMED');
});
