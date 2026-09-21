async function prepareChaseSavedOffers() {
    const identity = currentSession().enterprisePartyIdentifier;
    const currentAccounts = normalizeAccounts(getCapturedAccountsPayload());
    const selectedAccounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (identity !== state.workspaceScope || selectedAccounts.some(card =>
        !currentAccounts.some(current => current.accountId === card.accountId))) {
        throw new Error('Saved cards do not match this login. Use Refresh & add offers to load the current cards. Your saved results are preserved.');
    }
    // Refresh credentials inside this explicit action, including after reload or
    // failure. Only offers already available in the saved scope can be added.
    const freshOffers = await readChaseCardOffers(selectedAccounts, identity);
    state.offers = reconcileChaseSavedOffers(freshOffers, state.selected);
    state.sessionIdentity = identity;
    state.needsScan = false;
    recordWorkspaceScan();
    renderPanel();
}
function reconcileChaseSavedOffers(freshOffers, accountIds) {
    const freshByKey = new Map(freshOffers.map(offer => [workspaceOfferKey(offer), offer]));
    return state.offers.map(offer => {
        if (!accountIds.has(offer.accountId)) return offer;
        const fresh = freshByKey.get(workspaceOfferKey(offer));
        if (fresh?.status === 'ACTIVATED') return fresh;
        if (!['NEW', 'SERVED'].includes(offer.status)) return offer;
        return fresh || { ...offer, status: 'UNAVAILABLE', activationParameters: null };
    });
}
function addSavedOffers() {
    if (!state.selected.size || !offerWorkflow.preview().length) return;
    return runExclusive(async () => {
        await prepareChaseSavedOffers();
        await enrollPlannedChaseOffers({ savedScope: true });
    }, 'add');
}
