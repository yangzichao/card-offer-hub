function renderChaseActions(panel) {
    const hasCards = state.accounts.length > 0;
    const hasSelection = state.selected.size > 0;
    const coolingDown = Date.now() < state.cooldownUntil;
    const blocked = state.busy || Boolean(state.storageError) || coolingDown;
    const savedCount = offerWorkflow.preview().length;
    const canUseSaved = hasSelection && savedCount > 0;
    const refresh = panel.getElementById('scan');
    hubSetActionLabel(refresh, hasCards ? 'Refresh & add offers' : 'Load cards & offers');
    refresh.title = hasCards ? 'Refresh every card and its offers, then add available offers to your selected cards.'
        : 'Load your cards and offers. All cards start selected; you can uncheck any card.';
    refresh.disabled = blocked || (hasCards && !hasSelection);
    refresh.classList.toggle('primary', !canUseSaved);
    const add = panel.getElementById('add');
    hubSetActionLabel(add, 'Add saved offers', state.busy ? null : savedCount);
    add.title = 'Check the current status of your saved offers, then add the ones still available. Previously unconfirmed offers are not retried.';
    add.hidden = !hasCards;
    add.disabled = blocked || !canUseSaved;
    add.classList.toggle('primary', canUseSaved);
    const stop = panel.getElementById('stop');
    stop.hidden = !state.busy;
    stop.disabled = !state.busy || state.stopRequested;
    const unresolved = state.offers.filter(offer => state.selected.has(offer.accountId)
        && ['UNCONFIRMED', 'CONFLICT'].includes(offer.status)).length;
    const reason = panel.getElementById('hub-action-reason');
    reason.textContent = state.storageError || state.busy || !hasCards ? ''
        : coolingDown ? 'Chase is asking us to wait. Try again after the cooldown.'
        : !hasSelection ? 'Choose at least one card above. Your choices stay saved.'
        : unresolved ? `${unresolved} offer(s) need review and will be skipped. Other saved offers can continue. Use Refresh & add offers to check them.`
        : !savedCount ? 'No saved offers left to add. Refresh & add offers checks for new ones.' : '';
    reason.hidden = !reason.textContent;
    hubRenderTaskProgress(panel, { busy: Boolean(state.busy), completed: state.completed, total: state.total });
    hubRenderSearchControls(panel);
}
