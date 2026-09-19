const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/userscript-harness.cjs');
const { account, offer, listing } = require('./fixtures/offers-response.cjs');

test('Chase account normalization preserves eligibility and validates identifiers', () => {
    const harness = createHarness();
    const accounts = harness.normalizeAccounts(listing());
    assert.deepEqual(Array.from(accounts, card => [card.accountId, card.name, card.lastFour, card.eligible]),
        [['101', 'Synthetic Card A', '0000', true], ['202', 'Synthetic Card B', '0000', true]]);
    assert.throws(() => harness.normalizeAccounts({}), /not recognized/);
    assert.throws(() => harness.normalizeAccounts({ digitalProfileAccounts: [account(), account()] }), /duplicate/);
    for (const invalid of ['', '-1', '1.5', 'unsafe-value', Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => harness.normalizeAccounts({ digitalProfileAccounts: [{ ...account(), digitalAccountIdentifier: invalid }] }), /identifier/);
    }
});

test('Chase statuses stay explicit, per-card offers deduplicate, and conflicts remain visible', () => {
    const harness = createHarness();
    const result = harness.normalizeOffers(listing('101', [offer('a'), offer('a'), offer('b', 'SERVED'),
        offer('c', 'ACTIVATED'), offer('b', 'ACTIVATED'), offer('d', 'UNKNOWN')]), '101');
    assert.deepEqual(Array.from(result, entry => [entry.offerId, entry.status]),
        [['a', 'NEW'], ['b', 'CONFLICT'], ['c', 'ACTIVATED'], ['d', 'UNKNOWN']]);
    assert.ok(result.every(entry => entry.accountId === '101'));
});

test('Chase refuses partial, mismatched, missing, and count-inconsistent offer lists', () => {
    const harness = createHarness();
    for (const payload of [{}, listing('202'), { customerOffers: [] },
        { customerOffers: [...listing().customerOffers, ...listing('202').customerOffers] }]) {
        assert.throws(() => harness.normalizeOffers(payload, '101'));
    }
    for (const mutation of [
        response => { response.customerOffers[0].partial = true; },
        response => { delete response.customerOffers[0].partial; },
        response => { response.customerOffers[0].totalAvailableOfferCount = 2; },
        response => { response.customerOffers[0].offers = [{}]; }
    ]) {
        const response = listing();
        mutation(response);
        assert.throws(() => harness.normalizeOffers(response, '101'), /partial|incomplete/);
    }
});
