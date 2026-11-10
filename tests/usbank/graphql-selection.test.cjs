const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, jsonResponse, listing, offer } = require('./helpers/userscript-harness.cjs');
const { graphqlSelection, answerSelectedFields } = require('./helpers/graphql-selection.cjs');

// The harness answers like the real GraphQL server: a field the scan query does
// not select never arrives. 1.9.0 left out the reward amounts and every US Bank
// offer showed "No listed value"; the details and terms for export were missing
// the same way. Field names follow a local capture (2026-09); values are synthetic.
const fullOffer = id => offer(id, 'NEW', {
    reward: { rewardType: 'PERCENT_AMOUNT_PURCHASE', rewardAmount: 10, maxRewardAmount: 7, activationModel: 'ACTIVATABLE',
        purchaseRequirement: { minSpendAmount: 0.2, merchantUrlLinkClickRequired: false } },
    assets: { copy: { value: { headline: '10% cash back', marketingCopy: 'Synthetic long text', termsAndConditions: 'Synthetic terms' } } }
});

test('the synthetic GraphQL answer keeps only selected fields', () => {
    const selection = graphqlSelection('query q($r: R) { list(request: $r) { id nested { kept } } }');
    assert.deepEqual(selection, { list: { id: true, nested: { kept: true } } });
    const answer = answerSelectedFields({ data: { list: [{ id: 1, dropped: 2, nested: { kept: 3, dropped: 4 } }] } }, 'query { list { id nested { kept } } }');
    assert.deepEqual(answer, { data: { list: [{ id: 1, nested: { kept: 3 } }] } });
    assert.deepEqual(answerSelectedFields({ errors: [{ message: 'x' }] }, 'query { list { id } }'), { errors: [{ message: 'x' }] });
});

test('a US Bank scan asks for every field the offer list reads: reward amounts, details and terms', async () => {
    const harness = createHarness(() => jsonResponse(listing([fullOffer('a')])));
    await harness.scanOffers();
    const [scanned] = harness.state.offers;
    assert.deepEqual(JSON.parse(JSON.stringify(scanned.reward)), { kind: 'percent', amount: 10, maxReward: 7, minSpend: null });
    assert.equal(scanned.details, 'Synthetic long text');
    assert.equal(scanned.terms, 'Synthetic terms');
    assert.equal(scanned.status, 'AVAILABLE', 'the activation checks still read their fields');
});
