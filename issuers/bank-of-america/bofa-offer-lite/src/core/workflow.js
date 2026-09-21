const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    readContext: () => ({ accountId: state.workspaceScope, consent: state.consent }),
    readRecords: () => state.offers.map(offer => ({
        accountId: state.workspaceScope, offerId: offer.id, source: offer,
        status: offer.result === 'Unconfirmed' ? 'unconfirmed' : offer.activated ? 'added'
            : offer.eligible ? 'available' : 'unavailable'
    }))
});
