const test = require('node:test');
const assert = require('node:assert/strict');

function registerWorkspacePersistenceTests({ create, prepare, choose = () => {}, activate = async () => {}, secrets = [] }) {
    function restore(harness) { harness.restorePacing(); harness.restoreWorkspace(); return harness; }
    function snapshot(harness) { return harness.storage.get(`${harness.SETTINGS.id}:workspace`); }
    test('workspace survives reload with results, choices, timestamps and no requests or credentials', async () => {
        const first = create();
        await prepare(first);
        choose(first);
        first.state.search = 'Example'; first.state.collapsed = true;
        assert.equal(first.saveWorkspace(), true, first.state.storageError);
        const saved = structuredClone(snapshot(first));
        assert.ok(saved.offers.length > 0);
        assert.ok(saved.lastScanAt > 0);
        const second = restore(create({ storage: first.storage }));
        assert.equal(second.requests.length, 0);
        assert.equal(second.state.needsScan, true);
        assert.equal(second.state.restoredWorkspace, true);
        assert.equal(second.state.search, 'Example');
        assert.equal(second.state.collapsed, true);
        assert.equal(second.state.lastScanAt, saved.lastScanAt);
        assert.deepEqual(Array.from(second.state.offers, record => JSON.parse(JSON.stringify(record))), saved.offers);
        assert.deepEqual([...(second.state.selected || [])], saved.selected);
        assert.equal(second.state.consent ?? second.state.accountConsent ?? false, saved.consent);
        await activate(second);
        assert.equal(second.requests.length, 0, 'a restored cache alone cannot authorize an activation');
        for (const secret of secrets) assert.equal(JSON.stringify(saved).includes(secret), false, secret);
    });
    test('failed rescan keeps the last complete results and scan timestamp', async () => {
        let fail = false;
        const harness = create({ shouldFail: () => fail });
        await prepare(harness); choose(harness); harness.saveWorkspace();
        const saved = structuredClone(snapshot(harness));
        fail = true;
        await harness.scanOffers();
        assert.equal(harness.state.needsScan, true);
        assert.deepEqual(snapshot(harness).offers, saved.offers);
        assert.equal(snapshot(harness).lastScanAt, saved.lastScanAt);
    });
    test('future and malformed snapshots are preserved and block writes', async () => {
        for (const bad of [{ schemaVersion: 99, retained: 'future data' }, { schemaVersion: 1, offers: 'broken' }]) {
            const harness = create();
            const key = `${harness.SETTINGS.id}:workspace`;
            harness.storage.set(key, bad);
            restore(harness);
            assert.match(harness.state.storageError, /Cannot read saved/);
            assert.equal(harness.saveWorkspace(), false);
            await prepare(harness);
            assert.equal(harness.requests.length, 0);
            assert.deepEqual(harness.storage.get(key), bad);
        }
    });
    test('workspace-only save failures are visible and stop the operation', async () => {
        const harness = create({ onSave(key) { if (key.endsWith(':workspace')) throw new Error('Synthetic snapshot failure'); } });
        await prepare(harness);
        assert.match(harness.state.storageError, /Cannot save scan results/);
        const count = harness.requests.length;
        await harness.scanOffers(); await activate(harness);
        assert.equal(harness.requests.length, count);
    });
    test('pacing from older releases remains intact without an automatic migration request', () => {
        const harness = create();
        harness.storage.set(`${harness.SETTINGS.id}:pacing`, { schemaVersion: 1, nextRequestAt: 1900000000000, cooldownUntil: 1950000000000 });
        restore(harness);
        assert.equal(harness.state.cooldownUntil, 1950000000000);
        assert.equal(harness.state.nextRequestAt, 1900000000000);
        assert.equal(harness.requests.length, 0);
        assert.equal(harness.saveWorkspace(), true);
        assert.equal(harness.storage.get(`${harness.SETTINGS.id}:pacing`).cooldownUntil, 1950000000000);
    });
    test('a pending write restores as unconfirmed and cannot resume itself', async () => {
        const first = create(); await prepare(first); choose(first);
        first.markWorkspaceOfferPending(first.state.offers[0]);
        const next = restore(create({ storage: first.storage }));
        const pending = next.state.offers[0];
        assert.equal(pending.status || pending.result.toUpperCase(), 'UNCONFIRMED');
        assert.equal(next.state.needsScan, true);
        await activate(next);
        assert.equal(next.requests.length, 0);
    });
}
module.exports = { registerWorkspacePersistenceTests };
