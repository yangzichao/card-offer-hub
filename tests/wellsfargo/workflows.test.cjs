const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, offer, listing, consentAndScan } = require('./helpers/userscript-harness.cjs');
const normalResponse = request => jsonResponse(request.method === 'GET'
    ? listing([offer('1001'), offer('1002'), offer('1001'), offer('1003', { multiCardFlag: true })]) : { status: 'SUCCESS' });

test('manual account consent and a successful scan are both required', async () => {
    const harness = createHarness(normalResponse);
    assert.equal(harness.requests.length, 0);
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 0);
    harness.state.accountConsent = true;
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 0);
    harness.state.accountConsent = false;
    await harness.scanOffers();
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 1);
});

test('fresh scan, deduplication, serial activation, response-completion pacing, and minimal storage', async () => {
    const harness = createHarness(normalResponse, { responseDelay: 4000 });
    await consentAndScan(harness);
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 4);
    assert.equal(harness.state.confirmed, 2);
    assert.equal(harness.maximumActive(), 1);
    assert.deepEqual(harness.requests.map(request => request.method), ['GET', 'GET', 'POST', 'POST']);
    for (let index = 1; index < harness.requests.length; index++) {
        assert.equal(harness.requests[index].startedAt - harness.requests[index - 1].finishedAt, 1000);
    }
    for (const request of harness.requests) {
        assert.equal(request.config.credentials, 'same-origin');
        assert.equal(request.config.redirect, 'error');
    }
    assert.match(harness.state.status, /Finished: 2 of 2 added\./);
    const stored = JSON.stringify([...harness.storage]);
    for (const forbidden of ['synthetic-token', 'checkSum', 'clDealsActivateAction']) assert.equal(stored.includes(forbidden), false);
});

const enrolledIds = harness => harness.requests.filter(request => request.method === 'POST')
    .map(request => Object.keys(request.body.offerIdCheckSumMap)[0]);

test('a missing SUCCESS is checked against the account list, re-sent once, then skipped', async () => {
    const harness = createHarness(request => request.method === 'GET' ? normalResponse(request) : jsonResponse({}));
    await consentAndScan(harness);
    await harness.addAllOffers();
    assert.deepEqual(enrolledIds(harness), ['1001', '1001', '1002', '1002']);
    assert.deepEqual(harness.requests.map(request => request.method), ['GET', 'GET', 'POST', 'GET', 'POST', 'GET', 'POST', 'GET', 'POST', 'GET']);
    assert.equal(harness.state.confirmed, 0);
    assert.equal(harness.state.offers[0].status, 'AVAILABLE');
    assert.match(harness.state.status, /Finished: 0 of 2 added\. 2 not added after a retry; Add tries them again\./);
    assert.equal(harness.state.needsScan, false);
});

test('an unclear write that the account list shows as activated counts as added', async () => {
    const activated = new Set();
    const harness = createHarness(request => {
        if (request.method === 'POST') { activated.add(Object.keys(request.body.offerIdCheckSumMap)[0]); return jsonResponse({}); }
        return jsonResponse(listing([offer('1001', { isActivated: activated.has('1001') }), offer('1002', { isActivated: activated.has('1002') })]));
    });
    await consentAndScan(harness);
    await harness.addAllOffers();
    assert.deepEqual(enrolledIds(harness), ['1001', '1002']);
    assert.equal(harness.state.confirmed, 2);
    assert.deepEqual(Array.from(harness.state.offers, item => item.status), ['ACTIVATED', 'ACTIVATED']);
});

test('one failing offer does not stop the others', async () => {
    const harness = createHarness(request => request.method === 'POST' && request.body.offerIdCheckSumMap['1001'] !== undefined
        ? jsonResponse({}, 500) : normalResponse(request));
    await consentAndScan(harness);
    await harness.addAllOffers();
    assert.deepEqual(enrolledIds(harness), ['1001', '1001', '1002']);
    assert.equal(harness.state.confirmed, 1);
    assert.match(harness.state.status, /Finished: 1 of 2 added\..*Not added: Example 1001\./);
});

test('429 cooldown persists across reload and shorter cooldowns never overwrite longer ones', async () => {
    const harness = createHarness(() => jsonResponse({}, 429, '600'));
    await harness.scanOffers();
    const cooldown = harness.state.cooldownUntil;
    const reloaded = createHarness(normalResponse, { storage: harness.storage });
    await reloaded.scanOffers();
    assert.equal(reloaded.requests.length, 0);
    assert.equal(reloaded.state.cooldownUntil, cooldown);
    assert.match(reloaded.state.status, /Rate limited/);
    const longer = createHarness((request, access) => {
        access.state.cooldownUntil = access.state.nextRequestAt + 900000;
        return jsonResponse({}, 429, '1');
    });
    await longer.scanOffers();
    const deadline = longer.state.cooldownUntil;
    longer.storage.set('wellsfargo-offer-lite:pacing', { schemaVersion: 1, cooldownUntil: 1, nextRequestAt: 1 });
    longer.restorePacing();
    assert.equal(longer.state.cooldownUntil, deadline);
});

test('a server error or timeout on one write is checked and re-sent once', async () => {
    for (const fail of [() => jsonResponse({}, 500), () => { const error = new Error('synthetic'); error.name = 'AbortError'; throw error; }]) {
        const harness = createHarness(request => request.method === 'GET' ? normalResponse(request) : fail());
        await consentAndScan(harness);
        await harness.addAllOffers();
        assert.deepEqual(enrolledIds(harness), ['1001', '1001', '1002', '1002']);
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.state.needsScan, false);
    }
});

test('sign-in errors and login pages stop without retries', async () => {
    const failures = [401, 403].map(status => () => jsonResponse({}, status));
    failures.push(() => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => '<html>Sign in</html>' }));
    for (const fail of failures) {
        const harness = createHarness(request => request.method === 'GET' ? normalResponse(request) : fail());
        await consentAndScan(harness);
        await harness.addAllOffers();
        assert.equal(harness.requests.length, 3);
        assert.equal(harness.state.confirmed, 0);
        assert.equal(harness.state.needsScan, true);
        await harness.addAllOffers();
        assert.equal(harness.requests.length, 3);
    }
});

test('stopping an in-flight activation records confirmation but sends no next request', async () => {
    const harness = createHarness((request, access) => {
        if (request.method === 'POST') access.stopRun();
        return normalResponse(request);
    });
    await consentAndScan(harness);
    await harness.addAllOffers();
    assert.equal(harness.requests.length, 3);
    assert.equal(harness.state.confirmed, 1);
    assert.equal(harness.state.offers[0].status, 'ACTIVATED');
    assert.equal(harness.state.needsScan, true);
});

test('stop during pacing prevents the next request and duplicate clicks do not overlap', async () => {
    const harness = createHarness(normalResponse, { onWait: access => access.stopRun() });
    await consentAndScan(harness);
    const first = harness.addAllOffers();
    await harness.addAllOffers();
    await first;
    assert.equal(harness.requests.length, 1);
    assert.match(harness.state.status, /Stopped/);
});

test('storage errors, future schema, missing token, and cross-tab locking fail closed', async () => {
    for (const options of [{ failStorage: true }, { locked: true },
        { storage: new Map([['wellsfargo-offer-lite:pacing', { schemaVersion: 999 }]]) }]) {
        const harness = createHarness(normalResponse, options);
        await harness.scanOffers();
        assert.equal(harness.requests.length, 0);
        assert.equal(harness.state.needsScan, true);
    }
    const missing = createHarness(normalResponse, { scripts: [] });
    await consentAndScan(missing);
    await missing.addAllOffers();
    assert.equal(missing.requests.length, 0);
    assert.match(missing.state.status, /session is unavailable/);
});
