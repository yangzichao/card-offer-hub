const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    readContext: () => ({ selectedCardIds: [...state.selected] }),
    readRecords: () => state.offers.map(offer => ({
        cardId: offer.accountId, offerId: offer.offerId, source: offer,
        status: offer.status === 'NEW' ? 'available' : offer.status === 'ACTIVATED' ? 'added' : 'unavailable'
    }))
});
