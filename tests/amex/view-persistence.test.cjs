const test = require('node:test');
const assert = require('node:assert/strict');
const { createUserscriptHarness } = require('./helpers/userscript-harness.cjs');
test('Amex restores search and minimized state without a request', () => {
    const first = createUserscriptHarness();
    first.state.filter = 'coffee'; first.state.minimized = true;
    first.persistViewSettings();
    const next = createUserscriptHarness(undefined, { userscriptStorage: first.userscriptStorage });
    next.restoreLocalSettings();
    assert.equal(next.state.filter, 'coffee');
    assert.equal(next.state.minimized, true);
    assert.equal(next.requests.length, 0);
});
test('Amex preserves future display schema and reports failed preference writes', () => {
    const harness = createUserscriptHarness();
    const future = { schemaVersion: 99, custom: 'keep' };
    harness.userscriptStorage.set(harness.SAVED_VIEW_SETTINGS_KEY, future);
    harness.restoreViewSettings(); harness.persistViewSettings();
    assert.deepEqual(harness.userscriptStorage.get(harness.SAVED_VIEW_SETTINGS_KEY), future);
    const failed = createUserscriptHarness(undefined, { storageWriteError: true });
    failed.persistViewSettings();
    assert.ok(failed.state.logs.some(message => message.includes('Could not save search')));
});
