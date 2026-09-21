async function readCardOffers(accounts) {
    const offers = [];
    state.confirmed = 0;
    state.completed = 0;
    state.total = 0;
    for (const [index, card] of accounts.entries()) {
        ensureRunning();
        updateStatus(`Scanning card ${index + 1}/${accounts.length}…`);
        const payload = await requestJson(SETTINGS.retrievePath, { accountId: card.accountId });
        ensureRunning();
        offers.push(...normalizeOffers(payload, card.accountId));
    }
    return offers;
}
async function scanCardOffers(accounts) {
    state.needsScan = true;
    const workspace = state.restoredWorkspace ? await verifySelectedCards(accounts) : {
        accounts: state.accounts, selected: state.selected, offers: state.offers,
        identifierMap: new Map(accounts.map(card => [card.accountId, card.accountId]))
    };
    const scanIds = new Set(accounts.map(card => workspace.identifierMap.get(card.accountId)));
    const scannedOffers = await readCardOffers(workspace.accounts.filter(card => scanIds.has(card.accountId)));
    workspace.offers = workspace.offers.filter(offer => !scanIds.has(offer.accountId)).concat(scannedOffers);
    adoptCurrentWorkspace(workspace);
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
