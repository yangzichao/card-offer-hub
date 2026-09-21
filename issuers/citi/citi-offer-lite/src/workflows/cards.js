function adoptDetectedCards(accounts) {
    const availableIds = new Set(accounts.map(card => card.accountId));
    state.accounts = accounts;
    state.selected = new Set([...state.selected].filter(id => availableIds.has(id)));
    state.offers = state.offers.filter(offer => availableIds.has(offer.accountId));
    state.restoredWorkspace = false;
    requireWorkspaceSaved();
}
function refreshAllCardsAndOffers() {
    return runExclusive(async () => {
        state.needsScan = true;
        updateStatus('Refreshing all cards & offers: detecting current cards…');
        const payload = await requestJson(SETTINGS.retrievePath, {});
        ensureRunning();
        adoptDetectedCards(normalizeAccounts(payload));
        // Refresh every current card; selections control enrollment only.
        await scanCardOffers(state.accounts);
        updateStatus(`Refresh complete: ${state.accounts.length} cards and ${state.offers.length} offers updated. ${state.selected.size} cards selected for adding; your saved choices were preserved.`);
    });
}
