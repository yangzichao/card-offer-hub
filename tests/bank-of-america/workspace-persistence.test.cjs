const { registerWorkspacePersistenceTests } = require('../helpers/workspace-persistence.cjs');
const { createHarness, responder, jsonResponse, token } = require('./helpers/userscript-harness.cjs');
registerWorkspacePersistenceTests({ create: (options = {}) => { const respond = responder(); return createHarness(request => options.shouldFail?.() ? jsonResponse({}, 500) : respond(request), options); },
    prepare: harness => harness.scanOffers(), choose: harness => { harness.state.consent = true; },
    activate: harness => harness.activateOffers(), secrets: [token(), 'latitude', 'longitude', 'sessionToken'] });

const test = require('node:test');
const assert = require('node:assert/strict');
test('a changed Deals session resets saved activation consent', async () => {
    const first = createHarness(responder(), { token: token({ sub: 'one' }) });
    await first.scanOffers(); first.state.consent = true; first.saveWorkspace();
    const second = createHarness(responder(), { storage: first.storage, token: token({ sub: 'two' }) });
    second.restoreWorkspace(); assert.equal(second.state.consent, true);
    await second.scanOffers();
    assert.equal(second.state.consent, false);
    assert.equal(second.state.needsScan, false);
    const count = second.requests.length;
    await second.activateOffers(); assert.equal(second.requests.length, count);
});
