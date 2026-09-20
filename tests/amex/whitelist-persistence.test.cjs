const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse } = require('./helpers/userscript-harness.cjs');
const { hubResponse } = require('./fixtures/synthetic-offers.cjs');

function rawAccount(token) {
    return { account_token: token, product: { description: `Test ${token}` } };
}

async function savedSelection(options = {}) {
    const harness = createUserscriptHarness(undefined, {
        initialState: { accounts: ['card-a', 'card-b'].map(rawAccount) }, ...options
    });
    harness.restoreLocalSettings();
    await harness.detectCards();
    harness.setCardWhitelisted('card-a', true);
    return harness;
}

test('reload restores the catalog and explicit whitelist without page data or any request', async () => {
    const previousVisit = await savedSelection();
    const nextVisit = createUserscriptHarness(undefined, { userscriptStorage: previousVisit.userscriptStorage });
    nextVisit.restoreLocalSettings();
    assert.equal(nextVisit.state.detected, true);
    assert.equal(nextVisit.state.accounts.length, 2);
    assert.deepEqual([...nextVisit.state.whitelist], ['card-a']);
    assert.equal(nextVisit.state.savedCardsReady, true);
    assert.equal(nextVisit.state.offersByAccount.size, 0);
    await nextVisit.detectCards();
    assert.equal(nextVisit.requests.length, 0, 'ordinary detection remains a no-op after restoring');
    assert.match(nextVisit.state.status, /Restored 2 cards, 1 whitelist selections and your offer priority/);
});

test('restored cards can immediately be scanned, with only approved cards entering the queue', async () => {
    const previousVisit = await savedSelection();
    const nextVisit = createUserscriptHarness((request) => jsonResponse(hubResponse(
        request.body.requestType === 'OFFERSHUB_LANDING' ? 'recommendedOffers' : 'addedToCardViewAll', []
    )), { userscriptStorage: previousVisit.userscriptStorage });
    nextVisit.restoreLocalSettings();
    await nextVisit.startScan();
    assert.equal(nextVisit.requests.length, 2);
    assert.ok(nextVisit.requests.every((request) => request.body.accountNumberProxy === 'card-a'));
    assert.equal(nextVisit.state.scanReports.get('card-a'), 'Complete');
});

test('new first-time visits do not auto-detect, save, or select cards', () => {
    const harness = createUserscriptHarness(undefined, { initialState: { accounts: [rawAccount('card-a')] } });
    harness.restoreLocalSettings();
    assert.equal(harness.state.detected, false);
    assert.equal(harness.state.accounts.length, 0);
    assert.equal(harness.userscriptStorage.size, 0);
    assert.equal(harness.requests.length, 0);
});

test('first-time settings can be saved even when website storage is blocked', async () => {
    const harness = await savedSelection({ localStorageReadError: true });
    assert.equal(harness.state.savedCardsError, '');
    assert.deepEqual(harness.userscriptStorage.get(harness.SETTINGS.savedCardsKey).whitelist, ['card-a']);
});

test('an empty saved whitelist stays empty even with an old non-empty legacy value', async () => {
    const storage = new Map([['card_offer_hub_amex_whitelist_v1', '["card-a"]']]);
    const previousVisit = await savedSelection({ storage });
    previousVisit.setCardWhitelisted('card-a', false);
    const nextVisit = createUserscriptHarness(undefined, { storage, userscriptStorage: previousVisit.userscriptStorage });
    nextVisit.restoreLocalSettings();
    assert.equal(nextVisit.state.detected, true);
    assert.equal(nextVisit.state.whitelist.size, 0);
    await nextVisit.startScan();
    assert.equal(nextVisit.requests.length, 0);
});

test('saved choices survive unavailable or cleared website storage', async () => {
    const previousVisit = await savedSelection();
    const nextVisit = createUserscriptHarness(undefined, {
        userscriptStorage: previousVisit.userscriptStorage, localStorageReadError: true
    });
    nextVisit.restoreLocalSettings();
    assert.equal(nextVisit.state.detected, true);
    assert.deepEqual([...nextVisit.state.whitelist], ['card-a']);
    assert.equal(nextVisit.state.savedCardsError, '');
});

test('force refresh bypasses stale page data, keeps approvals, and excludes missing and new cards', async () => {
    const previousVisit = await savedSelection();
    previousVisit.setCardWhitelisted('card-b', true);
    const nextVisit = createUserscriptHarness(() => jsonResponse({ accounts: [rawAccount('card-b'), rawAccount('card-c')] }), {
        userscriptStorage: previousVisit.userscriptStorage,
        initialState: { accounts: [rawAccount('stale-card')] }
    });
    nextVisit.restoreLocalSettings();
    await Promise.all([nextVisit.detectCards({ forceRefresh: true }), nextVisit.detectCards({ forceRefresh: true })]);
    assert.equal(nextVisit.requests.length, 1);
    assert.match(nextVisit.requests[0].url, /\/member$/);
    assert.deepEqual(Array.from(nextVisit.state.accounts, (account) => account.token), ['card-b', 'card-c']);
    assert.deepEqual([...nextVisit.state.whitelist], ['card-a', 'card-b']);
    assert.deepEqual(Array.from(nextVisit.selectedAccounts(), (account) => account.token), ['card-b']);
    const afterReload = createUserscriptHarness(undefined, { userscriptStorage: nextVisit.userscriptStorage });
    afterReload.restoreLocalSettings();
    assert.deepEqual(Array.from(afterReload.selectedAccounts(), (account) => account.token), ['card-b']);
    assert.equal(afterReload.state.whitelist.has('card-a'), true);
});

test('a temporarily missing card recovers its approval on a later manual refresh', async () => {
    const previousVisit = await savedSelection();
    let accounts = [rawAccount('card-b')];
    const nextVisit = createUserscriptHarness(() => jsonResponse({ accounts }), { userscriptStorage: previousVisit.userscriptStorage });
    nextVisit.restoreLocalSettings();
    await nextVisit.detectCards({ forceRefresh: true });
    assert.equal(nextVisit.selectedAccounts().length, 0);
    accounts = [rawAccount('card-a'), rawAccount('card-b')];
    await nextVisit.detectCards({ forceRefresh: true });
    assert.deepEqual(Array.from(nextVisit.selectedAccounts(), (account) => account.token), ['card-a']);
    assert.ok(nextVisit.requests[1].startedAt - nextVisit.requests[0].startedAt >= 500);
});

for (const [label, response] of [['HTTP error', jsonResponse({}, 500)], ['bad schema', jsonResponse({ unknown: [] })], ['empty catalog', jsonResponse({ accounts: [] })]]) {
    test(`failed force refresh (${label}) keeps the previous persisted snapshot and selections`, async () => {
        const previousVisit = await savedSelection();
        const originalSnapshot = structuredClone(previousVisit.userscriptStorage.get(previousVisit.SETTINGS.savedCardsKey));
        const nextVisit = createUserscriptHarness(() => response, { userscriptStorage: previousVisit.userscriptStorage });
        nextVisit.restoreLocalSettings();
        await nextVisit.detectCards({ forceRefresh: true });
        assert.deepEqual(nextVisit.userscriptStorage.get(nextVisit.SETTINGS.savedCardsKey), originalSnapshot);
        assert.equal(nextVisit.state.accounts.length, 2);
        assert.deepEqual([...nextVisit.state.whitelist], ['card-a']);
        assert.match(nextVisit.state.status, /previous cards and whitelist kept/);
        await nextVisit.detectCards({ forceRefresh: true });
        assert.equal(nextVisit.requests.length, 1, 'failed refresh never automatically retries');
    });
}

test('storage failures are visible and do not claim that an unsaved change persisted', async () => {
    const options = { initialState: { accounts: [rawAccount('card-a')] } };
    const harness = createUserscriptHarness(undefined, options);
    harness.restoreLocalSettings();
    await harness.detectCards();
    options.storageWriteError = true;
    harness.setCardWhitelisted('card-a', true);
    assert.match(harness.state.savedCardsError, /Could not save/);
    const nextVisit = createUserscriptHarness(undefined, { userscriptStorage: harness.userscriptStorage });
    nextVisit.restoreLocalSettings();
    assert.equal(nextVisit.state.whitelist.size, 0);
    options.storageWriteError = false;
    harness.setCardWhitelisted('card-a', true);
    assert.equal(harness.state.savedCardsError, '');
    assert.deepEqual(harness.userscriptStorage.get(harness.SETTINGS.savedCardsKey).whitelist, ['card-a']);
});

test('corrupt saved cards never get silently overwritten and do not erase a valid cooldown', () => {
    const userscriptStorage = new Map([['card_offer_hub_amex_saved_cards_v1', { schemaVersion: 99 }]]);
    const storage = new Map([['card_offer_hub_amex_cooldown_v1', '1700000600000']]);
    const harness = createUserscriptHarness(undefined, { userscriptStorage, storage });
    harness.restoreLocalSettings();
    assert.equal(harness.state.detected, false);
    assert.match(harness.state.savedCardsError, /Saved data was not overwritten/);
    assert.deepEqual(userscriptStorage.get(harness.SETTINGS.savedCardsKey), { schemaVersion: 99 });
    assert.equal(harness.state.cooldownUntil, 1700000600000);
});

test('a userscript storage read failure is visible and never writes an empty replacement', async () => {
    const previousVisit = await savedSelection();
    const originalSnapshot = structuredClone(previousVisit.userscriptStorage.get(previousVisit.SETTINGS.savedCardsKey));
    const nextVisit = createUserscriptHarness(undefined, {
        userscriptStorage: previousVisit.userscriptStorage, storageReadError: true
    });
    nextVisit.restoreLocalSettings();
    assert.match(nextVisit.state.savedCardsError, /Could not restore/);
    assert.deepEqual(nextVisit.userscriptStorage.get(nextVisit.SETTINGS.savedCardsKey), originalSnapshot);
    assert.equal(nextVisit.requests.length, 0);
});

test('userscript sandbox reads account data from unsafeWindow', async () => {
    const harness = createUserscriptHarness(undefined, {
        pageWindow: { __INITIAL_STATE__: { accounts: [rawAccount('page-card')] } }
    });
    await harness.detectCards();
    assert.equal(harness.state.accounts[0].token, 'page-card');
    assert.equal(harness.requests.length, 0);
});
