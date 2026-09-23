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

test('canceled cards are never listed, while active supplementary cards under a canceled card are', () => {
    const harness = createUserscriptHarness();
    const withStatus = (token, status) => ({ ...rawAccount(token), status });
    const canceledBasic = withStatus('card-canceled', { account_status: ['Canceled'] });
    canceledBasic.supplementary_accounts = [withStatus('card-supplementary', { account_status: ['Active'] }),
        withStatus('card-canceled-supplementary', { account_status: ['Active'], card_status: ['CANCELED'] }), 'not-an-account'];
    const accounts = harness.normalizeAccounts([canceledBasic, withStatus('card-a', { account_status: ['Active'] }), rawAccount('card-no-status')]);
    assert.deepEqual(Array.from(accounts, (account) => account.token), ['card-supplementary', 'card-a', 'card-no-status']);
});

test('page data and the member request both drop canceled cards', async () => {
    const page = pageState();
    page.modules['axp-consumer-context-switcher'].products.details.types.CARD_PRODUCT.productsList.second.status = { account_status: ['Canceled'] };
    const fromPage = createUserscriptHarness(undefined, { initialState: JSON.stringify(transit(page)) });
    await fromPage.detectCards();
    assert.deepEqual(Array.from(fromPage.state.accounts, (account) => account.token), ['card-a']);
    assert.equal(fromPage.requests.length, 0);
    const onlyCanceled = { ...rawAccount('card-a'), status: { account_status: ['Canceled'] } };
    const fromMember = createUserscriptHarness(() => jsonResponse({ accounts: [onlyCanceled] }));
    await fromMember.detectCards();
    assert.equal(fromMember.requests.length, 1);
    assert.equal(fromMember.state.detected, false);
    assert.match(fromMember.state.status, /No active cards were found/);
});

test('failed detection requires another manual attempt and a minimum delay', async () => {
    const harness = createUserscriptHarness(() => jsonResponse({}, 401));
    await harness.detectCards();
    await harness.detectCards();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.state.busy, null);
    assert.equal(harness.state.detected, false);
    harness.advanceTime(500);
    await harness.detectCards();
    assert.equal(harness.requests.length, 2);
});

test('website whitelist remnants never import selections or create saved cards', async () => {
    for (const value of ['["card-a","old-session-card"]', '{invalid-json', '{}']) {
        const storage = new Map([['card_offer_hub_amex_whitelist_v1', value]]);
        const harness = createUserscriptHarness(undefined, { initialState: pageState(), storage });
        harness.restoreLocalSettings();
        assert.equal(harness.state.detected, false);
        assert.equal(harness.state.whitelist.size, 0);
        assert.equal(harness.state.savedCardsError, '');
        assert.equal(harness.userscriptStorage.size, 0);
        await harness.detectCards();
        assert.equal(harness.state.whitelist.size, 0);
        harness.setCardWhitelisted('card-b', true);
        assert.deepEqual(harness.userscriptStorage.get(harness.SETTINGS.savedCardsKey).whitelist, ['card-b']);
        assert.equal(harness.requests.length, 0);
    }
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
