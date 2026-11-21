const test = require('node:test');
const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const { readPublishedSharedRuntime } = require('../helpers/published-issuer-source.cjs');

function shared() {
    const context = {};
    runInNewContext(`${readPublishedSharedRuntime()}
        globalThis.probe = { createHubPanelPositionStore, hubNearestPanelCorner, hubClampPanelOffset };`, context);
    return context.probe;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('a dragged panel is saved against its nearest window corner', () => {
    const h = shared();
    const rect = (left, top, width = 300, height = 60) => ({ left, top, width, height, right: left + width, bottom: top + height });
    assert.deepEqual(plain(h.hubNearestPanelCorner(rect(20, 30), 1200, 900)), { horizontal: 'left', x: 20, vertical: 'top', y: 30 });
    assert.deepEqual(plain(h.hubNearestPanelCorner(rect(880, 820), 1200, 900)), { horizontal: 'right', x: 20, vertical: 'bottom', y: 20 });
    assert.deepEqual(plain(h.hubNearestPanelCorner(rect(10.4, 800.6), 1200, 900)), { horizontal: 'left', x: 10, vertical: 'bottom', y: 39 });
    assert.equal(h.hubClampPanelOffset(-50, 300, 1200), 8, 'never off the left edge');
    assert.equal(h.hubClampPanelOffset(1100, 300, 1200), 892, 'never off the right edge');
    assert.equal(h.hubClampPanelOffset(40, 400, 320), 8, 'a panel wider than the window keeps its left edge visible');
});

test('the panel position saves per bank with a schema, keeps an unreadable value, and reports save failures', () => {
    const h = shared();
    const storage = new Map();
    const access = { get: (key, fallback) => storage.get(key) ?? fallback, set: (key, value) => storage.set(key, value) };
    const store = () => h.createHubPanelPositionStore({ storage: access, storageKey: 'bank:panel-position' });
    assert.deepEqual(plain(store().load()), { position: null, error: '' }, 'default corner before any move');

    assert.equal(store().save({ horizontal: 'left', x: 24, vertical: 'top', y: 40, extra: 'dropped' }), '');
    assert.deepEqual(plain(storage.get('bank:panel-position')), { schemaVersion: 1, position: { horizontal: 'left', x: 24, vertical: 'top', y: 40 } });
    assert.deepEqual(plain(store().load()), { position: { horizontal: 'left', x: 24, vertical: 'top', y: 40 }, error: '' });
    assert.equal(store().save(null), '');
    assert.deepEqual(plain(store().load()), { position: null, error: '' }, 'reset to the default corner');

    for (const unreadable of [{ schemaVersion: 2, position: null }, { schemaVersion: 1, position: { horizontal: 'middle', x: 1, vertical: 'top', y: 1 } },
        { schemaVersion: 1, position: { horizontal: 'left', x: -5, vertical: 'top', y: 1 } }, 'text']) {
        storage.set('bank:panel-position', unreadable);
        const future = store();
        assert.match(future.load().error, /could not be read and was kept/);
        assert.equal(future.load().position, null);
        assert.match(future.save({ horizontal: 'left', x: 1, vertical: 'top', y: 1 }), /this visit only/);
        assert.deepEqual(storage.get('bank:panel-position'), unreadable);
    }
    const failing = h.createHubPanelPositionStore({ storage: { get: () => null, set: () => { throw new Error('full'); } }, storageKey: 'k' });
    assert.match(failing.save({ horizontal: 'left', x: 1, vertical: 'top', y: 1 }), /could not be saved/);
});
