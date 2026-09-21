function savedOffersBlockReason() {
    if (!state.selected.size) return 'Choose at least one card above. Your choices stay saved.';
    return '';
}
function canAddSavedOffers() { return !savedOffersBlockReason(); }
function addSavedOffers() {
    if (!canAddSavedOffers() || !offerWorkflow.preview().length) return;
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    return runExclusive(() => withSavedOfferContinuation(async () => {
        // Each explicit click can recover without first asking for another button.
        await prepareSavedOfferContinuation(accounts);
        await enrollPlannedOffers();
    }), 'add');
}
async function withSavedOfferContinuation(action) {
    try {
        await action();
    } catch (error) {
        if (error.name === 'CitiActionStopped' && !state.continuationBlocked
            && (!state.needsScan || state.restoredWorkspace)) {
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
