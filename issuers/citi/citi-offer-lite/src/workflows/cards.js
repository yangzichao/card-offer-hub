function adoptDetectedCards(accounts) {
    const availableIds = new Set(accounts.map(card => card.accountId));
    state.selected = hubSelectDetectedCards(accounts, state.accounts, state.selected);
    state.accounts = accounts;
    state.offers = state.offers.filter(offer => availableIds.has(offer.accountId));
    state.restoredWorkspace = false;
    requireWorkspaceSaved();
}
function refreshAllCardsAndOffers() {
    return runExclusive(async () => {
        await refreshCurrentCardsAndOffers();
        updateStatus(`Loaded ${state.accounts.length} cards.`);
    });
}
async function verifySelectedCards(accounts) {
    updateStatus('Checking your cards against the current Citi login…');
    const payload = await requestJson(SETTINGS.retrievePath, {});
    ensureRunning();
    const currentCards = normalizeAccounts(payload);
    const currentIds = new Set(currentCards.map(card => card.accountId));
    adoptDetectedCards(currentCards);
    if (accounts.some(card => !currentIds.has(card.accountId))) {
        throw new Error('Selected cards do not match this login. Review your card selections, then refresh & add offers.');
    }
}
async function refreshCurrentCardsAndOffers(selectedAccounts = []) {
    state.needsScan = true;
    await verifySelectedCards(selectedAccounts);
    // Discover every card; new cards default selected and existing opt-outs are retained.
    await scanCardOffers(state.accounts);
}
function refreshAndAddOffers() {
    const accounts = state.accounts.filter(card => state.selected.has(card.accountId));
    if (!accounts.length) return;
    return runExclusive(async () => {
        await withSavedOfferContinuation(async () => {
            await refreshCurrentCardsAndOffers(accounts);
            await enrollPlannedOffers();
        });
    }, 'add');
}
