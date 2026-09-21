async function scanCardOffers(accounts) {
    state.needsScan = true;
    // Cached account IDs are display data until verified against this login.
    if (state.restoredWorkspace) {
        await verifySelectedCards(accounts);
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
