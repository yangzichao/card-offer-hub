const runExclusive = createHubActionRunner({
    state, settings: SETTINGS, ensureRunning, restorePacing, saveWorkspace,
    render: () => renderPanel(), updateStatus, supportsActivation: SETTINGS.capabilities.activation
});

function setOfferSelected(offerId, selected) {
    if (state.busy || Boolean(state.storageError) || !state.offers.some(offer => offer.offerId === offerId && offer.status === 'AVAILABLE')) return;
    if (selected) state.selected.add(offerId); else state.selected.delete(offerId);
    saveWorkspace();
    renderPanel();
}
function selectAllOffers() {
    if (state.busy || Boolean(state.storageError)) return;
    // Offers hidden by the small-offer filter are not selected; search does not narrow it.
    state.selected = new Set(state.offers.filter(offer => offer.status === 'AVAILABLE'
        && hubRewardPassesFilter(offer.reward, state.offerView)).map(offer => offer.offerId));
    saveWorkspace();
    renderPanel();
}
