async function scanCardOffers(accounts) {
    state.needsScan = true;
    // Cached account IDs are display data until verified against this login.
    if (state.restoredWorkspace) {
        updateStatus('Checking your saved cards against the current Citi login…');
        const payload = await requestJson(SETTINGS.retrievePath, {});
        ensureRunning();
        adoptDetectedCards(normalizeAccounts(payload));
        if (accounts.some(card => !state.selected.has(card.accountId))) {
            throw new Error('Saved cards do not match this login. Review your card selections and refresh all cards & offers.');
        }
    }
    state.confirmed = 0;
    state.completed = 0;
    state.total = 0;
    for (const [index, card] of accounts.entries()) {
        ensureRunning();
        updateStatus(`Scanning card ${index + 1}/${accounts.length}; requests are spaced ${SETTINGS.gapMilliseconds / 1000} seconds apart…`);
        const payload = await requestJson(SETTINGS.retrievePath, { accountId: card.accountId });
        ensureRunning();
        const scannedOffers = normalizeOffers(payload, card.accountId);
        state.offers = state.offers.filter(offer => offer.accountId !== card.accountId).concat(scannedOffers);
        requireWorkspaceSaved();
    }
    state.needsScan = false;
    state.continuationBlocked = false;
    recordWorkspaceScan();
    renderPanel();
}
function scanOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length) return;
    return runExclusive(async () => {
        await scanCardOffers(accounts);
        updateStatus(`Scan complete: ${state.offers.filter(offer => state.selected.has(offer.accountId) && offer.status === 'AVAILABLE').length} available across ${accounts.length} selected cards.`);
    });
}
function canContinueSavedOffers() {
    return state.restoredWorkspace && !state.continuationBlocked && state.lastScanAt > 0 && state.selected.size > 0
        && !state.offers.some(offer => state.selected.has(offer.accountId) && offer.status === 'UNCONFIRMED');
}
