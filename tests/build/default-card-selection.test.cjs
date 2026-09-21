const test = require('node:test');
const assert = require('node:assert/strict');
const citi = require('../citi/helpers/userscript-harness.cjs');
const chase = require('../chase/helpers/userscript-harness.cjs');
const chaseResponses = require('../chase/fixtures/offers-response.cjs');
const adapters = [
    { bank: 'Citi', create: options => citi.createHarness(() => citi.jsonResponse(citi.listing([], [
        { accountId: 'a', displayProductName: 'Card A' }, { accountId: 'b', displayProductName: 'Card B' }
    ])), options), load: harness => harness.refreshAllCardsAndOffers() },
    { bank: 'Chase', create: options => chase.createHarness(() => { throw new Error('detect must not fetch'); }, options),
        load: harness => harness.detectCards() }
];
for (const { bank, create, load } of adapters) {
    test(`${bank}: fresh discovery selects all cards and explicit deselection survives reload and detection`, async () => {
        const first = create();
        assert.equal(first.requests.length, 0);
        await load(first);
        assert.equal(first.state.selected.size, 2);
        first.state.accounts.forEach(card => first.setCardSelected(card.accountId, false));
        const next = create({ storage: first.storage });
        next.restoreWorkspace();
        assert.equal(next.requests.length, 0);
        assert.equal(next.state.selected.size, 0, 'explicitly selecting none is preserved');
        await load(next);
        assert.equal(next.state.selected.size, 0);
    });
    test(`${bank}: legacy empty selections migrate to all, while legacy subsets stay intact`, async () => {
        for (const version of [1, 2]) {
            const first = create(); await load(first);
            const key = `${first.SETTINGS.id}:workspace`;
            const saved = structuredClone(first.storage.get(key));
            saved.schemaVersion = version;
            if (version === 1) delete saved.workflowType;
            delete saved.selectionInitialized;
            delete saved.continuationBlocked;
            for (const selected of [[], [saved.accounts[0].accountId]]) {
                const legacy = { ...saved, selected };
                first.storage.set(key, legacy);
                const next = create({ storage: first.storage }); next.restoreWorkspace();
                assert.equal(next.state.selected.size, selected.length ? 1 : 2);
                assert.equal(next.requests.length, 0);
                assert.deepEqual(first.storage.get(key), legacy, 'restore does not write or request');
                assert.equal(next.saveWorkspace(), true);
                assert.equal(first.storage.get(key).schemaVersion, 3);
            }
        }
    });
}
test('Chase: new cards select by default while known opt-outs stay unselected', async () => {
    const harness = chase.createHarness(() => { throw new Error('no requests'); });
    await harness.detectCards();
    harness.setCardSelected('101', false);
    const payload = chaseResponses.listing();
    payload.digitalProfileAccounts.push({ ...payload.digitalProfileAccounts[0], digitalAccountIdentifier: '303' });
    const capture = harness.captureSessionRequest(chaseResponses.endpoint, 'GET', chaseResponses.sessionHeaders());
    assert.equal(harness.captureSessionResponse(capture, payload), true);
    await harness.detectCards();
    assert.deepEqual(Array.from(harness.state.selected), ['202', '303']);
    assert.equal(harness.requests.length, 0);
});
