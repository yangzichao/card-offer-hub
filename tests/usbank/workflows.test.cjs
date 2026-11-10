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
    assert.equal(harness.state.needsScan, false, 'every offer was refreshed, so Add can run again');
    assert.match(harness.state.status, /Finished: 2 of 2 added\./);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.equal(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt, 1000);
    }
    const storage = JSON.stringify([...harness.storage]);
    for (const secret of ['synthetic-customer', 'synthetic-token', 'synthetic-access-token', 'synthetic-deals-session', 'synthetic-serve', 'serveToken']) assert.equal(storage.includes(secret), false);
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

// a is 10% back, b is 1% back, c states no reward and stays unknown.
function rewardResponder() {
    const base = { activationModel: 'ACTIVATABLE', purchaseRequirement: { merchantUrlLinkClickRequired: false, minSpendAmount: 0.2 }, rewardType: 'PERCENT_AMOUNT_PURCHASE' };
    const rewards = { a: { ...base, rewardAmount: 10 }, b: { ...base, rewardAmount: 1 } };
    const activated = new Set();
    return request => {
        if (isActivation(request)) {
            activated.add(request.body.variables.request.clientEvents[0].clientOfferId);
            return jsonResponse(acknowledgement());
        }
        return jsonResponse(listing(['a', 'b', 'c'].map(id => offer(id, activated.has(id) ? 'ACTIVATED' : 'NEW', rewards[id] ? { reward: rewards[id] } : {}))));
    };
}
const activatedIds = harness => harness.requests.filter(isActivation).map(request => request.body.variables.request.clientEvents[0].clientOfferId);

test('Select all and both Add actions skip offers the small-offer filter hides; clearing it adds them next', async () => {
    const harness = createHarness(rewardResponder());
    await harness.scanOffers();
    harness.selectAllOffers();
    assert.deepEqual([...harness.state.selected].sort(), ['a', 'b', 'c']);
    harness.state.rewardFilter = { minRate: 5, minTotal: 0 };
    await harness.activateSelectedOffers();
    assert.deepEqual(activatedIds(harness), ['a', 'c'], 'a selected offer hidden later is skipped; unknown c is kept');
    harness.state.selected.clear();
    harness.selectAllOffers();
    assert.deepEqual([...harness.state.selected], [], 'Select all leaves the hidden offer out');
    await harness.addAllOffers();
    assert.deepEqual(activatedIds(harness), ['a', 'c'], 'nothing visible is left to add');
    harness.state.rewardFilter = { minRate: 0, minTotal: 0 };
    await harness.addAllOffers();
    assert.deepEqual(activatedIds(harness), ['a', 'c', 'b']);
});

test('an unchanged read-back re-sends once, then the run moves on to the next offer', async () => {
    const harness = createHarness(request => jsonResponse(isActivation(request) ? acknowledgement() : listing([offer('a'), offer('b')])));
    await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
    assert.deepEqual(harness.requests.filter(isActivation).map(request => request.body.variables.request.clientEvents[0].clientOfferId), ['a', 'a', 'b', 'b']);
    assert.equal(harness.state.confirmed, 0);
    assert.match(harness.state.status, /Finished: 0 of 2 added\. 2 not added after a retry; Add tries them again\. Not added: Example a, Example b\./);
    assert.deepEqual(Array.from(harness.state.offers, item => item.status), ['AVAILABLE', 'AVAILABLE']);
    assert.equal(harness.state.needsScan, false);
});

test('one offer that fails is retried once while the others are added', async () => {
    const respond = successfulResponder(['a', 'b', 'c']);
    const harness = createHarness(request => {
        if (isActivation(request) && request.body.variables.request.clientEvents[0].clientOfferId === 'b') return jsonResponse({}, 500);
        return respond(request);
    });
    await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
    assert.deepEqual(harness.requests.filter(isActivation).map(request => request.body.variables.request.clientEvents[0].clientOfferId), ['a', 'b', 'b', 'c']);
    assert.equal(harness.state.confirmed, 2);
    assert.deepEqual(Array.from(harness.state.offers, item => item.status), ['ACTIVATED', 'AVAILABLE', 'ACTIVATED']);
    assert.match(harness.state.status, /Finished: 2 of 3 added\..*Not added: Example b\./);
    assert.equal(harness.state.storageError, '');
});

test('three failing offers in a row pause the run with the rest untouched', async () => {
    const harness = createHarness(request => jsonResponse(isActivation(request) ? acknowledgement()
        : listing(['a', 'b', 'c', 'd'].map(id => offer(id)))));
    await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
    const sent = new Set(harness.requests.filter(isActivation).map(request => request.body.variables.request.clientEvents[0].clientOfferId));
    assert.deepEqual([...sent], ['a', 'b', 'c']);
    assert.match(harness.state.status, /^Paused: 3 offers in a row could not be added.* 1 not tried yet\./);
    assert.equal(harness.state.needsScan, false);
});

test('a missing, duplicate or failed read-back after a write is never treated as success', async () => {
    const cases = [
        // Offer a vanished after its write: unverified, and the run goes on to b.
        { readBack: listing([offer('b')]), writes: 3, ended: false },
        // The read-back lists a twice: unverified; b is gone, so nothing else is sent.
        { readBack: listing([offer('a', 'ACTIVATED'), offer('a')]), writes: 1, ended: false },
        // The read itself fails: the run ends.
        { readBack: { errors: [{ message: 'private' }] }, writes: 1, ended: true }
    ];
    for (const { readBack, writes, ended } of cases) {
        let written = false;
        const harness = createHarness(request => {
            if (isActivation(request)) { written = true; return jsonResponse(acknowledgement()); }
            return jsonResponse(written ? readBack : listing([offer('a'), offer('b')]));
        });
        await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.requests.filter(isActivation).length, writes);
        assert.equal(harness.state.needsScan, ended);
        if (ended) assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
        else assert.match(harness.state.status, /could not be verified; scan to check them/);
        if (writes === 1 && !ended) assert.equal(harness.state.offers.find(item => item.offerId === 'a').status, 'UNCONFIRMED');
        const count = harness.requests.length;
        await harness.activateSelectedOffers();
        const sentA = harness.requests.filter(request => isActivation(request) && request.body.variables.request.clientEvents[0].clientOfferId === 'a');
        assert.equal(sentA.length, 1, 'an unverified offer is never re-sent by the next click');
        if (ended) assert.equal(harness.requests.length, count);
    }
});

test('sign-in errors and login pages end the run after one write', async () => {
    for (const response of [
        () => jsonResponse({}, 401), () => jsonResponse({}, 403),
        () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '<html>login</html>' })
    ]) {
        const harness = createHarness(request => isActivation(request) ? response() : jsonResponse(listing([offer('a'), offer('b')])));
        await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
        assert.equal(harness.requests.length, 3);
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.state.offers[0].status, 'UNCONFIRMED');
        assert.equal(harness.state.needsScan, true);
    }
});

test('one offer\'s server error, GraphQL error, missing acknowledgement or timeout is checked, re-sent once, then skipped', async () => {
    for (const response of [
        () => jsonResponse({}, 500), () => jsonResponse({ data: { getActivateOffer: {} } }),
        () => jsonResponse({ ...acknowledgement(), errors: [{ message: 'sensitive' }] }),
        () => { const error = new Error(); error.name = 'AbortError'; throw error; }
    ]) {
        const harness = createHarness(request => isActivation(request) ? response() : jsonResponse(listing([offer('a'), offer('b')])));
        await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
        // scan, refresh, then write → read → write → read for each of the two offers.
        assert.equal(harness.requests.length, 10);
        assert.equal(harness.state.confirmed, 0);
        assert.match(harness.state.status, /Finished: 0 of 2 added\. 2 not added after a retry/);
        assert.doesNotMatch(harness.state.status, /sensitive/);
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
        { failStorage: true }, { locked: true }, { session: {} }, { accessToken: null },
        { storage: new Map([['usbank-offer-lite:pacing', { schemaVersion: 2 }]]) }
    ]) {
        const harness = createHarness(successfulResponder(), options);
        await harness.scanOffers();
        assert.equal(harness.requests.length, 0);
        assert.equal(harness.state.needsScan, true);
    }
});

test('a missing sign-in token stops the scan before any request and says why', async () => {
    const harness = createHarness(successfulResponder(), { accessToken: null });
    await harness.scanOffers();
    assert.equal(harness.requests.length, 0);
    assert.match(harness.state.status, /sign-in token is unavailable/);
});

test('each request reads the page’s current Bearer token, so a token refreshed mid-run keeps working', async () => {
    let tokenVersion = 0;
    const harness = createHarness(successfulResponder(), { onWait: () => { tokenVersion++; } });
    const readPageStorage = harness.context.sessionStorage.getItem;
    harness.context.sessionStorage.getItem = key => key === 'AccessToken' ? `synthetic-access-token-${tokenVersion}` : readPageStorage(key);
    await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
    assert.equal(harness.state.confirmed, 2);
    const sentAuthorization = Array.from(harness.requests, request => request.headers.authorization);
    assert.equal(sentAuthorization.length, 6);
    assert.ok(sentAuthorization.every(value => /^Bearer synthetic-access-token-\d+$/.test(value)));
    assert.ok(new Set(sentAuthorization).size > 1);
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
