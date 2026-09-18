const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse, configureAccounts } = require('./helpers/userscript-harness.cjs');

const rawAccount = (token) => ({ account_token: token, product: { description: `Test ${token}` } });

function orderOf(harness) {
    return Array.from(harness.prioritizedAccounts(), (account) => account.token);
}

function detectedHarness(tokens = ['card-a', 'card-b', 'card-c'], options = {}) {
    const harness = createUserscriptHarness(() => { throw new Error('Unexpected request'); },
        { initialState: { accounts: tokens.map(rawAccount) }, ...options });
    harness.restoreLocalSettings();
    return harness;
}

async function detectedAndRanked(tokens = ['card-a', 'card-b', 'card-c']) {
    const harness = detectedHarness(tokens);
    await harness.detectCards();
    return harness;
}

function reload(previousVisit, fetchResponse, options = {}) {
    const harness = createUserscriptHarness(fetchResponse, { userscriptStorage: previousVisit.userscriptStorage, ...options });
    harness.restoreLocalSettings();
    return harness;
}

test('detection order is the starting priority, and no reorder happens on its own', async () => {
    const harness = await detectedAndRanked();
    assert.deepEqual(orderOf(harness), ['card-a', 'card-b', 'card-c']);
    assert.deepEqual(harness.userscriptStorage.get(harness.SETTINGS.savedCardsKey).priorityOrder, ['card-a', 'card-b', 'card-c']);
    assert.equal(harness.userscriptStorage.get(harness.SETTINGS.savedCardsKey).schemaVersion, 2);
    assert.equal(harness.requests.length, 0);
});

test('the move buttons reorder one step and stop at both ends without sending a request', async () => {
    const harness = await detectedAndRanked();
    assert.equal(harness.moveCardPriority('card-c', -1), true);
    assert.deepEqual(orderOf(harness), ['card-a', 'card-c', 'card-b']);
    assert.equal(harness.moveCardPriority('card-a', 1), true);
    assert.deepEqual(orderOf(harness), ['card-c', 'card-a', 'card-b']);
    assert.equal(harness.moveCardPriority('card-c', -1), false, 'the top card cannot move up');
    assert.equal(harness.moveCardPriority('card-b', 1), false, 'the last card cannot move down');
    assert.deepEqual(orderOf(harness), ['card-c', 'card-a', 'card-b']);
    assert.equal(harness.requests.length, 0);
});

test('dragging lands after the target going down and before it going up', async () => {
    const harness = await detectedAndRanked(['card-a', 'card-b', 'card-c', 'card-d']);
    harness.dropCardPriority('card-a', 'card-c');
    assert.deepEqual(orderOf(harness), ['card-b', 'card-c', 'card-a', 'card-d']);
    harness.dropCardPriority('card-d', 'card-c');
    assert.deepEqual(orderOf(harness), ['card-b', 'card-d', 'card-c', 'card-a']);
    harness.dropCardPriority('card-b', 'card-a');
    assert.deepEqual(orderOf(harness), ['card-d', 'card-c', 'card-a', 'card-b'], 'a drop on the last card moves to the end');
    assert.equal(harness.dropCardPriority('card-d', 'card-d'), false);
});

test('a chosen order survives a reload with no page data and no request', async () => {
    const previousVisit = await detectedAndRanked();
    previousVisit.moveCardPriority('card-c', -1);
    const nextVisit = reload(previousVisit);
    assert.deepEqual(orderOf(nextVisit), ['card-a', 'card-c', 'card-b']);
    assert.equal(nextVisit.requests.length, 0);
    assert.match(nextVisit.state.status, /offer priority/);
});

test('whitelist order follows the priority order, so scanning starts with your top card', async () => {
    const harness = await detectedAndRanked();
    for (const token of ['card-a', 'card-b', 'card-c']) harness.setCardWhitelisted(token, true);
    harness.moveCardPriority('card-c', -1);
    harness.moveCardPriority('card-c', -1);
    assert.deepEqual(Array.from(harness.selectedAccounts(), (account) => account.token), ['card-c', 'card-a', 'card-b']);
});

test('a v1 snapshot upgrades to the detected order without reshuffling or requesting anything', () => {
    const userscriptStorage = new Map([['card_offer_hub_amex_saved_cards_v1', {
        schemaVersion: 1, detected: true, whitelist: ['card-b'],
        accounts: [{ token: 'card-a', cardName: 'Test card-a' }, { token: 'card-b', cardName: 'Test card-b' }]
    }]]);
    const harness = createUserscriptHarness(undefined, { userscriptStorage });
    harness.restoreLocalSettings();
    assert.deepEqual(orderOf(harness), ['card-a', 'card-b']);
    assert.equal(harness.state.savedCardsError, '');
    assert.equal(harness.requests.length, 0);
});

test('a newly detected card joins at the end and never outranks a card you placed', async () => {
    const previousVisit = await detectedAndRanked(['card-a', 'card-b']);
    previousVisit.moveCardPriority('card-b', -1);
    const nextVisit = reload(previousVisit, () => jsonResponse({ accounts: ['card-a', 'card-b', 'new-card'].map(rawAccount) }));
    await nextVisit.detectCards({ forceRefresh: true });
    assert.deepEqual(orderOf(nextVisit), ['card-b', 'card-a', 'new-card']);
    assert.deepEqual(nextVisit.userscriptStorage.get(nextVisit.SETTINGS.savedCardsKey).priorityOrder, ['card-b', 'card-a', 'new-card']);
});

test('a temporarily missing card keeps its rank and returns to the same position', async () => {
    const previousVisit = await detectedAndRanked(['card-a', 'card-b', 'card-c']);
    previousVisit.moveCardPriority('card-c', -1);
    previousVisit.moveCardPriority('card-c', -1);
    const missingVisit = reload(previousVisit, () => jsonResponse({ accounts: ['card-a', 'card-b'].map(rawAccount) }));
    await missingVisit.detectCards({ forceRefresh: true });
    assert.deepEqual(orderOf(missingVisit), ['card-a', 'card-b']);
    const returnedVisit = reload(missingVisit, () => jsonResponse({ accounts: ['card-a', 'card-b', 'card-c'].map(rawAccount) }));
    await returnedVisit.detectCards({ forceRefresh: true });
    assert.deepEqual(orderOf(returnedVisit), ['card-c', 'card-a', 'card-b']);
});

test('reordering is refused while a run is active, and a corrupt saved order is not silently accepted', async () => {
    const harness = await detectedAndRanked();
    harness.state.busy = 'scan';
    assert.equal(harness.moveCardPriority('card-c', -1), false);
    assert.deepEqual(orderOf(harness), ['card-a', 'card-b', 'card-c']);
    const userscriptStorage = new Map([['card_offer_hub_amex_saved_cards_v1', {
        schemaVersion: 2, detected: true, whitelist: [], priorityOrder: ['card-a', 'card-a'],
        accounts: [{ token: 'card-a', cardName: 'Test card-a' }]
    }]]);
    const corrupt = createUserscriptHarness(undefined, { userscriptStorage });
    corrupt.restoreLocalSettings();
    assert.match(corrupt.state.savedCardsError, /Could not restore/);
    assert.deepEqual(userscriptStorage.get(corrupt.SETTINGS.savedCardsKey).priorityOrder, ['card-a', 'card-a'], 'saved data is never overwritten');
});
