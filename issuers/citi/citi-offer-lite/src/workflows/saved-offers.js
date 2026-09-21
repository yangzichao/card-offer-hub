function savedOffersBlockReason() {
    if (!state.selected.size) return 'Choose at least one card above. Your choices stay saved.';
    if (!state.lastScanAt) return 'The first offer refresh did not finish. Use Refresh & add offers to complete it.';
    if (state.continuationBlocked) return 'The previous operation did not complete successfully. Use Refresh & add offers to check before continuing.';
    if (state.needsScan && !state.restoredWorkspace) return 'The offer refresh did not finish. Use Refresh & add offers to complete it.';
    return '';
}
function canAddSavedOffers() { return !savedOffersBlockReason(); }
function addSavedOffers() {
    if (!canAddSavedOffers() || !offerWorkflow.preview().length) return;
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    return runExclusive(() => withSavedOfferContinuation(async () => {
        // Verify card ownership only. Keep the saved list and skip unresolved entries.
        await verifySelectedCards(accounts);
        state.needsScan = false;
        await enrollPlannedOffers();
    }), 'add');
}
async function withSavedOfferContinuation(action) {
    try {
        await action();
    } catch (error) {
        if (error.name === 'CitiActionStopped' && !savedOffersBlockReason()) {
            error.canResumeSavedOffers = true;
            error.message = 'Stopped. Your progress is saved. Use Add saved offers to continue.';
        }
        throw error;
    }
}
function savedOffersReviewNotice() {
    const unresolved = state.offers.filter(offer => state.selected.has(offer.accountId)
        && ['UNCONFIRMED', 'CONFLICT'].includes(offer.status)).length;
    return unresolved ? `${unresolved} saved offer(s) need a status check and will be skipped. Other available offers can continue. Use Refresh & add offers to check skipped offers.` : '';
}
