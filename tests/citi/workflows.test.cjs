const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, offer, listing, confirmation, selectCards } = require('./helpers/userscript-harness.cjs');

test('discovery is manual, never auto-selects cards or assigns default-card offers', async () => {
    const harness = createHarness(() => jsonResponse(listing([offer('default-only')], [{ accountId: 'a', displayProductName: 'Example Card' }])));
    assert.equal(harness.requests.length, 0);
    await harness.detectCards();
    assert.equal(harness.state.accounts.length, 1);
    assert.equal(harness.state.selected.size, 0);
    assert.equal(harness.state.offers.length, 0);
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 1);
});

test('one click scans selected cards and serially enrolls the same offer on each card', async () => {
    const harness = createHarness(request => jsonResponse(request.url.endsWith('/retrieve')
        ? listing([offer('a'), offer('already', 'ENROLLED'), offer('a')]) : confirmation(request)), { responseDelay: 4000 });
    selectCards(harness, ['card-a', 'card-b', 'excluded']);
    harness.setCardSelected('excluded', false);
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 4);
    assert.equal(harness.state.confirmed, 2);
    assert.equal(harness.maximumActive(), 1);
    assert.deepEqual(harness.requests.map(request => request.body.accountId), ['card-a', 'card-b', 'card-a', 'card-b']);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.equal(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt, 500);
    }
    assert.match(harness.state.status, /Finished: 2\/2/);
    const stored = JSON.stringify([...harness.storage]);
    for (const forbidden of ['card-a', 'offerId', 'synthetic-session', 'synthetic-client']) assert.equal(stored.includes(forbidden), false);
});

test('unconfirmed enrollment stops the queue; only a new scan unlocks adding', async () => {
    const harness = createHarness(request => jsonResponse(request.url.endsWith('/retrieve') ? listing([offer('a'), offer('b')]) : {}));
    selectCards(harness);
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 2);
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
    assert.equal(harness.state.needsScan, true);
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 2);
    await harness.scanOffers();
    assert.equal(harness.state.needsScan, false);
    assert.equal(harness.requests.length, 3);
});

test('429 cooldown persists across reload and does not retry', async () => {
    const harness = createHarness(() => jsonResponse({}, 429, '600'));
    await harness.detectCards();
    const cooldown = harness.state.cooldownUntil;
    assert.equal(harness.requests.length, 1);
    const reloaded = createHarness(() => { throw new Error('must not fetch'); }, { storage: harness.storage });
    await reloaded.detectCards();
    assert.equal(reloaded.requests.length, 0);
    assert.equal(reloaded.state.cooldownUntil, cooldown);
    assert.match(reloaded.state.status, /Rate limited/);
});

test('HTTP/auth failures halt without replaying enrollments', async () => {
    for (const status of [401, 403, 500]) {
        const harness = createHarness(request => request.url.endsWith('/retrieve') ? jsonResponse(listing()) : jsonResponse({}, status));
        selectCards(harness);
        await harness.addAllOffers();
        assert.equal(harness.requests.length, 2);
        assert.equal(harness.state.needsScan, true);
        assert.match(harness.state.status, new RegExp(`HTTP ${status}`));
    }
});

test('stopping while a write is in flight records confirmation but sends no next write', async () => {
    const harness = createHarness((request, access) => {
        if (request.url.endsWith('/retrieve')) return jsonResponse(listing([offer('a'), offer('b')]));
        access.stopRun();
        return jsonResponse(confirmation(request));
    });
    selectCards(harness);
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 2);
    assert.equal(harness.state.confirmed, 1);
    assert.equal(harness.state.offers[0].status, 'ENROLLED');
    assert.equal(harness.state.needsScan, true);
});

test('stop during pacing prevents the next request and concurrent clicks cannot start a second queue', async () => {
    const harness = createHarness(() => jsonResponse(listing()), { onWait: access => access.stopRun() });
    selectCards(harness, ['a', 'b']);
    const firstRun = harness.addAllOffers();
    await harness.addAllOffers();
    await firstRun;
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.maximumActive(), 1);
    assert.match(harness.state.status, /Stopped/);
});

test('storage failure and another tab lock both block further requests', async () => {
    const harness = createHarness(() => jsonResponse(listing()), { failStorage: true });
    selectCards(harness, ['a', 'b']);
    await harness.scanOffers();
    assert.equal(harness.requests.length, 0, 'failed pacing checkpoint must prevent even the first request');
    assert.match(harness.state.storageError, /Cannot save/);
    const locked = createHarness(() => jsonResponse(listing()), { locked: true });
    await locked.detectCards();
    assert.equal(locked.requests.length, 0);
    assert.match(locked.state.status, /another tab/);
});

test('cooldown never gets shortened by restore or a shorter Retry-After', async () => {
    const harness = createHarness((request, access) => {
        access.state.cooldownUntil = access.state.nextRequestAt + 900000;
        return jsonResponse({}, 429, '1');
    });
    await harness.detectCards();
    const longerCooldown = harness.state.cooldownUntil;
    harness.storage.set('citi-offer-lite:pacing', { schemaVersion: 1, cooldownUntil: 1, nextRequestAt: 1 });
    harness.restorePacing();
    assert.equal(harness.state.cooldownUntil, longerCooldown);
});

test('timeout and malformed JSON never confirm or automatically retry', async () => {
    for (const fail of [
        () => { const error = new Error('synthetic timeout'); error.name = 'AbortError'; throw error; },
        () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => '<html>Sign in</html>' })
    ]) {
        const harness = createHarness(request => request.url.endsWith('/retrieve') ? jsonResponse(listing()) : fail());
        selectCards(harness);
        await harness.addAllOffers();
        assert.equal(harness.requests.length, 2);
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.state.needsScan, true);
    }
});
