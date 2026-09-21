const offerWorkflow = createHubWorkflow({
    type: SETTINGS.workflow, capabilities: SETTINGS.capabilities,
    readContext: () => ({ selectedCardIds: [...state.selected] }),
    readRecords: () => state.offers.map(offer => ({
        cardId: offer.accountId, offerId: offer.offerId, source: offer,
        status: ['NEW', 'SERVED'].includes(offer.status) && offer.activationParameters ? 'available' : offer.status === 'ACTIVATED' ? 'added'
            : offer.status === 'UNCONFIRMED' ? 'unconfirmed' : 'unavailable'
    }))
});
function chaseUnsupportedClickCount() {
    return state.offers.filter(offer => state.selected.has(offer.accountId)
        && ['NEW', 'SERVED'].includes(offer.status) && !offer.activationParameters).length;
}
function chaseUnsupportedClickNotice() {
    const count = chaseUnsupportedClickCount();
    return count ? ` ${count} offers lack verified click details; add those on Chase.` : '';
}
