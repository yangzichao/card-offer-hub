async function readChaseCardOffers(accounts, identity) {
    const offers = [];
    chaseReadScope = { identity, accountIds: new Set(accounts.map(card => card.accountId)) };
    state.confirmed = 0;
    state.completed = 0;
    state.total = 0;
    try {
        for (const [index, card] of accounts.entries()) {
            ensureChaseReadSession(card.accountId);
            updateStatus(`Loading card ${index + 1}/${accounts.length}…`);
            const payload = await requestJson(buildOffersRequest(card.accountId));
            ensureChaseReadSession(card.accountId);
            offers.push(...normalizeOffers(payload, card.accountId, identity));
        }
        return offers;
    } finally {
        chaseReadScope = null;
    }
}
async function refreshChaseWorkspace() {
    const accounts = normalizeAccounts(getCapturedAccountsPayload());
    const identity = currentSession().enterprisePartyIdentifier;
    const sameCustomer = state.workspaceScope === identity;
    const selected = hubSelectDetectedCards(accounts, sameCustomer ? state.accounts : [],
        sameCustomer ? state.selected : new Set());
    // Keep the last complete workspace until every card has been read.
    const offers = await readChaseCardOffers(accounts, identity);
    ensureRunning();
    bindWorkspaceScope(identity);
    state.accounts = accounts;
    state.selected = selected;
    state.offers = offers;
    state.sessionIdentity = identity;
    state.needsScan = false;
    recordWorkspaceScan();
    renderPanel();
}
function refreshAllCardsAndOffers() {
    return runExclusive(async () => {
        await refreshChaseWorkspace();
        updateStatus(`Loaded ${state.accounts.length} cards and ${state.offers.length} offers. Choose your cards, then add saved offers.${chaseUnsupportedClickNotice()}`);
    });
}
function refreshAndAddOffers() {
    return runExclusive(async () => {
        const previousIdentity = state.workspaceScope;
        await refreshChaseWorkspace();
        if (previousIdentity && previousIdentity !== state.workspaceScope) {
            updateStatus('Loaded the current Chase account. Review your cards, then use Add saved offers.');
            return;
        }
        await enrollPlannedChaseOffers();
    }, 'add');
}
