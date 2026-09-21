const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, offer, listing, jsonResponse, acknowledgement, isActivation, successfulResponder } = require('./helpers/userscript-harness.cjs');

test('manual scan and selection; activation read-back after every write, serial response-based pacing', async () => {
    const harness = createHarness(successfulResponder(), { responseDelay: 2700 });
    assert.equal(harness.requests.length, 0);
    await harness.scanOffers();
    assert.equal(harness.state.selected.size, 0);
    harness.selectAllOffers();
    await harness.activateSelectedOffers();
    assert.equal(harness.requests.length, 6);
    assert.equal(harness.maximumActive(), 1);
    assert.equal(harness.state.confirmed, 2);
    assert.equal(harness.state.needsScan, true);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.equal(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt, 1000);
    }
    const storage = JSON.stringify([...harness.storage]);
    for (const secret of ['synthetic-customer', 'synthetic-token', 'synthetic-deals-session', 'synthetic-serve', 'serveToken']) assert.equal(storage.includes(secret), false);
});

test('only selected offers activate; refresh uses changed serving tokens', async () => {
    const respond = successfulResponder();
    let reads = 0;
    const harness = createHarness(request => {
        if (isActivation(request)) {
            assert.equal(request.body.variables.request.clientEvents[0].clientOfferId, 'b');
            assert.equal(request.body.variables.request.clientEvents[0].clientEventMetadata.serveToken, 'fresh-token');
            return respond(request);
        }
        if (++reads === 2) return jsonResponse(listing([offer('a'), offer('b', 'NEW', { adServeToken: 'fresh-token' })]));
        return respond(request);
    });
    await harness.scanOffers();
    harness.setOfferSelected('b', true);
    await harness.activateSelectedOffers();
    assert.equal(harness.state.confirmed, 1);
});

test('acknowledged but unchanged, missing, duplicate, or failed read-back stops all later writes', async () => {
    for (const readBack of [listing(), listing([]), listing([offer('a', 'ACTIVATED'), offer('a')]), { errors: [{ message: 'private' }] }]) {
        let written = false;
        const harness = createHarness(request => {
            if (isActivation(request)) { written = true; return jsonResponse(acknowledgement()); }
            return jsonResponse(written ? readBack : listing([offer('a'), offer('b')]));
        });
        await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
        assert.equal(harness.requests.filter(isActivation).length, 1);
        await harness.activateSelectedOffers();
        assert.equal(harness.requests.length, 4);
        assert.equal(harness.state.needsScan, true);
    }
});

test('HTTP errors, malformed response, and timeouts never replay a write or continue the queue', async () => {
    for (const response of [
        () => jsonResponse({}, 401), () => jsonResponse({}, 403), () => jsonResponse({}, 500),
        () => jsonResponse({ data: { getActivateOffer: {} } }),
        () => jsonResponse({ ...acknowledgement(), errors: [{ message: 'sensitive' }] }),
        () => { const error = new Error(); error.name = 'AbortError'; throw error; },
        () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '<html>login</html>' })
    ]) {
        const harness = createHarness(request => isActivation(request) ? response() : jsonResponse(listing([offer('a'), offer('b')])));
        await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
        assert.equal(harness.requests.length, 3);
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.state.needsScan, true);
    }
});

test('429 persists across reload, honors Retry-After, never shortens cooldown', async () => {
    const harness = createHarness(() => jsonResponse({}, 429, '600'));
    await harness.scanOffers();
    const reloaded = createHarness(() => { throw new Error('must not send'); }, { storage: harness.storage });
    await reloaded.scanOffers();
    assert.equal(reloaded.requests.length, 0);
    assert.equal(reloaded.state.cooldownUntil, harness.state.cooldownUntil);
    assert.match(reloaded.state.status, /Rate limited/);
    const longer = createHarness((request, access) => {
        access.state.cooldownUntil = access.state.nextRequestAt + 900000;
        return jsonResponse({}, 429, '1');
    });
    await longer.scanOffers();
    const cooldown = longer.state.cooldownUntil;
    longer.storage.set('usbank-offer-lite:pacing', { schemaVersion: 1, cooldownUntil: 1, nextRequestAt: 1 });
    longer.restorePacing();
    assert.equal(longer.state.cooldownUntil, cooldown);
    assert.equal(longer.retryAfterMilliseconds('Thu, 01 Jan 1970 00:00:00 GMT'), 0);
    assert.equal(longer.retryAfterMilliseconds('invalid'), 300000);
});

test('stop while write is in flight leaves unconfirmed state and sends no verification or next write', async () => {
    const harness = createHarness((request, access) => {
        if (isActivation(request)) { access.stopRun(); return jsonResponse(acknowledgement()); }
        return jsonResponse(listing([offer('a'), offer('b')]));
    });
    await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
    assert.equal(harness.requests.length, 3);
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
});

test('stop during pacing and duplicate clicks cannot launch overlapping runs', async () => {
    const harness = createHarness(successfulResponder(), { onWait: access => access.stopRun() });
    await harness.scanOffers(); harness.selectAllOffers();
    const first = harness.activateSelectedOffers();
    await harness.activateSelectedOffers(); await first;
    assert.equal(harness.requests.length, 1);
    assert.match(harness.state.status, /Stopped/);
});

test('storage errors, unsupported schema, unavailable tab lock, and missing session block requests', async () => {
    for (const options of [
        { failStorage: true }, { locked: true }, { session: {} },
        { storage: new Map([['usbank-offer-lite:pacing', { schemaVersion: 2 }]]) }
    ]) {
        const harness = createHarness(successfulResponder(), options);
        await harness.scanOffers();
        assert.equal(harness.requests.length, 0);
        assert.equal(harness.state.needsScan, true);
    }
});

test('session switch during pacing blocks activation; departing deals page also blocks', async () => {
    let changeSession = false;
    const harness = createHarness(successfulResponder(), { onWait: () => {
        if (changeSession) harness.context.sessionStorage.getItem = () => null;
    } });
    await harness.scanOffers(); harness.selectAllOffers(); changeSession = true;
    await harness.activateSelectedOffers();
    assert.equal(harness.requests.length, 1);
    const departed = createHarness(successfulResponder());
    departed.context.location.pathname = '/login';
    await departed.scanOffers();
    assert.equal(departed.requests.length, 0);
});

test('fresh scan unlocks after an error; already activated offers and removed offers are never written', async () => {
    for (const nextList of [listing([offer('a', 'ACTIVATED')]), listing([])]) {
        let calls = 0;
        const harness = createHarness(() => jsonResponse(++calls === 1 ? listing() : nextList));
        await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
        assert.equal(harness.requests.filter(isActivation).length, 0);
        await harness.scanOffers();
        assert.equal(harness.state.needsScan, false);
        assert.equal(harness.state.selected.size, 0);
    }
});
