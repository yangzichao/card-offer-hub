function renderCitiActions(panel) {
    const hasCards = state.accounts.length > 0;
    const hasSelection = state.selected.size > 0;
    const coolingDown = Date.now() < state.cooldownUntil;
    const blocked = state.busy || Boolean(state.storageError) || coolingDown;
    const savedCount = offerWorkflow.preview().length;
    const canUseSaved = canAddSavedOffers() && savedCount > 0;
    const refresh = panel.getElementById('scan');
    hubSetActionLabel(refresh, hasCards ? 'Refresh & add offers' : 'Load cards & offers');
    refresh.title = hasCards ? 'Refresh every card and its offers, then add available offers to your selected cards.' : 'Load your cards and offers so you can choose which cards to use.';
    refresh.disabled = blocked || (hasCards && !hasSelection);
    refresh.classList.toggle('primary', !canUseSaved);
    const add = panel.getElementById('add');
    hubSetActionLabel(add, 'Add saved offers', state.busy ? null : savedCount);
    add.title = 'Add available offers from your saved list without refreshing offers.';
    add.hidden = !hasCards;
    add.disabled = blocked || !canUseSaved;
    add.classList.toggle('primary', canUseSaved);
    const stop = panel.getElementById('stop');
    stop.hidden = !state.busy;
    stop.disabled = !state.busy || state.stopRequested;
    const reason = panel.getElementById('hub-action-reason');
    reason.textContent = state.storageError || state.busy ? ''
        : coolingDown ? 'Citi is asking us to wait. Try again after the cooldown.'
        : !hasCards ? ''
        : savedOffersBlockReason() ? savedOffersBlockReason()
        : !savedCount ? 'No saved offers left to add. Refresh & add offers checks for new ones.'
        : '';
    reason.hidden = !reason.textContent;
    hubRenderSearchControls(panel);
}
