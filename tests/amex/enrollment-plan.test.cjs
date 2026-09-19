const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, configureAccounts } = require('./helpers/userscript-harness.cjs');
const { rawOffer } = require('./fixtures/synthetic-offers.cjs');

// Offers with the same title group across cards; a distinct title is card-exclusive.
function withOffers(harness, offerTitlesByCard) {
    for (const [accountToken, titles] of Object.entries(offerTitlesByCard)) {
        harness.state.offersByAccount.set(accountToken, titles.map((title) =>
            harness.normalizeHubOffer(rawOffer(`${title}-${accountToken}`, 'NOT_ENROLLED', { title }))));
        harness.state.scanReports.set(accountToken, 'Complete');
    }
}

function planOf(harness, groupKey = null) {
    return Array.from(harness.enrollmentPlan(groupKey), ({ account, offer }) => `${offer.name}@${account.token}`);
}

function offerOn(harness, accountToken, title) {
    return harness.state.offersByAccount.get(accountToken).find((offer) => offer.name === title);
}

function preparedHarness(offerTitlesByCard, cardPriority = null) {
    const harness = createUserscriptHarness();
    configureAccounts(harness, Object.keys(offerTitlesByCard));
    withOffers(harness, offerTitlesByCard);
    if (cardPriority) harness.state.cardPriority = cardPriority;
    return harness;
}

test('a shared offer goes to the highest-priority card, and reordering moves it', () => {
    const harness = preparedHarness({ 'card-a': ['Shared'], 'card-b': ['Shared'], 'card-c': ['Shared'] });
    assert.deepEqual(planOf(harness), ['Shared@card-a']);
    harness.state.cardPriority = ['card-c', 'card-b', 'card-a'];
    assert.deepEqual(planOf(harness), ['Shared@card-c']);
});

test('an offer only one card has always goes to that card, whatever its rank', () => {
    const harness = preparedHarness({ 'card-a': ['Shared'], 'card-b': ['Shared', 'Only on B'] },
        ['card-a', 'card-b']);
    assert.deepEqual(planOf(harness), ['Shared@card-a', 'Only on B@card-b']);
});

test('the plan runs through the top card first and is stable within a card', () => {
    const harness = preparedHarness({ 'card-a': ['Zulu only A'], 'card-b': ['Alpha only B', 'Bravo only B'] },
        ['card-b', 'card-a']);
    assert.deepEqual(planOf(harness), ['Alpha only B@card-b', 'Bravo only B@card-b', 'Zulu only A@card-a']);
});

test('an offer already added on any whitelist card is never added again on a lower card', () => {
    const harness = preparedHarness({ 'card-a': ['Shared'], 'card-b': ['Shared'] });
    offerOn(harness, 'card-a', 'Shared').status = 'ENROLLED';
    assert.equal(harness.enrollmentCandidates().length, 1, 'card-b is still an eligible pair on its own');
    assert.deepEqual(planOf(harness), [], 'but the offer is done, so nothing is planned');
});

test('an unconfirmed card blocks the offer until a rescan settles it', () => {
    const harness = preparedHarness({ 'card-a': ['Shared'], 'card-b': ['Shared'] });
    offerOn(harness, 'card-a', 'Shared').status = 'UNCONFIRMED';
    assert.deepEqual(planOf(harness), []);
});

test('a card that definitively refused an offer hands it to the next card', () => {
    const harness = preparedHarness({ 'card-a': ['Shared'], 'card-b': ['Shared'] });
    offerOn(harness, 'card-a', 'Shared').status = 'FAILED';
    assert.deepEqual(planOf(harness), ['Shared@card-b']);
});

test('an incompletely scanned top card is skipped and the next eligible card takes the offer', () => {
    const harness = preparedHarness({ 'card-a': ['Shared'], 'card-b': ['Shared'] });
    harness.state.scanReports.set('card-a', 'Incomplete');
    assert.deepEqual(planOf(harness), ['Shared@card-b']);
});

test('informational offers and cards outside the whitelist are never planned', () => {
    const harness = preparedHarness({ 'card-a': ['Informational'], 'card-b': ['Shared'], 'card-c': ['Shared'] });
    offerOn(harness, 'card-a', 'Informational').enrollable = false;
    harness.state.whitelist.delete('card-b');
    assert.deepEqual(planOf(harness), ['Shared@card-c']);
});

test('display search never narrows Add all, while an explicit single offer remains single', () => {
    const harness = preparedHarness({ 'card-a': ['Shared', 'Only on A'], 'card-b': ['Shared'] });
    assert.deepEqual(planOf(harness), ['Only on A@card-a', 'Shared@card-a']);
    harness.state.filter = 'only on a';
    assert.deepEqual(planOf(harness), ['Only on A@card-a', 'Shared@card-a']);
    assert.equal(harness.groupedOffers().length, 1, 'search narrows only the display');
    harness.state.filter = '';
    assert.deepEqual(planOf(harness, offerOn(harness, 'card-b', 'Shared').groupKey), ['Shared@card-a']);
});

test('duplicate tiles for one card produce one planned request, not two', () => {
    const harness = preparedHarness({ 'card-a': ['Shared'] });
    harness.state.offersByAccount.get('card-a').push(
        harness.normalizeHubOffer(rawOffer('duplicate-id', 'NOT_ENROLLED', { title: 'Shared' })));
    assert.deepEqual(planOf(harness), ['Shared@card-a']);
});
