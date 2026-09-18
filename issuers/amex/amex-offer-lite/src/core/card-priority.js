// The priority order decides which card receives an offer that several cards
// could take. It is set once by dragging cards, saved with the card catalog, and
// never changes on its own. An offer only one card has is always that card's.
function prioritizedAccounts() {
    const rankByToken = new Map(state.cardPriority.map((token, index) => [token, index]));
    // Cards missing from the saved order were just detected; a stable sort leaves
    // them in detection order at the end, so they never outrank an existing choice.
    return [...state.accounts].sort((left, right) =>
        (rankByToken.get(left.token) ?? Number.MAX_SAFE_INTEGER) - (rankByToken.get(right.token) ?? Number.MAX_SAFE_INTEGER));
}

function cardPriorityRanks() {
    return new Map(prioritizedAccounts().map((account, index) => [account.token, index]));
}

// Cards absent from this catalog keep their rank, exactly as the whitelist keeps
// absent approvals, so a card that reappears returns to the position you chose.
function normalizeCardPriority() {
    const ranked = new Set(state.cardPriority);
    state.cardPriority = [...state.cardPriority,
        ...state.accounts.map((account) => account.token).filter((token) => !ranked.has(token))];
    return state.cardPriority;
}

// Dragging and the move buttons share this one primitive: put a card immediately
// before another card, or at the end of the order when beforeToken is null.
function placeCardPriorityBefore(accountToken, beforeToken) {
    if (accountToken === beforeToken) return false;
    const order = normalizeCardPriority().filter((token) => token !== accountToken);
    const insertIndex = beforeToken === null ? order.length : order.indexOf(beforeToken);
    if (insertIndex === -1) return false;
    order.splice(insertIndex, 0, accountToken);
    state.cardPriority = order;
    return true;
}

function commitCardPriority(accountToken, beforeToken) {
    if (state.busy || !state.detected) return false;
    if (!placeCardPriorityBefore(accountToken, beforeToken)) return false;
    persistCardSettings();
    setStatus('Offer priority saved. A shared offer goes to the highest eligible card. No request was sent.');
    render();
    return true;
}

function moveCardPriority(accountToken, offset) {
    const visibleTokens = prioritizedAccounts().map((account) => account.token);
    const currentIndex = visibleTokens.indexOf(accountToken);
    const targetIndex = currentIndex + offset;
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= visibleTokens.length) return false;
    return commitCardPriority(accountToken, offset < 0 ? visibleTokens[targetIndex] : visibleTokens[targetIndex + 1] ?? null);
}

function dropCardPriority(accountToken, targetToken) {
    const visibleTokens = prioritizedAccounts().map((account) => account.token);
    const fromIndex = visibleTokens.indexOf(accountToken);
    const toIndex = visibleTokens.indexOf(targetToken);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false;
    // Dropping downward lands after the target card, upward lands before it.
    return commitCardPriority(accountToken, fromIndex < toIndex ? visibleTokens[toIndex + 1] ?? null : targetToken);
}
