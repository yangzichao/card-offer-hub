function savedOffersBlockReason() {
    if (!state.selected.size) return 'Choose at least one card above. Your choices stay saved.';
    const selectedOffers = state.offers.filter(offer => state.selected.has(offer.accountId));
    const unconfirmedCount = selectedOffers.filter(offer => offer.status === 'UNCONFIRMED').length;
    if (unconfirmedCount) return `${unconfirmedCount} saved offer(s) have an unconfirmed add result. Use Refresh & add offers to check their status before continuing.`;
    const conflictCount = selectedOffers.filter(offer => offer.status === 'CONFLICT').length;
    if (conflictCount) return `Citi returned conflicting statuses for ${conflictCount} saved offer(s). Use Refresh & add offers to check their status before continuing.`;
    if (!state.lastScanAt) return 'The first offer refresh did not finish. Use Refresh & add offers to complete it.';
    if (state.continuationBlocked) return 'The previous operation did not complete successfully. Use Refresh & add offers to check before continuing.';
    if (state.needsScan && !state.restoredWorkspace) return 'The offer refresh did not finish. Use Refresh & add offers to complete it.';
    return '';
}
function canAddSavedOffers() { return !savedOffersBlockReason(); }
function addSavedOffers() {
    if (!canAddSavedOffers() || !offerWorkflow.preview().length) return;
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    return runExclusive(async () => {
        try {
            // Verify card ownership only. This path deliberately keeps the saved offer list.
            await verifySelectedCards(accounts);
            state.needsScan = false;
            await enrollPlannedOffers();
        } catch (error) {
            if (error.name === 'CitiActionStopped' && !savedOffersBlockReason()) {
                error.canResumeSavedOffers = true;
                error.message = 'Stopped. Your progress is saved. Use Add saved offers to continue.';
            }
            throw error;
        }
    }, 'add');
}
