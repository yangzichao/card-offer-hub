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
    assert.match(harness.state.status, /Finished: 1 of 1 added\./);
    const writes = harness.requests.filter(item => item.method === 'PUT');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].body, undefined);
    assert.equal(writes[0].headers['Content-Type'], undefined);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.equal(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt, 1000);
    }
    const stored = JSON.stringify([...harness.storage]);
    assert.ok(!stored.includes(token()));
    assert.ok(!stored.includes('latitude'));
});
test('429 halts the run without retries', async () => {
    const harness = createHarness(responder([offer('101'), offer('102')], '429'));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.needsScan, true);
    assert.equal(harness.requests.filter(item => item.method === 'PUT').length, 1);
    const count = harness.requests.length;
    await harness.activateOffers();
    assert.equal(harness.requests.length, count);
    await harness.scanOffers();
    assert.match(harness.state.status, /Rate limited/);
    assert.equal(harness.requests.length, count);
});
test('an acknowledgement without ok is settled by the read-back, once per offer', async () => {
    const harness = createHarness(responder([offer('101'), offer('102')], 'unknown'));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.equal(harness.state.confirmed, 2);
    assert.equal(harness.requests.filter(item => item.method === 'PUT').length, 2);
    assert.match(harness.state.status, /Finished: 2 of 2 added\./);
});
test('an offer that never reads back activated is re-sent once, then skipped for the next offer', async () => {
    const harness = createHarness(responder([offer('101'), offer('102')], 'readback'));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    const writes = harness.requests.filter(item => item.method === 'PUT').map(item => item.path);
    assert.deepEqual(writes, ['/api/activate-offer/101', '/api/activate-offer/101', '/api/activate-offer/102', '/api/activate-offer/102']);
    assert.equal(harness.state.confirmed, 0);
    assert.deepEqual(Array.from(harness.state.offers, item => item.result), ['Not added', 'Not added']);
    assert.match(harness.state.status, /Finished: 0 of 2 added\. 2 not added after a retry; Add tries them again\. Not added: Synthetic Merchant 101, Synthetic Merchant 102\./);
    assert.equal(harness.state.needsScan, false, 'Add can try them again without a new scan');
    await harness.activateOffers();
    assert.equal(harness.requests.filter(item => item.method === 'PUT').length, 8);
});
test('one failing offer is retried once and the run continues with the rest', async () => {
    const offers = [offer('101'), offer('102'), offer('103')];
    const normal = responder(offers);
    const harness = createHarness(request => {
        if (request.method === 'PUT' && request.path.endsWith('/102')) return jsonResponse({}, 500);
        return normal(request);
    });
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    const writes = harness.requests.filter(item => item.method === 'PUT').map(item => item.path.split('/').pop());
    assert.deepEqual(writes, ['101', '102', '102', '103']);
    assert.equal(harness.state.confirmed, 2);
    assert.deepEqual(Array.from(harness.state.offers, item => [item.result, item.activated]),
        [['Confirmed', true], ['Not added', false], ['Confirmed', true]]);
    assert.match(harness.state.status, /Finished: 2 of 3 added\..*Not added: Synthetic Merchant 102\./);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.ok(harness.requests[index].startedAt >= harness.requests[index - 1].finishedAt, 'still one request at a time');
    }
});
test('a details read that fails twice skips the offer without writing it', async () => {
    const normal = responder([offer('101'), offer('102')]);
    const harness = createHarness(request => {
        if (request.path === '/api/offers-details' && request.body.offer_id === '101') return jsonResponse({}, 404);
        return normal(request);
    });
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.deepEqual(harness.requests.filter(item => item.method === 'PUT').map(item => item.path), ['/api/activate-offer/102']);
    assert.equal(harness.requests.filter(item => item.body?.offer_id === '101').length, 2, 'one read retry');
    assert.equal(harness.state.offers[0].result, 'Not added');
    assert.equal(harness.state.confirmed, 1);
});
test('three failing offers in a row pause the run; Add continues later', async () => {
    const offers = ['101', '102', '103', '104'].map(id => offer(id));
    const harness = createHarness(responder(offers, 'readback'));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    const written = new Set(harness.requests.filter(item => item.method === 'PUT').map(item => item.path.split('/').pop()));
    assert.deepEqual([...written], ['101', '102', '103']);
    assert.match(harness.state.status, /^Paused: 3 offers in a row could not be added.* 1 not tried yet\. Click Add again to continue\./);
    assert.equal(harness.state.needsScan, false);
});
test('a lost write that reads back activated counts; a lost read-back ends the run', async () => {
    const normal = responder([offer('101'), offer('102')]);
    let dropWrite = true;
    const harness = createHarness(request => {
        const response = normal(request);
        if (request.method === 'PUT' && dropWrite) { dropWrite = false; throw new TypeError('Failed to fetch'); }
        return response;
    });
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.equal(harness.state.confirmed, 2);
    assert.equal(harness.requests.filter(item => item.method === 'PUT').length, 2);

    let writes = 0;
    const fresh = responder([offer('101'), offer('102')]);
    const offline = createHarness(request => {
        if (request.method === 'PUT') writes++;
        if (writes && request.path === '/api/offers-details') throw new TypeError('Failed to fetch');
        return fresh(request);
    });
    await offline.scanOffers();
    offline.state.consent = true;
    await offline.activateOffers();
    assert.match(offline.state.status, /Network request failed/);
    assert.equal(writes, 1);
    assert.equal(offline.state.offers[0].result, 'Unconfirmed');
    assert.equal(offline.state.needsScan, true);
});
test('sign-in errors during activation end the run', async () => {
    const normal = responder([offer('101'), offer('102')]);
    const harness = createHarness(request => request.method === 'PUT' ? jsonResponse({}, 401) : normal(request));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.match(harness.state.status, /HTTP 401\. Sign in and scan again/);
    assert.equal(harness.requests.filter(item => item.method === 'PUT').length, 1);
    assert.equal(harness.state.offers[0].result, 'Unconfirmed');
    assert.equal(harness.state.needsScan, true);
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
test('an empty list despite a reported total, or no user information, fails closed', async () => {
    for (const payload of [{ offers: [], total: 1 }, { offers: [offer()], total: 1, user_information_available: false }]) {
        const harness = createHarness(request => request.path === '/geo' ? jsonResponse({ latitude: 0, longitude: 0 }) : jsonResponse(payload));
        await harness.scanOffers();
        assert.equal(harness.state.needsScan, true);
        assert.equal(harness.state.offers.length, 0);
    }
});
test('a total that changes on every page, as observed live, still completes the scan', async () => {
    const offers = Array.from({ length: 60 }, (_, index) => offer(String(200 + index)));
    // Live Deals returned 841, 843, 840, 831, 843 for consecutive pages; the list
    // also shifts, so one offer from page 1 appears again on page 2.
    const pages = [
        { offers: offers.slice(0, 24), total: 61 },
        { offers: [offers[23], ...offers.slice(24, 47)], total: 63 },
        { offers: offers.slice(47), total: 58 }
    ];
    const harness = createHarness(request => request.path === '/geo' ? jsonResponse({ latitude: 0, longitude: 0 })
        : jsonResponse(pages[request.body.page_offset / 24]));
    await harness.scanOffers();
    assert.equal(harness.state.needsScan, false);
    assert.equal(harness.state.offers.length, 60);
    assert.equal(new Set(Array.from(harness.state.offers, item => item.id)).size, 60);
    assert.deepEqual(harness.requests.filter(request => request.path.endsWith('search')).map(request => request.body.page_offset), [0, 24, 48]);
    assert.match(harness.state.status, /Scan complete: 60 eligible, 0 skipped/);
});
test('a full last page is followed by one more request that ends on an empty page', async () => {
    const offers = Array.from({ length: 24 }, (_, index) => offer(String(300 + index)));
    const harness = createHarness(responder(offers));
    await harness.scanOffers();
    assert.equal(harness.state.offers.length, 24);
    assert.deepEqual(harness.requests.filter(request => request.path.endsWith('search')).map(request => request.body.page_offset), [0, 24]);
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
test('changed preflight eligibility skips that offer without a write and continues', async () => {
    const normal = responder([offer('101'), offer('102')]);
    const harness = createHarness(request => request.path === '/api/offers-details' && request.body.offer_id === '101'
        ? jsonResponse({ offer: offer('101', { activation_type: 'LINK' }) }) : normal(request));
    await harness.scanOffers();
    harness.state.consent = true;
    await harness.activateOffers();
    assert.match(harness.state.status, /Finished: 1 of 2 added\. 1 no longer eligible\./);
    assert.deepEqual(harness.requests.filter(request => request.method === 'PUT').map(request => request.path), ['/api/activate-offer/102']);
    assert.equal(harness.state.offers[0].reason, 'Shopping link / unsupported activation');
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
