const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { rawOffer } = require('./fixtures/synthetic-offers.cjs');

function sharedOffer(harness, identifier, status = 'NOT_ENROLLED', overrides = {}) {
    return harness.normalizeHubOffer(rawOffer(identifier, status, { title: 'Same merchant', ...overrides }));
}

test('the same offer with different per-card identifiers groups and counts distinct eligible cards', () => {
    const harness = createUserscriptHarness();
    configureAccounts(harness, ['card-a', 'card-b', 'card-c']);
    for (const token of ['card-a', 'card-b', 'card-c']) {
        harness.state.offersByAccount.set(token, [sharedOffer(harness, `${token}-id`, token === 'card-c' ? 'ENROLLED' : 'NOT_ENROLLED')]);
        harness.state.scanReports.set(token, 'Complete');
    }
    const groups = harness.groupedOffers();
    assert.equal(groups.length, 1);
    assert.equal(harness.offerGroupCounts(groups[0].accounts).eligibleCards, 2);
    assert.equal(harness.offerGroupCounts(groups[0].accounts).enrolledCards, 1);
    assert.equal(harness.offerGroupCounts(groups[0].accounts).seenCards, 3);
    assert.equal(harness.enrollmentCandidates().length, 2);
    assert.deepEqual(Array.from(harness.enrollmentPlan(), ({ account }) => account.token), [],
        'card-c already has this offer, so no other card takes it again');
    assert.match(harness.filteredOfferSummary(groups, harness.enrollmentPlan().length), /1 distinct offers · 1 eligible · 0 planned on one card each · 2 eligible cards/);
});

test('whitespace does not split a shared offer but different rewards or terms do', () => {
    const harness = createUserscriptHarness();
    const first = sharedOffer(harness, 'first');
    const same = sharedOffer(harness, 'second', 'NOT_ENROLLED', { title: ' Same   merchant ', terms: { details: 'Synthetic\n terms' } });
    const different = sharedOffer(harness, 'third', 'NOT_ENROLLED', { shortDescription: 'Spend $100, receive $20' });
    assert.equal(first.groupKey, same.groupKey);
    assert.notEqual(first.groupKey, different.groupKey);
});

test('card counts cover all its offers regardless of the offer search filter', () => {
    const harness = createUserscriptHarness();
    configureAccounts(harness);
    harness.state.offersByAccount.set('card-a', [sharedOffer(harness, 'eligible'), sharedOffer(harness, 'added', 'ENROLLED')]);
    harness.state.scanReports.set('card-a', 'Complete');
    harness.state.filter = 'no-match';
    assert.equal(harness.groupedOffers().length, 0);
    const counts = harness.accountOfferCounts('card-a');
    assert.equal(counts.eligible, 1);
    assert.equal(counts.enrolled, 1);
    assert.equal(counts.total, 2);
    assert.equal(counts.complete, true);
});

test('partial observed eligibility is visible without implying zero eligibility for unscanned cards', () => {
    const harness = createUserscriptHarness();
    configureAccounts(harness, ['card-a', 'card-b']);
    harness.state.offersByAccount.set('card-a', [sharedOffer(harness, 'eligible')]);
    harness.state.scanReports.set('card-a', 'Incomplete');
    assert.equal(harness.accountOfferCounts('card-a').eligible, 1);
    assert.equal(harness.accountOfferCounts('card-a').complete, false);
    assert.equal(harness.accountOfferCounts('card-b'), null);
    const group = harness.groupedOffers()[0];
    assert.equal(harness.offerGroupCounts(group.accounts).eligibleCards, 1);
    assert.equal(harness.offerGroupCounts(group.accounts).addable, 0);
    assert.match(harness.filteredOfferSummary([group], harness.enrollmentPlan().length), /Coverage: 0\/2 cards fully scanned — counts so far/);
});

test('per-offer eligibility counts cards once even if a card contains duplicate group entries', () => {
    const harness = createUserscriptHarness();
    const account = { token: 'card-a' };
    const offer = sharedOffer(harness, 'eligible');
    const counts = harness.offerGroupCounts([{ account, offer }, { account, offer }]);
    assert.equal(counts.eligibleCards, 1);
    assert.equal(counts.seenCards, 1);
});
