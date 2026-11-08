const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    // Digital coupons belong to the signed-in Kroger account's loyalty card.
    // The manual Clip all click is the account confirmation.
    readContext: () => ({ accountId: state.workspaceScope, consent: true }),
    readRecords: () => state.offers.map(offer => ({
        accountId: state.workspaceScope, offerId: offer.offerId, source: offer,
        status: offer.status === 'AVAILABLE' ? 'available' : offer.status === 'ACTIVATED' ? 'added'
            : offer.status === 'UNCONFIRMED' ? 'unconfirmed' : 'unavailable'
    }))
});
