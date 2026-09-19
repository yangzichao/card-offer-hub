function setCardSelected(accountId, selected) {
    if (state.busy || state.storageError
        || !state.accounts.some(card => card.accountId === accountId && card.eligible !== false)) return;
    if (selected) state.selected.add(accountId); else state.selected.delete(accountId);
    state.offers = [];
    state.needsScan = true;
    state.completed = 0;
    state.total = 0;
    renderPanel();
}
function detectCards() {
    return runExclusive(async () => {
        state.accounts = [];
        state.selected.clear();
        state.offers = [];
        state.needsScan = true;
        state.completed = 0;
        state.total = 0;
        state.sessionIdentity = '';
        state.accounts = normalizeAccounts(getCapturedAccountsPayload());
        state.sessionIdentity = currentSession().enterprisePartyIdentifier;
        updateStatus(`Detected ${state.accounts.length} cards from Chase's page. Select cards to scan; no card is selected automatically.`);
    });
}
function scanOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length) return;
    return runExclusive(async () => {
        state.offers = [];
        state.needsScan = true;
        state.completed = 0;
        state.total = accounts.length;
        for (const [index, card] of accounts.entries()) {
            ensureSelectedSession(card.accountId);
            updateStatus(`Scanning card ${index + 1}/${accounts.length}; requests are spaced 0.5 seconds apart…`);
            const payload = await requestJson(buildOffersRequest(card.accountId));
            ensureSelectedSession(card.accountId, { allowStopped: true });
            state.offers.push(...normalizeOffers(payload, card.accountId, state.sessionIdentity));
            state.completed++;
            renderPanel();
            if (state.storageError) throw new Error(state.storageError);
            ensureRunning();
        }
        state.needsScan = false;
        updateStatus(`Scan complete: ${state.offers.length} offers across ${accounts.length} selected cards. To add offers, use the Chase website.`);
    });
}
function addAllOffers() {
    updateStatus('Adding offers is unavailable in this version. Use the Chase website to add offers.');
}
