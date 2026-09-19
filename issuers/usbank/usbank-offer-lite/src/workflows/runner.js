async function runExclusive(action) {
    if (state.busy) return;
    let workspaceActionStarted = false;
    state.busy = true;
    state.stopRequested = false;
    renderPanel();
    try {
        if (!navigator.locks?.request) throw new Error('This browser does not support the required tab lock. Use current Chrome.');
        await navigator.locks.request(SETTINGS.id, { ifAvailable: true }, async lock => {
            if (!lock) throw new Error('The script is running in another tab. Wait for it to finish.');
            restorePacing();
            if (state.storageError) throw new Error(state.storageError);
            ensureRunning();
            workspaceActionStarted = true;
            await action();
        });
    } catch (error) {
        state.needsScan = true;
        updateStatus(error.message);
    } finally {
        state.busy = false;
        if (workspaceActionStarted) saveWorkspace();
        renderPanel();
    }
}
function setOfferSelected(offerId, selected) {
    if (state.busy || Boolean(state.storageError) || !state.offers.some(offer => offer.offerId === offerId && offer.status === 'AVAILABLE')) return;
    if (selected) state.selected.add(offerId); else state.selected.delete(offerId);
    saveWorkspace();
    renderPanel();
}
function selectAllOffers() {
    if (state.busy || Boolean(state.storageError)) return;
    state.selected = new Set(state.offers.filter(offer => offer.status === 'AVAILABLE').map(offer => offer.offerId));
    saveWorkspace();
    renderPanel();
}
