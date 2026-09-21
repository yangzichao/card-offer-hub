// Newly discovered cards start selected; known cards retain the user's choice.
function hubSelectDetectedCards(accounts, previousAccounts, selected) {
    const knownIds = new Set(previousAccounts.map(card => card.accountId));
    return new Set(accounts.filter(card => card.eligible !== false
        && (!knownIds.has(card.accountId) || selected.has(card.accountId))).map(card => card.accountId));
}
