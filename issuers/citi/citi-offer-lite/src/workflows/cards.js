function refreshAllCardsAndOffers() {
    return runExclusive(async () => {
        await refreshCurrentCardsAndOffers();
        updateStatus(`Loaded ${state.accounts.length} cards.`);
    });
}
async function refreshCurrentCardsAndOffers() {
    state.needsScan = true;
    const workspace = await retrieveCurrentCardWorkspace();
    // A full refresh establishes the current card list; stale IDs cannot veto it.
    workspace.offers = await readCardOffers(workspace.accounts);
    adoptCurrentWorkspace(workspace);
    recordWorkspaceScan();
    renderPanel();
}
function refreshAndAddOffers() {
    if (state.accounts.length && !state.selected.size) return;
    return runExclusive(() => withSavedOfferContinuation(async () => {
        await refreshCurrentCardsAndOffers();
        await enrollPlannedOffers();
    }), 'add');
}
