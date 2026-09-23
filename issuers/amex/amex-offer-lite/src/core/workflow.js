const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    readContext: () => ({ selectedCardIds: selectedAccounts().map(account => account.token),
        priorityCardIds: prioritizedAccounts().map(account => account.token) }),
    readRecords: () => selectedAccounts().flatMap(account => (state.offersByAccount.get(account.token) || []).map(offer => ({
        cardId: account.token, offerId: offer.id, groupId: offer.groupKey, label: offer.name, source: offer, account,
        // ON_OTHER_CARD means Amex already has this offer on some card of the member,
        // so it settles the group like an addition and no other card is tried.
        status: ['ENROLLED', 'ON_OTHER_CARD'].includes(offer.status) ? 'added' : offer.status === 'UNCONFIRMED' ? 'unconfirmed'
            : offer.status === 'ELIGIBLE' && offer.enrollable && state.scanReports.get(account.token)?.startsWith('Complete')
                ? 'available' : 'unavailable'
    })))
});
