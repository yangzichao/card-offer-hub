function setCardSelected(accountId, selected) {
    if (state.busy || state.storageError
        || !state.accounts.some(card => card.accountId === accountId && card.eligible !== false)) return;
    if (selected) state.selected.add(accountId); else state.selected.delete(accountId);
    state.needsScan = true;
    saveWorkspace();
    state.completed = 0;
    state.total = 0;
    renderPanel();
}
function detectCards() {
    return runExclusive(async () => {
        const accounts = normalizeAccounts(getCapturedAccountsPayload());
        const identity = currentSession().enterprisePartyIdentifier;
        bindWorkspaceScope(identity);
        const eligibleIds = new Set(accounts.filter(card => card.eligible).map(card => card.accountId));
        state.accounts = accounts;
        state.selected = new Set([...state.selected].filter(id => eligibleIds.has(id)));
        state.offers = state.offers.filter(offer => accounts.some(card => card.accountId === offer.accountId));
        state.needsScan = true;
        state.sessionIdentity = identity;
        state.restoredWorkspace = false;
        requireWorkspaceSaved();
        updateStatus(`Detected ${state.accounts.length} cards from Chase's page. Your existing card selections were preserved.`);
    });
}
function scanOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length) return;
    return runExclusive(async () => {
        if (state.restoredWorkspace) {
            const currentAccounts = normalizeAccounts(getCapturedAccountsPayload());
            const identity = currentSession().enterprisePartyIdentifier;
            if (identity !== state.workspaceScope || accounts.some(card => !currentAccounts.some(current => current.accountId === card.accountId && current.eligible))) {
                throw new Error('Saved cards do not match this login. Detect cards and review selections.');
            }
            state.sessionIdentity = identity;
        }
        state.needsScan = true;
        state.completed = 0;
        state.total = accounts.length;
        for (const [index, card] of accounts.entries()) {
            ensureSelectedSession(card.accountId);
            updateStatus(`Scanning card ${index + 1}/${accounts.length}…`);
            const payload = await requestJson(buildOffersRequest(card.accountId));
            ensureSelectedSession(card.accountId, { allowStopped: true });
            const scannedOffers = normalizeOffers(payload, card.accountId, state.sessionIdentity);
            state.offers = state.offers.filter(offer => offer.accountId !== card.accountId).concat(scannedOffers);
            requireWorkspaceSaved();
            state.completed++;
            renderPanel();
            if (state.storageError) throw new Error(state.storageError);
            ensureRunning();
        }
        state.needsScan = false;
        recordWorkspaceScan();
        updateStatus(`Scan complete: ${state.offers.length} offers across ${accounts.length} selected cards. To add offers, use the Chase website.`);
    });
}
function addAllOffers() {
    updateStatus('Adding offers is unavailable in this version. Use the Chase website to add offers.');
}
