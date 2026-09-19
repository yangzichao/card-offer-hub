const { registerWorkspacePersistenceTests } = require('../helpers/workspace-persistence.cjs');
const { createHarness, jsonResponse, listing, confirmation, selectCards } = require('./helpers/userscript-harness.cjs');
function create(options = {}) {
    return createHarness(request => options.shouldFail?.() ? jsonResponse({}, 500)
        : jsonResponse(request.url.endsWith('/retrieve') ? listing(undefined, [{ accountId: 'card-a', displayProductName: 'Example card' }]) : confirmation(request)), options);
}
registerWorkspacePersistenceTests({ create, prepare: async harness => { selectCards(harness); await harness.scanOffers(); },
    activate: harness => harness.addAllOffers(), secrets: ['synthetic-session', 'synthetic-client'] });
module.exports = { create };

const test = require('node:test');
const assert = require('node:assert/strict');
test('Citi verifies restored card IDs before scanning and rejects another login', async () => {
    const first = create(); selectCards(first); await first.scanOffers();
    const second = createHarness(() => jsonResponse(listing(undefined, [{ accountId: 'other-card', displayProductName: 'Other login' }])), { storage: first.storage });
    second.restoreWorkspace();
    await second.scanOffers();
    assert.equal(second.requests.length, 1);
    assert.deepEqual(second.requests[0].body, {});
    assert.equal(second.state.selected.size, 0);
    assert.equal(second.state.offers.length, 0);
    assert.match(second.state.status, /do not match this login/);
});
test('Citi writes pending state before sending, then persists confirmed results', async () => {
    let completeWrite;
    let writeStarted;
    const started = new Promise(resolve => { writeStarted = resolve; });
    const first = createHarness(request => {
        if (request.url.endsWith('/retrieve')) return jsonResponse(listing());
        writeStarted();
        return new Promise(resolve => { completeWrite = () => resolve(jsonResponse(confirmation(request))); });
    });
    selectCards(first);
    const run = first.addAllOffers();
    await started;
    const duringWrite = create({ storage: first.storage }); duringWrite.restoreWorkspace();
    assert.equal(duringWrite.state.offers[0].status, 'UNCONFIRMED');
    assert.equal(duringWrite.state.needsScan, true);
    completeWrite(); await run;
    const after = create({ storage: first.storage }); after.restoreWorkspace();
    assert.equal(after.state.offers[0].status, 'ENROLLED');
});
test('failed pending checkpoint sends no enrollment request', async () => {
    const harness = create({ onSave(key, value) {
        if (key.endsWith(':workspace') && value.offers.some(offer => offer.status === 'UNCONFIRMED')) throw new Error('Cannot checkpoint');
    } });
    selectCards(harness); await harness.addAllOffers();
    assert.equal(harness.requests.length, 1);
    assert.match(harness.state.storageError, /Cannot save/);
});
