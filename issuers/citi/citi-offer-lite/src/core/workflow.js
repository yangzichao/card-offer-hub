const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    // Add skips offers the small-offer filter hides.
    keepInPlan: record => hubRewardPassesFilter(record.source.reward, state.rewardFilter),
    readContext: () => ({ selectedCardIds: [...state.selected] }),
    readRecords: () => state.offers.map(offer => ({
        cardId: offer.accountId, offerId: offer.offerId, source: offer,
        status: offer.status === 'AVAILABLE' ? 'available' : offer.status === 'ENROLLED' ? 'added'
            : offer.status === 'UNCONFIRMED' ? 'unconfirmed' : 'unavailable'
    }))
});
