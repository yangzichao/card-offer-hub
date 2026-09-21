function hubPlanAccountOffers(records, context) {
    if (records.length) hubRequireWorkflowId(context.accountId, 'current account');
    if (records.some(record => record.accountId !== context.accountId)) {
        throw new Error('Offers do not belong to the current account.');
    }
    if (typeof context.consent !== 'boolean') throw new Error('Workflow requires account consent.');
    const unique = hubUniqueWorkflowRecords(records, record => JSON.stringify([record.accountId, record.offerId]));
    return context.consent ? unique.filter(record => record.status === 'available') : [];
}
