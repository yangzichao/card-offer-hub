const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, responder, offer, token, jsonResponse } = require('./helpers/userscript-harness.cjs');
test('strict eligibility and matching detail identity', () => {
    const harness = createHarness(responder());
    assert.equal(harness.normalizeOffer(offer()).eligible, true);
    for (const extra of [{ activation_type: 'LINK' }, { type: 'AFFILIATE' }, { is_activated: true },
        { activation_required: false }, { activation_triggers: null }, { activation_triggers: ['OUTBOUND_LINK_CLICK'] }]) {
        assert.equal(harness.normalizeOffer(offer('101', extra)).eligible, false);
    }
    assert.throws(() => harness.normalizeOffer(offer('../bad')));
    assert.throws(() => harness.normalizeOffer(offer('101', { is_activated: 'false' })));
    assert.throws(() => harness.normalizeDetail({ offer: offer() }, '999'));
});
test('manual pagination, consent, empty PUT and readback, response-completion pacing', async () => {
    const offers = Array.from({ length: 25 }, (_, index) => offer(String(100 + index), index ? { activation_type: 'LINK' } : {}));
    const harness = createHarness(responder(offers), { responseDelay: 3500 });
    await harness.activateOffers();
    assert.equal(harness.requests.length, 0);
    await harness.scanOffers();
    assert.equal(harness.state.needsScan, false);
    assert.equal(harness.state.offers.length, 25);
    assert.deepEqual(harness.requests.filter(item => item.path.endsWith('search')).map(item => item.body.page_offset), [0, 24]);
    await harness.activateOffers();
    assert.equal(harness.requests.length, 3);
    harness.state.consent = true;
    await harness.activateOffers();
    assert.match(harness.state.status, /Finished: 1\/1/);
    const writes = harness.requests.filter(item => item.method === 'PUT');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body, undefined);
    assert.equal(writes[0].headers['Content-Type'], undefined);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.equal(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt, 500);
    }
    const stored = JSON.stringify([...harness.storage]);
    assert.ok(!stored.includes(token()));
    assert.ok(!stored.includes('latitude'));
});
for (const mode of ['unknown', '429', 'readback']) test(`${mode} halts without retries`, async () => {
    const harness = createHarness(responder([offer('101'), offer('102')], mode));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.needsScan, true);
    assert.equal(harness.requests.filter(item => item.method === 'PUT').length, 1);
    const count = harness.requests.length;
    await harness.activateOffers();
    assert.equal(harness.requests.length, count);
    if (mode === '429') {
        await harness.scanOffers();
        assert.match(harness.state.status, /Rate limited/);
        assert.equal(harness.requests.length, count);
    }
});
test('session switch cannot activate', async () => {
    const harness = createHarness(responder());
    await harness.scanOffers();
    harness.setSession(token({ sub: 'different-synthetic-session' }));
    harness.state.consent = true;
    await harness.activateOffers();
    assert.match(harness.state.status, /session changed/);
    assert.equal(harness.requests.length, 2);
});
for (const value of ['', token({ exp: 1 }), token({ featureFlags: { dxlEnabled: false } })]) {
    test('missing, expired or legacy sessions cannot send requests', async () => {
        const harness = createHarness(responder(), { token: value });
        await harness.scanOffers();
        assert.equal(harness.requests.length, 0);
    });
}
test('unknown storage preserved; storage failure and concurrent tab fail closed', async () => {
    const storage = new Map([['bofa-offer-lite:pacing', { schemaVersion: 99, custom: 'preserve' }]]);
    for (const options of [{ storage }, { failStorage: true }, { locked: true }]) {
        const harness = createHarness(responder(), options);
        await harness.scanOffers();
        assert.equal(harness.requests.length, 0);
    }
    assert.equal(storage.get('bofa-offer-lite:pacing').schemaVersion, 99);
});
test('stop during pacing prevents subsequent requests', async () => {
    const harness = createHarness(responder(), { onWait: access => access.stopRun() });
    await harness.scanOffers();
    assert.equal(harness.requests.length, 1);
    assert.match(harness.state.status, /Stopped/);
});
test('ambiguous pagination fails closed', async () => {
    for (const payload of [{ offers: [offer()], total: 2 }, { offers: [offer(), offer()], total: 2 },
        { offers: [], total: 1 }, { offers: [offer()], total: 1, user_information_available: false }]) {
        const harness = createHarness(request => request.path === '/geo' ? jsonResponse({ latitude: 0, longitude: 0 }) : jsonResponse(payload));
        await harness.scanOffers();
        assert.equal(harness.state.needsScan, true);
        assert.equal(harness.state.offers.length, 0);
    }
});
test('strict endpoint allowlist and location validation', async () => {
    const harness = createHarness(responder());
    assert.throws(() => harness.normalizeLocation({ latitude: 100, longitude: 0 }));
    await assert.rejects(harness.requestJson('/api/upside/offer/search', 'POST', {}));
    await assert.rejects(harness.requestJson('/api/activate-offer/101', 'PUT', { activation_source: 'OUTBOUND_LINK_CLICK' }));
    assert.equal(harness.requests.length, 0);
});

test('429 cooldown survives reload and never shrinks', async () => {
    const storage = new Map();
    const harness = createHarness(responder([offer()], '429'), { storage });
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    const cooldown = harness.state.cooldownUntil;
    const restored = createHarness(responder(), { storage });
    await restored.scanOffers();
    assert.equal(restored.requests.length, 0);
    assert.equal(restored.state.cooldownUntil, cooldown);
    restored.state.cooldownUntil += 100000;
    restored.restorePacing();
    assert.equal(restored.state.cooldownUntil, cooldown + 100000);
});
test('changed preflight eligibility prevents a write', async () => {
    const normal = responder();
    const harness = createHarness(request => request.path === '/api/offers-details'
        ? jsonResponse({ offer: offer('101', { activation_type: 'LINK' }) }) : normal(request));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.match(harness.state.status, /eligibility changed/);
    assert.equal(harness.requests.filter(request => request.method === 'PUT').length, 0);
});
test('stop during a write leaves it unconfirmed and never sends a second write', async () => {
    const normal = responder();
    const harness = createHarness((request, access) => {
        if (request.method === 'PUT') access.stopRun();
        return normal(request);
    });
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.match(harness.state.status, /Stopped/);
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.offers[0].result, 'Unconfirmed');
    assert.equal(harness.requests.length, 4);
});
for (const mode of ['http', 'malformed', 'timeout']) test(`${mode} failure stops without retries`, async () => {
    const harness = createHarness(() => {
        if (mode === 'http') return jsonResponse({}, 401);
        if (mode === 'malformed') return { ...jsonResponse({}), text: async () => '<html>login</html>' };
        const error = new Error('Synthetic abort');
        error.name = 'AbortError';
        throw error;
    });
    await harness.scanOffers();
    assert.equal(harness.state.needsScan, true);
    assert.equal(harness.requests.length, 1);
});
