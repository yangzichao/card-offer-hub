async function prepareSavedOfferContinuation(accounts) {
    const needsVerification = state.continuationBlocked || !state.lastScanAt
        || (state.needsScan && !state.restoredWorkspace);
    const workspace = await verifySelectedCards(accounts);
    const changedIdentifiers = accounts.some(card => workspace.identifierMap.get(card.accountId) !== card.accountId);
    if (needsVerification || changedIdentifiers) {
        // Display-name reconciliation never authorizes a cached write. Read the
        // current card's offers first, then keep the original saved-offer scope.
        const selectedIds = new Set(accounts.map(card => workspace.identifierMap.get(card.accountId)));
        const freshOffers = await readCardOffers(workspace.accounts.filter(card => selectedIds.has(card.accountId)));
        const freshByKey = new Map(freshOffers.map(offer => [workspaceOfferKey(offer), offer]));
        workspace.offers = workspace.offers.map(offer => {
            if (!selectedIds.has(offer.accountId)) return offer;
            const fresh = freshByKey.get(workspaceOfferKey(offer));
            if (fresh?.status === 'ENROLLED') return fresh;
            // Never replay an unresolved or previously confirmed write via this action.
            if (offer.status !== 'AVAILABLE') return offer;
            return fresh || { ...offer, status: 'UNAVAILABLE' };
        });
    }
    adoptCurrentWorkspace(workspace);
}
