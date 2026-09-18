function normalizeAccounts(accountList) {
    const accounts = new Map();
    function visit(account) {
        if (!account || typeof account !== 'object') return;
        if (typeof account.account_token === 'string' && account.account_token) {
            const cardType = account.product?.description || 'Amex card';
            const cardholder = account.profile?.first_name || '';
            const displayNumber = account.account?.display_account_number || '';
            accounts.set(account.account_token, {
                token: account.account_token,
                cardName: [cardType, cardholder, displayNumber ? `(${displayNumber})` : ''].filter(Boolean).join(' · ')
            });
        }
        if (Array.isArray(account.supplementary_accounts)) account.supplementary_accounts.forEach(visit);
    }
    accountList.forEach(visit);
    return [...accounts.values()];
}

function accountsFromPage(pageState) {
    for (const moduleName of ['axp-consumer-context-switcher', 'axp-loyalty-root']) {
        const products = pageState?.modules?.[moduleName]?.products?.details?.types?.CARD_PRODUCT?.productsList;
        if (products && typeof products === 'object') {
            const accounts = normalizeAccounts(Object.values(products));
            if (accounts.length) return accounts;
        }
    }
    return Array.isArray(pageState?.accounts) ? normalizeAccounts(pageState.accounts) : [];
}

async function detectAccountSnapshot({ forceRefresh = false } = {}) {
    if (!forceRefresh) {
        try {
            const accounts = accountsFromPage(readPageState());
            if (accounts.length) return { accounts, source: 'existing page data; no network request' };
        } catch {
            log('Page card data is unavailable. Trying one account-list request.');
        }
    }
    // One fallback or explicit refresh request; never iterate through cards here.
    const member = await requestJson('https://global.americanexpress.com/api/servicing/v1/member');
    if (!Array.isArray(member?.accounts)) throw new Error('Account-list format was not recognized. Open the Amex Offers page and reload.');
    const accounts = normalizeAccounts(member.accounts);
    if (!accounts.length) throw new Error('No cards were found in this session.');
    return { accounts, source: 'one account-list request' };
}
