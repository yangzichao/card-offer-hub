const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adaptiveHarness } = require('../helpers/adaptive-pacing.cjs');
const citi = require('../citi/helpers/userscript-harness.cjs');
const amex = require('../amex/helpers/userscript-harness.cjs');
const asJson = value => JSON.parse(JSON.stringify(value));

test('diagnostics initialize and reload without writing or sending requests', () => {
    const harness = adaptiveHarness(); harness.restorePacing();
    assert.equal(harness.values.size, 0);
    assert.equal(harness.writes.length, 0);
    assert.deepEqual(asJson(harness.hubPacingDebugSnapshot(harness.state).events), []);
});

test('a completed request records timing, status and learned parameters, surviving reload', async () => {
    const harness = adaptiveHarness();
    await harness.scheduler.withRequestSlot(observe => { harness.advance(1300); observe('success', 200); });
    const report = asJson(harness.hubPacingDebugSnapshot(harness.state));
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.version, '1.5.1');
    assert.equal(report.events.length, 2);
    assert.equal(report.events[1].httpStatus, 200);
    assert.equal(report.events[1].durationMs, 1300);
    assert.equal(report.events[1].outcome, 'success');
    assert.equal(report.events[1].gapAfterMs, 1000);
    const reload = adaptiveHarness({ values: harness.values }); reload.restorePacing();
    assert.deepEqual(asJson(reload.hubPacingDebugSnapshot(reload.state).events), report.events);
    assert.equal(reload.writes.length, 0);
});

test('export is allowlisted even when state, error messages and saved events contain sensitive data', () => {
    const harness = adaptiveHarness();
    const secret = 'SYNTHETIC-SECRET-DO-NOT-EXPORT';
    harness.values.set(`${harness.storageKey}:diagnostics`, { schemaVersion: 1, events: [{ kind: 'request-end',
        at: harness.now(), httpStatus: 200, token: secret, accountId: secret, response: { secret }, message: secret,
        outcome: secret, durationMs: secret, version: secret }] });
    harness.restorePacing();
    harness.state.storageError = secret;
    harness.state.pacingDiagnostics.storageError = secret;
    harness.state.accounts = [{ token: secret }];
    harness.state.pacing.token = secret;
    const report = asJson(harness.hubPacingDebugSnapshot(harness.state));
    assert.equal(JSON.stringify(report).includes(secret), false);
    assert.equal(report.pacingStorageFailed, true);
    assert.equal(report.logStorageFailed, true);
    assert.deepEqual(report.events, [{ kind: 'request-end', at: harness.now(), httpStatus: 200 }]);
});

test('the persistent debug history stays bounded to the latest 200 records', async () => {
    const harness = adaptiveHarness();
    for (let index = 0; index < 120; index++) await harness.scheduler.withRequestSlot(observe => observe('neutral', 202));
    const report = asJson(harness.hubPacingDebugSnapshot(harness.state));
    assert.equal(report.events.length, 200);
    assert.equal(harness.values.get(`${harness.storageKey}:diagnostics`).events.length, 200);
    assert.ok(report.events[0].at > 1800000000000);
});

test('debug persistence failures retain downloadable memory records without changing request safety', async () => {
    const harness = adaptiveHarness({ onWrite(key) { if (key.endsWith(':diagnostics')) throw new Error('Full debug storage'); } });
    await harness.scheduler.withRequestSlot(observe => observe('success', 200));
    assert.equal(harness.state.storageError, '');
    assert.equal(harness.snapshot().successCount, 1);
    const report = asJson(harness.hubPacingDebugSnapshot(harness.state));
    assert.equal(report.logStorageFailed, true);
    assert.equal(report.events.length, 2);
    harness.restorePacing();
    assert.equal(harness.hubPacingDebugSnapshot(harness.state).events.length, 2, 'another manual run cannot discard unsaved page records');
});

test('unknown debug schemas are preserved while current-page records remain exportable', async () => {
    const harness = adaptiveHarness();
    const key = `${harness.storageKey}:diagnostics`;
    const future = { schemaVersion: 99, events: [] };
    harness.values.set(key, future); harness.restorePacing();
    await harness.scheduler.withRequestSlot(observe => observe('success', 200));
    assert.deepEqual(harness.values.get(key), future);
    assert.equal(harness.hubPacingDebugSnapshot(harness.state).events.length, 2);
    assert.equal(harness.state.storageError, '');
});

test('failed pacing writes are visible in the downloadable diagnostic history', async () => {
    const harness = adaptiveHarness({ onWrite(key) { if (!key.endsWith(':diagnostics')) throw new Error('Full pacing storage'); } });
    await assert.rejects(harness.scheduler.withRequestSlot(() => assert.fail('no request')), /Cannot save/);
    const report = asJson(harness.hubPacingDebugSnapshot(harness.state));
    assert.equal(report.pacingStorageFailed, true);
    assert.deepEqual(report.events.map(event => event.kind), ['pacing-save-failed']);
});

for (const [bank, create, prepare, scan, response, key] of [
    ['Citi', citi.createHarness, citi.selectCards, harness => harness.scanOffers(), () => citi.jsonResponse({}, 429, '600'), 'citi-offer-lite:pacing:diagnostics'],
    ['Amex', amex.createUserscriptHarness, amex.configureAccounts, harness => harness.startScan(), () => amex.jsonResponse({}, 429, { 'Retry-After': '600' }), 'amex-offer-lite:pacing:diagnostics']
]) {
    test(`${bank} records the real HTTP result, immediate retreat and final response in order`, async () => {
        const harness = create(response); prepare(harness); await scan(harness);
        const events = (harness.userscriptStorage || harness.storage).get(key).events;
        assert.deepEqual(events.map(event => event.kind), ['request-start', 'rate-limited', 'request-end']);
        assert.equal(events[1].gapBeforeMs, 1000);
        assert.equal(events[1].gapAfterMs, 2000);
        assert.equal(events[2].httpStatus, 429);
        assert.equal(events[2].outcome, 'limited');
        assert.equal(harness.requests.length, 1);
    });
}
