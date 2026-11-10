const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    // Add skips offers the small-offer filter hides.
    keepInPlan: record => hubRewardPassesFilter(record.source.reward, state.rewardFilter),
    readContext: () => ({ accountId: state.workspaceScope, consent: state.accountConsent }),
    readRecords: () => state.offers.map(offer => ({
        accountId: state.workspaceScope, offerId: offer.offerId, source: offer,
        status: offer.status === 'AVAILABLE' ? 'available' : offer.status === 'ACTIVATED' ? 'added'
            : offer.status === 'UNCONFIRMED' ? 'unconfirmed' : 'unavailable'
    }))
});
