const { registerWorkspacePersistenceTests } = require('../helpers/workspace-persistence.cjs');
const { createHarness, successfulResponder, jsonResponse } = require('./helpers/userscript-harness.cjs');
registerWorkspacePersistenceTests({ create: (options = {}) => { const respond = successfulResponder(); return createHarness(request => options.shouldFail?.() ? jsonResponse({}, 500) : respond(request), options); },
    prepare: harness => harness.scanOffers(), choose: harness => harness.selectAllOffers(),
    activate: harness => harness.activateSelectedOffers(), secrets: ['synthetic-token', 'synthetic-serve', 'serveToken', 'synthetic-customer', 'sessionTokenId'] });

const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionFixture } = require('./helpers/userscript-harness.cjs');
test('US Bank keeps same-customer selections but clears them for another customer', async () => {
    const first = createHarness(successfulResponder()); await first.scanOffers(); first.selectAllOffers();
    const saved = structuredClone(first.storage);
    const same = createHarness(successfulResponder(), { storage: structuredClone(saved), session: { ...sessionFixture, securityToken: 'rotated-token' } });
    same.restoreWorkspace(); await same.scanOffers(); assert.equal(same.state.selected.size, 2);
    const other = createHarness(successfulResponder(), { storage: structuredClone(saved), session: { ...sessionFixture, sourceCustomerId: 'other-customer' } });
    other.restoreWorkspace(); await other.scanOffers(); assert.equal(other.state.selected.size, 0);
});

test('a different selected offer disappearing during read-back does not corrupt the snapshot', async () => {
    const { jsonResponse, listing, offer, acknowledgement, isActivation } = require('./helpers/userscript-harness.cjs');
    let activated = false;
    const harness = createHarness(request => {
        if (isActivation(request)) { activated = true; return jsonResponse(acknowledgement()); }
        return jsonResponse(listing(activated ? [offer('a', 'ACTIVATED')] : [offer('a'), offer('b')]));
    });
    await harness.scanOffers(); harness.selectAllOffers(); await harness.activateSelectedOffers();
    assert.equal(harness.requests.filter(isActivation).length, 1);
    assert.equal(harness.state.confirmed, 1);
    assert.equal(harness.state.storageError, '');
    assert.equal(harness.state.needsScan, true);
    const restored = createHarness(successfulResponder(), { storage: harness.storage });
    restored.restoreWorkspace();
    assert.equal(restored.state.offers[0].status, 'ACTIVATED');
    assert.equal(restored.state.selected.size, 0);
});
