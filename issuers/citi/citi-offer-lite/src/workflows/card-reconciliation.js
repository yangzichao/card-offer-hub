function citiCardDisplayKey(card) {
    const name = card.name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
    // Names without a masked card suffix cannot reconcile a changed identifier.
    return /(?:^|\D)\d{4}$/.test(name) ? name : '';
}
function reconcileCurrentCards(currentCards) {
    const savedCards = state.accounts;
    const currentIds = new Set(currentCards.map(card => card.accountId));
    const identifierMap = new Map();
    const claimedIds = new Set();
    for (const saved of savedCards) {
        if (currentIds.has(saved.accountId)) {
            identifierMap.set(saved.accountId, saved.accountId);
            claimedIds.add(saved.accountId);
        }
    }
    for (const saved of savedCards) {
        if (identifierMap.has(saved.accountId)) continue;
        const key = citiCardDisplayKey(saved);
        if (!key || savedCards.filter(card => citiCardDisplayKey(card) === key).length !== 1) continue;
        const matches = currentCards.filter(card => citiCardDisplayKey(card) === key);
        if (matches.length !== 1 || claimedIds.has(matches[0].accountId)) continue;
        identifierMap.set(saved.accountId, matches[0].accountId);
        claimedIds.add(matches[0].accountId);
    }
    const previousIdByCurrentId = new Map([...identifierMap].map(([oldId, newId]) => [newId, oldId]));
    const selected = new Set(currentCards.filter(card => !previousIdByCurrentId.has(card.accountId)
        || state.selected.has(previousIdByCurrentId.get(card.accountId))).map(card => card.accountId));
    const offers = state.offers.filter(offer => identifierMap.has(offer.accountId))
        .map(offer => ({ ...offer, accountId: identifierMap.get(offer.accountId) }));
    return { accounts: currentCards, selected, offers, identifierMap };
}
function adoptCurrentWorkspace(workspace) {
    state.accounts = workspace.accounts;
    state.selected = workspace.selected;
    state.offers = workspace.offers;
    state.restoredWorkspace = false;
    state.needsScan = false;
    state.continuationBlocked = false;
    requireWorkspaceSaved();
}
async function retrieveCurrentCardWorkspace() {
    updateStatus('Checking your cards against the current Citi login…');
    const payload = await requestJson(SETTINGS.retrievePath, {});
    ensureRunning();
    return reconcileCurrentCards(normalizeAccounts(payload));
}
async function verifySelectedCards(accounts) {
    const workspace = await retrieveCurrentCardWorkspace();
    if (accounts.some(card => !workspace.identifierMap.has(card.accountId))) {
        throw new Error('Saved cards do not match this login. Your saved offers were kept. Use Refresh & add offers to load the current cards.');
    }
    return workspace;
}
