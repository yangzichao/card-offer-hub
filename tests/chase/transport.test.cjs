const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, selectCards } = require('./helpers/userscript-harness.cjs');

test('Chase Retry-After supports seconds, dates, and a conservative fallback', () => {
    const harness = createHarness();
    assert.equal(harness.retryAfterMilliseconds('120'), 120000);
    assert.equal(harness.retryAfterMilliseconds('Wed, 01 Jan 2031 00:01:00 GMT', Date.parse('2031-01-01T00:00:00Z')), 60000);
    assert.equal(harness.retryAfterMilliseconds(null), 300000);
    assert.equal(harness.retryAfterMilliseconds('invalid'), 300000);
});

test('Chase unknown pacing schema is preserved and blocks requests', async () => {
    const saved = { schemaVersion: 999, cooldownUntil: 0, nextRequestAt: 0 };
    const storage = new Map([['chase-offer-lite:pacing', saved]]);
    const harness = createHarness(() => { throw new Error('must not fetch'); }, { storage });
    selectCards(harness);
    await harness.scanOffers();
    assert.equal(harness.requests.length, 0);
    assert.match(harness.state.storageError, /storage/);
    assert.deepEqual(storage.get('chase-offer-lite:pacing'), saved);
});

test('Chase 429 cooldown survives a reload without automatic or manual replay', async () => {
    const harness = createHarness(() => jsonResponse({}, 429, '600'));
    selectCards(harness);
    await harness.scanOffers();
    const cooldown = harness.state.cooldownUntil;
    assert.equal(harness.requests.length, 1);
    const reloaded = createHarness(() => { throw new Error('must not fetch'); }, { storage: harness.storage });
    selectCards(reloaded);
    await reloaded.scanOffers();
    assert.equal(reloaded.requests.length, 0);
    assert.equal(reloaded.state.cooldownUntil, cooldown);
    assert.match(reloaded.state.status, /Rate limited/);
});

test('Chase cooldown never shrinks after a shorter Retry-After or stored checkpoint', async () => {
    const harness = createHarness((request, access) => {
        access.state.cooldownUntil = access.state.nextRequestAt + 900000;
        return jsonResponse({}, 429, '1');
    });
    selectCards(harness);
    await harness.scanOffers();
    const longerCooldown = harness.state.cooldownUntil;
    harness.storage.set('chase-offer-lite:pacing', { schemaVersion: 1, cooldownUntil: 1, nextRequestAt: 1 });
    harness.restorePacing();
    assert.equal(harness.state.cooldownUntil, longerCooldown);
});

test('Chase HTTP failures, malformed JSON, and timeouts halt without retry', async () => {
    for (const respond of [
        ...[401, 403, 500].map(status => () => jsonResponse({}, status)),
        () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => '<html>Sign in</html>' }),
        () => { const error = new Error('synthetic timeout'); error.name = 'AbortError'; throw error; }
    ]) {
        const harness = createHarness(respond);
        selectCards(harness);
        await harness.scanOffers();
        assert.equal(harness.requests.length, 1);
        assert.equal(harness.state.needsScan, true);
        assert.equal(harness.state.confirmed, 0);
    }
});

test('Chase failed storage and an active tab lock prevent even the first request', async () => {
    const failedStorage = createHarness(() => jsonResponse({}), { failStorage: true });
    selectCards(failedStorage);
    await failedStorage.scanOffers();
    assert.equal(failedStorage.requests.length, 0);
    assert.match(failedStorage.state.storageError, /Cannot save/);
    const locked = createHarness(() => jsonResponse({}), { locked: true });
    await locked.detectCards();
    assert.equal(locked.requests.length, 0);
    assert.match(locked.state.status, /another tab/);
});
