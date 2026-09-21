const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    // The manually clicked Add action is this issuer's account confirmation.
    // Individual offer selection narrows that plan; it is never card selection.
    readContext: () => ({ accountId: state.workspaceScope, consent: true }),
    readRecords: () => state.offers.map(offer => ({
        accountId: state.workspaceScope, offerId: offer.offerId, source: offer,
        status: offer.status === 'AVAILABLE' ? 'available' : offer.status === 'ACTIVATED' ? 'added'
            : offer.status === 'UNCONFIRMED' ? 'unconfirmed' : 'unavailable'
    }))
});
