function canAddSavedOffers() {
    return !state.continuationBlocked && state.lastScanAt > 0 && state.selected.size > 0
        && (!state.needsScan || state.restoredWorkspace)
        && !state.offers.some(offer => state.selected.has(offer.accountId)
            && ['UNCONFIRMED', 'CONFLICT'].includes(offer.status));
}
function addSavedOffers() {
    if (!canAddSavedOffers() || !offerWorkflow.preview().length) return;
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    return runExclusive(async () => {
        // Verify card ownership only. This path deliberately keeps the saved offer list.
        await verifySelectedCards(accounts);
        state.needsScan = false;
        await enrollPlannedOffers();
    }, 'add');
}
