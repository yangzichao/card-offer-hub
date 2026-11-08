const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, isClip, requestOffset } = require('./helpers/userscript-harness.cjs');
const { coupon, couponPage, clipResponse } = require('./fixtures/coupons.cjs');

function couponIds(count, start = 1000001) {
    return Array.from({ length: count }, (_, index) => String(start + index));
}
// Serves unclipped pages by offset and confirms each clip, like the live contract.
function storeResponder(coupons, { clip = body => clipResponse([`90000${body.couponId}`]) } = {}) {
    return request => {
        if (isClip(request)) return jsonResponse(clip(request.body));
        const offset = requestOffset(request);
        const page = coupons.slice(offset, offset + 72);
        return jsonResponse(couponPage(page, offset + page.length < coupons.length, offset));
    };
}

test('one click reads every page, then clips each available coupon serially with confirmed counts', async () => {
    const coupons = [...couponIds(75).map(id => coupon(id)),
        coupon('2000001', { addedToCard: true }), coupon('2000002', { canBeAddedToCard: false })];
    const h = createHarness(storeResponder(coupons));
    assert.equal(h.requests.length, 0, 'nothing runs before a click');
    await h.clipAllKrogerCoupons();
    const reads = h.requests.filter(request => !isClip(request));
    assert.deepEqual(reads.map(requestOffset), [0, 72], 'offsets advance by returned records');
    const clips = h.requests.filter(isClip);
    assert.deepEqual(clips.map(request => request.body.couponId), couponIds(75));
    assert.deepEqual(JSON.parse(JSON.stringify(clips[0].body)), { action: 'CLIP', couponId: '1000001' });
    assert.equal(clips[0].headers['Content-Type'], 'application/json');
    assert.equal(clips[0].headers['x-kroger-channel'], 'WEB');
    assert.equal(h.maximumActive(), 1, 'one request in flight');
    for (let index = 1; index < h.requests.length; index++) {
        assert.ok(h.requests[index].startedAt >= h.requests[index - 1].finishedAt + h.SETTINGS.gapMilliseconds, 'gap starts after the last response');
    }
    assert.equal(h.state.confirmed, 75);
    assert.equal(h.state.total, 75);
    assert.equal(h.state.offers.filter(offer => offer.status === 'ACTIVATED').length, 76);
    assert.equal(h.state.offers.find(offer => offer.offerId === '2000002').status, 'UNAVAILABLE');
    assert.match(h.state.status, /all 75 coupons clipped/);
});

test('an unconfirmed clip is recorded and skipped; three in a row pause with the rest unsent', async () => {
    const ids = couponIds(6);
    const unconfirmed = new Set(['1000002']);
    let h = createHarness(storeResponder(ids.map(id => coupon(id)),
        { clip: body => unconfirmed.has(body.couponId) ? clipResponse([]) : clipResponse([`90000${body.couponId}`]) }));
    await h.clipAllKrogerCoupons();
    assert.equal(h.requests.filter(isClip).length, 6, 'one unconfirmed clip does not stop the run or retry');
    assert.equal(h.state.offers.find(offer => offer.offerId === '1000002').status, 'UNCONFIRMED');
    assert.equal(h.state.confirmed, 5);
    assert.match(h.state.status, /5 of 6 clipped\. 1 not confirmed/);

    for (const id of ['1000002', '1000003', '1000004']) unconfirmed.add(id);
    h = createHarness(storeResponder(ids.map(id => coupon(id)),
        { clip: body => unconfirmed.has(body.couponId) ? { data: { modifiedCoupons: null } } : clipResponse([`90000${body.couponId}`]) }));
    await h.clipAllKrogerCoupons();
    assert.deepEqual(h.requests.filter(isClip).map(request => request.body.couponId), ['1000001', '1000002', '1000003', '1000004']);
    assert.match(h.state.status, /did not confirm 3 clips in a row\. 1 clipped, 2 not sent/);
    assert.equal(h.state.needsScan, true);
});

test('one coupon\'s HTTP error or dropped request is recorded and the run continues', async () => {
    for (const failure of [() => jsonResponse({ errors: [] }, 400), () => jsonResponse({}, 500), () => { throw new TypeError('Failed to fetch'); }]) {
        const coupons = couponIds(3).map(id => coupon(id));
        const responder = storeResponder(coupons);
        const h = createHarness(request => isClip(request) && request.body.couponId === '1000002' ? failure() : responder(request));
        await h.clipAllKrogerCoupons();
        assert.deepEqual(h.requests.filter(isClip).map(request => request.body.couponId), ['1000001', '1000002', '1000003']);
        assert.match(h.state.status, /Finished: 2 of 3 clipped\. 1 not confirmed; Clip all coupons checks them again next time\./);
        assert.equal(h.state.offers.find(offer => offer.offerId === '1000002').status, 'UNCONFIRMED');
        assert.equal(h.state.offers.find(offer => offer.offerId === '1000003').status, 'ACTIVATED');
    }
});

test('sign-in errors and rate limits stop the run without retrying', async () => {
    for (const [failure, message] of [
        [() => jsonResponse({}, 401), /HTTP 401/],
        [() => jsonResponse({}, 429, '120'), /HTTP 429/]
    ]) {
        const coupons = couponIds(3).map(id => coupon(id));
        const responder = storeResponder(coupons);
        const h = createHarness(request => isClip(request) && request.body.couponId === '1000002' ? failure() : responder(request));
        await h.clipAllKrogerCoupons();
        assert.deepEqual(h.requests.filter(isClip).map(request => request.body.couponId), ['1000001', '1000002']);
        assert.match(h.state.status, message);
        assert.equal(h.state.offers.find(offer => offer.offerId === '1000002').status, 'UNCONFIRMED');
        assert.equal(h.state.offers.find(offer => offer.offerId === '1000003').status, 'AVAILABLE');
    }
    const limited = createHarness(request => isClip(request) ? jsonResponse({}, 429, '120') : storeResponder([coupon('1000001')])(request));
    await limited.clipAllKrogerCoupons();
    assert.ok(limited.state.cooldownUntil >= Date.now() + 119000, 'Retry-After starts a cooldown');
});

test('a malformed or endless list stops before any clip', async () => {
    let h = createHarness(() => jsonResponse({ data: { coupons: [] } }));
    await h.clipAllKrogerCoupons();
    assert.match(h.state.status, /not recognized/);
    assert.equal(h.requests.filter(isClip).length, 0);
    h = createHarness(() => jsonResponse(couponPage([], true)));
    await h.clipAllKrogerCoupons();
    assert.match(h.state.status, /ended early/);
    assert.equal(h.requests.length, 1);
    h = createHarness(request => jsonResponse(couponPage([coupon(String(1000001 + requestOffset(request)))], true, requestOffset(request))));
    await h.clipAllKrogerCoupons();
    assert.match(h.state.status, /more coupon pages than expected/);
    assert.equal(h.requests.length, h.SETTINGS.maximumCouponPages);
    assert.equal(h.requests.filter(isClip).length, 0);
});

test('missing sign-in, missing page context, another tab, or an account change sends nothing more', async () => {
    let h = createHarness(storeResponder([coupon('1000001')]), { accountKeys: null });
    await h.clipAllKrogerCoupons();
    assert.match(h.state.status, /Sign in to Kroger/);
    assert.equal(h.requests.length, 0);
    h = createHarness(storeResponder([coupon('1000001')]), { captureContext: false });
    await h.clipAllKrogerCoupons();
    assert.match(h.state.status, /finish loading/);
    assert.equal(h.requests.length, 0);
    h = createHarness(storeResponder([coupon('1000001')]), { locked: true });
    await h.clipAllKrogerCoupons();
    assert.match(h.state.status, /another tab/);
    assert.equal(h.requests.length, 0);
    const responder = storeResponder(couponIds(3).map(id => coupon(id)));
    h = createHarness((request, access) => {
        if (isClip(request)) h.pageStorage.set('msal.2.account.keys', JSON.stringify(['another-synthetic-account']));
        return responder(request, access);
    });
    await h.clipAllKrogerCoupons();
    assert.match(h.state.status, /account changed/);
    assert.equal(h.requests.filter(isClip).length, 1);
});

test('Stop ends the run after the in-flight clip settles', async () => {
    const responder = storeResponder(couponIds(4).map(id => coupon(id)));
    const h = createHarness((request, access) => {
        if (isClip(request) && request.body.couponId === '1000002') access.stopRun();
        return responder(request, access);
    });
    await h.clipAllKrogerCoupons();
    assert.deepEqual(h.requests.filter(isClip).map(request => request.body.couponId), ['1000001', '1000002']);
    assert.equal(h.state.confirmed, 2);
    assert.match(h.state.status, /Stopped/);
});

test('Load coupons reads without clipping, and saved coupons restore offline without secrets', async () => {
    const coupons = [coupon('1000001'), coupon('1000002', { addedToCard: true })];
    const h = createHarness(storeResponder(coupons));
    await h.loadKrogerCoupons();
    assert.equal(h.requests.filter(isClip).length, 0);
    assert.match(h.state.status, /Loaded 2 coupons: 1 ready to clip/);
    assert.equal(h.offerWorkflow.preview().length, 1);
    const saved = h.storage.get(`${h.SETTINGS.id}:workspace`);
    assert.equal(saved.schemaVersion, 3);
    assert.match(saved.scopeIdentity, /^[0-9a-f]{64}$/, 'account key is stored only as a fingerprint');
    const serialized = JSON.stringify(saved);
    for (const secret of ['synthetic-home-account', '900001000001', 'x-laf-object', 'PICKUP']) assert.equal(serialized.includes(secret), false, secret);
    const restored = createHarness(() => { throw new Error('restore must stay offline'); }, { storage: h.storage });
    restored.restoreWorkspace();
    assert.equal(restored.state.offers.length, 2);
    assert.equal(restored.state.needsScan, true);
    assert.equal(restored.requests.length, 0);
});
