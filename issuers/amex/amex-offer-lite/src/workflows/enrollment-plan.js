function groupedOffers() {
    const groups = new Map();
    for (const account of selectedAccounts()) {
        for (const offer of state.offersByAccount.get(account.token) || []) {
            if (state.filter && !`${offer.name} ${offer.description}`.toLowerCase().includes(state.filter)) continue;
            if (!groups.has(offer.groupKey)) groups.set(offer.groupKey, { offer, accounts: [] });
            groups.get(offer.groupKey).accounts.push({ account, offer });
        }
    }
    return [...groups.values()];
}

// Every card-offer pair that could be enrolled, before the priority order picks one.
function enrollmentCandidates(groupKey = null) {
    const seenCardOffers = new Set();
    return groupedOffers().filter((group) => !groupKey || group.offer.groupKey === groupKey)
        .flatMap((group) => group.accounts)
        .filter(({ account, offer }) => offer.status === 'ELIGIBLE' && offer.enrollable
            && state.scanReports.get(account.token)?.startsWith('Complete'))
        .filter(({ account, offer }) => {
            const key = JSON.stringify([account.token, offer.groupKey]);
            if (seenCardOffers.has(key)) return false;
            seenCardOffers.add(key);
            return true;
        });
}

// An offer already added to one whitelist card, or left unconfirmed on one, is
// finished with: adding it again on a lower card would break the one-card rule.
// A card that definitively refused it (FAILED) does not block the next card.
function settledOfferGroups() {
    return new Set(groupedOffers()
        .filter((group) => group.accounts.some(({ offer }) => ['ENROLLED', 'UNCONFIRMED'].includes(offer.status)))
        .map((group) => group.offer.groupKey));
}

// One offer is added to exactly one card. When several cards are eligible for the
// same offer, the highest card in your priority order takes it; an offer that only
// one card has is therefore always allocated to that card.
function enrollmentPlan(groupKey = null) {
    const ranks = cardPriorityRanks();
    const settled = settledOfferGroups();
    const chosenByOffer = new Map();
    for (const candidate of enrollmentCandidates(groupKey)) {
        if (settled.has(candidate.offer.groupKey)) continue;
        const chosen = chosenByOffer.get(candidate.offer.groupKey);
        if (!chosen || ranks.get(candidate.account.token) < ranks.get(chosen.account.token)) {
            chosenByOffer.set(candidate.offer.groupKey, candidate);
        }
    }
    // Work through the highest-priority card first, and keep a stable order so a
    // run that is stopped and restarted resumes where the offers left off.
    return [...chosenByOffer.values()].sort((left, right) =>
        ranks.get(left.account.token) - ranks.get(right.account.token) || left.offer.name.localeCompare(right.offer.name));
}

