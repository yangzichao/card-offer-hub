function hubPlanPerCardOffers(records, context) {
    const selectedCards = hubWorkflowSelection(context, 'selectedCardIds');
    const unique = hubUniqueWorkflowRecords(records, record => JSON.stringify([record.cardId, record.offerId]));
    return unique.filter(record => selectedCards.has(record.cardId) && record.status === 'available');
}
