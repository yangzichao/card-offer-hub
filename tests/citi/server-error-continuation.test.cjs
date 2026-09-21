const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, offer, listing, confirmation, seedSavedOffers } = require('./helpers/userscript-harness.cjs');

const card = { accountId: 'card-a', displayProductName: 'Synthetic Card A' };
const cardListing = () => jsonResponse(listing([], [card]));
const writes = harness => harness.requests.filter(request => request.body.offerId);

test('isolated server errors are saved as unknown and the remaining offers continue serially', async () => {
    for (const status of [500, 502, 503, 504, 599]) {
        const harness = createHarness(request => request.url.endsWith('/retrieve') ? cardListing()
            : request.body.offerId === 'a' ? jsonResponse({}, status) : jsonResponse(confirmation(request)), { responseDelay: 3000 });
        seedSavedOffers(harness);
        await harness.addSavedOffers();
        assert.deepEqual(writes(harness).map(request => request.body.offerId), ['a', 'b']);
        assert.deepEqual(Array.from(harness.state.offers, record => record.status), ['UNCONFIRMED', 'ENROLLED']);
        assert.equal(harness.state.confirmed, 1);
        assert.equal(harness.state.completed, 2);
        assert.equal(harness.state.continuationBlocked, false);
        assert.equal(harness.maximumActive(), 1);
        assert.ok(writes(harness)[1].startedAt - writes(harness)[0].finishedAt >= 1000);
        assert.match(harness.state.status, /Finished: 1\/2/);
        assert.match(harness.state.status, /server errors for 1 offer/);
        const reloaded = createHarness(() => assert.fail('unknown write must never be replayed'), { storage: harness.storage });
        reloaded.restoreWorkspace();
        await reloaded.addSavedOffers();
        assert.equal(reloaded.requests.length, 0);
        assert.equal(reloaded.state.offers[0].status, 'UNCONFIRMED');
    }
});

test('three consecutive server errors preserve the unattempted queue for a later explicit click', async () => {
    const harness = createHarness(request => request.url.endsWith('/retrieve') ? cardListing() : jsonResponse({}, 500));
    seedSavedOffers(harness, ['card-a'], ['a', 'b', 'c', 'd', 'e'].map(id => offer(id)));
    await harness.addSavedOffers();
    assert.deepEqual(writes(harness).map(request => request.body.offerId), ['a', 'b', 'c']);
    assert.match(harness.state.status, /3 offers in a row.*HTTP 500.*2 not attempted/);
    assert.doesNotMatch(harness.state.status, /Sign in/);
    assert.equal(harness.canAddSavedOffers(), true);
    assert.deepEqual(Array.from(harness.state.offers, record => record.status), ['UNCONFIRMED', 'UNCONFIRMED', 'UNCONFIRMED', 'AVAILABLE', 'AVAILABLE']);
    const reloaded = createHarness(request => request.url.endsWith('/retrieve')
        ? jsonResponse(listing(['a', 'b', 'c', 'd', 'e'].map(id => offer(id)), [card])) : jsonResponse(confirmation(request)), { storage: harness.storage });
    reloaded.restoreWorkspace();
    reloaded.advance(60000);
    assert.equal(reloaded.requests.length, 0, 'no automatic restart');
    await reloaded.addSavedOffers();
    assert.deepEqual(writes(reloaded).map(request => request.body.offerId), ['d', 'e']);
    assert.match(reloaded.state.status, /Finished: 2\/2/);
});

test('a normal response resets the consecutive server-error limit even if enrollment is unconfirmed', async () => {
    const harness = createHarness(request => request.url.endsWith('/retrieve') ? cardListing()
        : jsonResponse({}, request.body.offerId === 'c' ? 200 : 500));
    seedSavedOffers(harness, ['card-a'], ['a', 'b', 'c', 'd', 'e', 'f'].map(id => offer(id)));
    await harness.addSavedOffers();
    assert.equal(writes(harness).length, 6);
    assert.match(harness.state.status, /Finished: 0\/6.*6 unconfirmed.*server errors for 5/);
});

test('Stop during a server-error response saves that unknown result and leaves the next offer available', async () => {
    const harness = createHarness((request, access) => {
        if (request.url.endsWith('/retrieve')) return cardListing();
        access.stopRun();
        return jsonResponse({}, 500);
    });
    seedSavedOffers(harness);
    await harness.addSavedOffers();
    assert.equal(writes(harness).length, 1);
    assert.match(harness.state.status, /Stopped/);
    assert.equal(harness.canAddSavedOffers(), true);
    assert.deepEqual(Array.from(harness.state.offers, record => record.status), ['UNCONFIRMED', 'AVAILABLE']);
});

test('failure saving a server-error result stops before sending the next offer', async () => {
    let serverErrorReturned = false;
    const harness = createHarness(request => {
        if (request.url.endsWith('/retrieve')) return cardListing();
        serverErrorReturned = true;
        return jsonResponse({}, 500);
    }, { onSave(key) {
        if (serverErrorReturned && key.endsWith(':workspace')) throw new Error('Synthetic checkpoint failure');
    } });
    seedSavedOffers(harness);
    await harness.addSavedOffers();
    assert.equal(writes(harness).length, 1);
    assert.match(harness.state.storageError, /Cannot save/);
    assert.equal(harness.state.offers[1].status, 'AVAILABLE');
});

test('HTTP metadata is structured and only authentication errors suggest signing in', async () => {
    for (const status of [400, 401, 403, 429, 500]) {
        const harness = createHarness(() => jsonResponse({}, status));
        await assert.rejects(harness.requestJson(harness.SETTINGS.retrievePath, {}), error => {
            assert.equal(error.name, 'HubHttpError');
            assert.equal(error.httpStatus, status);
            assert.equal(error.message.includes('Sign in'), [401, 403].includes(status));
            return true;
        });
    }
});
