function adoptDetectedCards(accounts) {
    const availableIds = new Set(accounts.map(card => card.accountId));
    state.accounts = accounts;
    state.selected = new Set([...state.selected].filter(id => availableIds.has(id)));
    state.offers = state.offers.filter(offer => availableIds.has(offer.accountId));
    state.restoredWorkspace = false;
    requireWorkspaceSaved();
}
function detectCards() {
    return runExclusive(async () => {
        updateStatus('Detecting eligible cards…');
        const payload = await requestJson(SETTINGS.retrievePath, {});
        ensureRunning();
        adoptDetectedCards(normalizeAccounts(payload));
        updateStatus(`Detected ${state.accounts.length} cards. Your existing card selections were preserved.`);
    });
}
async function scanSelectedCards(accounts) {
    state.needsScan = true;
    // Cached account IDs are display data until verified against this login.
    if (state.restoredWorkspace) {
        const payload = await requestJson(SETTINGS.retrievePath, {});
        ensureRunning();
        adoptDetectedCards(normalizeAccounts(payload));
        if (accounts.some(card => !state.selected.has(card.accountId))) {
            throw new Error('Saved cards do not match this login. Review your card selections and scan again.');
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
    recordWorkspaceScan();
    renderPanel();
}
function scanOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length) return;
    return runExclusive(async () => {
        await scanSelectedCards(accounts);
        updateStatus(`Scan complete: ${state.offers.filter(offer => state.selected.has(offer.accountId) && offer.status === 'AVAILABLE').length} available across ${accounts.length} selected cards.`);
    });
}
function addAllOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length || state.needsScan) return;
    return runExclusive(async () => {
        await scanSelectedCards(accounts);
        const queue = state.offers.filter(offer => state.selected.has(offer.accountId) && offer.status === 'AVAILABLE');
        state.total = queue.length;
        for (const offer of queue) {
            ensureRunning();
            updateStatus(`Adding ${state.completed + 1}/${state.total}: ${offer.merchant}. Waiting for the next request slot…`);
            try {
                markWorkspaceOfferPending(offer);
                const payload = await requestJson(SETTINGS.enrollmentPath, enrollmentBody(offer));
                if (!enrollmentConfirmed(payload, offer)) throw new Error('Enrollment was not explicitly confirmed. Scan again before continuing.');
                offer.status = 'ENROLLED';
                state.confirmed++;
                state.completed++;
                finishWorkspaceOffer(offer);
                renderPanel();
            } catch (error) {
                if (offer.status !== 'ENROLLED') offer.status = 'UNCONFIRMED';
                throw error;
            }
        }
        ensureRunning();
        updateStatus(`Finished: ${state.confirmed}/${state.total} confirmed. Refresh Citi's page to update its offer badges.`);
    });
}
