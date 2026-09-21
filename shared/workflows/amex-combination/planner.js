function hubPlanCombinedOffers(records, context) {
    const selectedCards = hubWorkflowSelection(context, 'selectedCardIds');
    const priority = hubWorkflowSelection(context, 'priorityCardIds');
    if ([...selectedCards].some(cardId => !priority.has(cardId))) throw new Error('Selected cards need a priority order.');
    const ranks = new Map([...priority].map((cardId, index) => [cardId, index]));
    const selected = records.filter(record => selectedCards.has(record.cardId));
    const settled = new Set(selected.filter(record => ['added', 'unconfirmed'].includes(record.status)).map(record => record.groupId));
    const chosen = new Map();
    for (const record of selected) {
        if (record.status !== 'available' || settled.has(record.groupId)) continue;
        const previous = chosen.get(record.groupId);
        if (!previous || ranks.get(record.cardId) < ranks.get(previous.cardId)) chosen.set(record.groupId, record);
    }
    return [...chosen.values()].sort((left, right) => ranks.get(left.cardId) - ranks.get(right.cardId)
        || (left.label || left.groupId).localeCompare(right.label || right.groupId));
}
