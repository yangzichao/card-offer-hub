function accountOfferCounts(accountToken) {
    const offers = state.offersByAccount.get(accountToken);
    if (!offers) return null;
    return {
        total: offers.length,
        eligible: offers.filter((offer) => offer.status === 'ELIGIBLE').length,
        enrolled: offers.filter((offer) => offer.status === 'ENROLLED').length,
        complete: state.scanReports.get(accountToken)?.startsWith('Complete') || false
    };
}

function offerGroupCounts(accounts) {
    const eligible = accounts.filter(({ offer }) => offer.status === 'ELIGIBLE');
    const enrolled = accounts.filter(({ offer }) => offer.status === 'ENROLLED');
    return {
        eligibleCards: new Set(eligible.map(({ account }) => account.token)).size,
        enrolledCards: new Set(enrolled.map(({ account }) => account.token)).size,
        seenCards: new Set(accounts.map(({ account }) => account.token)).size,
        addable: eligible.filter(({ account, offer }) => offer.enrollable
            && state.scanReports.get(account.token)?.startsWith('Complete')).length
    };
}

function filteredOfferSummary(groups, plannedCount) {
    const pairs = groups.flatMap((group) => group.accounts).filter(({ offer }) => offer.status === 'ELIGIBLE');
    const eligibleCards = new Set(pairs.map(({ account }) => account.token)).size;
    const completeCards = selectedAccounts().filter((account) => state.scanReports.get(account.token)?.startsWith('Complete')).length;
    const eligibleGroups = groups.filter((group) => group.accounts.some(({ offer }) => offer.status === 'ELIGIBLE')).length;
    return `${groups.length} distinct offers · ${eligibleGroups} eligible · ${plannedCount} planned on one card each · ${eligibleCards} eligible cards. `
        + `Coverage: ${completeCards}/${selectedAccounts().length} cards fully scanned${completeCards < selectedAccounts().length ? ' — counts so far' : ''}.`;
}
