const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    readContext: () => ({ accountId: state.workspaceScope, consent: state.accountConsent }),
    readRecords: () => state.offers.map(offer => ({
        accountId: state.workspaceScope, offerId: offer.offerId, source: offer,
        status: offer.status === 'AVAILABLE' ? 'available' : offer.status === 'ACTIVATED' ? 'added'
            : offer.status === 'UNCONFIRMED' ? 'unconfirmed' : 'unavailable'
    }))
});
