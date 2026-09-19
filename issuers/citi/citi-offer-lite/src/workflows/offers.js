function detectCards() {
    return runExclusive(async () => {
        state.accounts = [];
        state.selected.clear();
        state.offers = [];
        updateStatus('Detecting eligible cards…');
        const payload = await requestJson(SETTINGS.retrievePath, {});
        ensureRunning();
        state.accounts = normalizeAccounts(payload);
        // The default response's offers belong to Citi's default card, never
        // assume they belong to a selected card. Scan every selected ID explicitly.
        updateStatus(`Detected ${state.accounts.length} cards. Select the cards you want to enroll.`);
    });
}
async function scanSelectedCards(accounts) {
    state.offers = [];
    state.confirmed = 0;
    state.completed = 0;
    state.total = 0;
    for (const [index, card] of accounts.entries()) {
        ensureRunning();
        updateStatus(`Scanning card ${index + 1}/${accounts.length}; requests are spaced 15 seconds apart…`);
        const payload = await requestJson(SETTINGS.retrievePath, { accountId: card.accountId });
        ensureRunning();
        state.offers.push(...normalizeOffers(payload, card.accountId));
        renderPanel();
    }
    state.needsScan = false;
}
function scanOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length) return;
    return runExclusive(async () => {
        await scanSelectedCards(accounts);
        updateStatus(`Scan complete: ${state.offers.filter(offer => offer.status === 'AVAILABLE').length} available across ${accounts.length} selected cards.`);
    });
}
function addAllOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length || state.needsScan) return;
    return runExclusive(async () => {
        await scanSelectedCards(accounts);
        const queue = state.offers.filter(offer => offer.status === 'AVAILABLE');
        state.total = queue.length;
        for (const offer of queue) {
            ensureRunning();
            updateStatus(`Adding ${state.completed + 1}/${state.total}: ${offer.merchant}. Waiting for the next request slot…`);
            try {
                const payload = await requestJson(SETTINGS.enrollmentPath, enrollmentBody(offer));
                if (!enrollmentConfirmed(payload, offer)) throw new Error('Enrollment was not explicitly confirmed. Scan again before continuing.');
                offer.status = 'ENROLLED';
                state.confirmed++;
                state.completed++;
                renderPanel();
            } catch (error) {
                offer.status = 'UNCONFIRMED';
                throw error;
            }
        }
        ensureRunning();
        updateStatus(`Finished: ${state.confirmed}/${state.total} confirmed. Refresh Citi's page to update its offer badges.`);
    });
}
