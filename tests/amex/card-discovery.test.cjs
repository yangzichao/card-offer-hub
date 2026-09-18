const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createUserscriptHarness, jsonResponse } = require('./helpers/userscript-harness.cjs');

function rawAccount(token) {
    return { account_token: token, product: { description: 'Test Gold' }, profile: { first_name: 'TEST' }, account: { display_account_number: '12345' } };
}
function pageState() {
    return { modules: { 'axp-consumer-context-switcher': { products: { details: { types: { CARD_PRODUCT: {
        productsList: { first: rawAccount('card-a'), second: rawAccount('card-b') }
    } } } } } } };
}
function transit(value) {
    if (Array.isArray(value)) return ['~#iL', value.map(transit)];
    if (value && typeof value === 'object') return ['~#iM', Object.entries(value).flatMap(([key, item]) => [key, transit(item)])];
    return value;
}

test('manual detection reads the current page once, with no offer requests or automatic whitelist', async () => {
    const harness = createUserscriptHarness(undefined, { initialState: JSON.stringify(transit(pageState())) });
    assert.equal(harness.state.detected, false);
    await harness.detectCards();
    assert.equal(harness.state.accounts.length, 2);
    assert.equal(harness.state.whitelist.size, 0);
    assert.equal(harness.requests.length, 0);
    harness.window.__INITIAL_STATE__ = { accounts: [rawAccount('card-c')] };
    await harness.detectCards();
    assert.equal(harness.state.accounts.length, 2);
    assert.equal(harness.state.accounts[0].token, 'card-a');
});

test('one fallback member request detects nested cards without fetching any offers', async () => {
    const account = rawAccount('card-a');
    account.supplementary_accounts = [rawAccount('card-b')];
    const harness = createUserscriptHarness(() => jsonResponse({ accounts: [account, rawAccount('card-b')] }));
    await Promise.all([harness.detectCards(), harness.detectCards()]);
    assert.equal(harness.requests.length, 1);
    assert.match(harness.requests[0].url, /\/member$/);
    assert.equal(harness.state.accounts.length, 2);
    assert.equal(harness.state.offersByAccount.size, 0);
    assert.equal(harness.state.busy, null);
});

test('failed detection requires another manual attempt and a minimum delay', async () => {
    const harness = createUserscriptHarness(() => jsonResponse({}, 401));
    await harness.detectCards();
    await harness.detectCards();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.busy, null);
    assert.equal(harness.state.detected, false);
    harness.advanceTime(15000);
    await harness.detectCards();
    assert.equal(harness.requests.length, 2);
});

test('legacy whitelist migrates without losing absent cards; editing it sends no requests', async () => {
    const storage = new Map([['card_offer_hub_amex_whitelist_v1', '["card-a","old-session-card"]']]);
    const harness = createUserscriptHarness(undefined, { initialState: pageState(), storage });
    harness.restoreLocalSettings();
    await harness.detectCards();
    assert.deepEqual([...harness.state.whitelist], ['card-a', 'old-session-card']);
    assert.deepEqual(Array.from(harness.selectedAccounts(), (account) => account.token), ['card-a']);
    harness.setCardWhitelisted('card-b', true);
    assert.equal(harness.state.whitelist.size, 3);
    assert.deepEqual(harness.userscriptStorage.get(harness.SETTINGS.savedCardsKey).whitelist, ['card-a', 'old-session-card', 'card-b']);
    assert.equal(harness.requests.length, 0);
});

test('old offer caches and blocklists never opt cards in', async () => {
    const storage = new Map([['amex_offer_lite_blocklist', '[]'], ['amex_offer_lite_offer_cache', '{"accounts":[{"token":"card-a"}]}']]);
    const harness = createUserscriptHarness(undefined, { initialState: pageState(), storage });
    harness.restoreLocalSettings();
    await harness.detectCards();
    assert.equal(harness.state.whitelist.size, 0);
    await harness.startScan();
    assert.equal(harness.requests.length, 0);
});
