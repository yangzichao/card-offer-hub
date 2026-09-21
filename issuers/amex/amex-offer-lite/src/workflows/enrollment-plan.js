function groupedOffers({ applyDisplayFilter = true } = {}) {
    const groups = new Map();
    for (const account of selectedAccounts()) {
        for (const offer of state.offersByAccount.get(account.token) || []) {
            if (applyDisplayFilter && state.filter && !`${offer.name} ${offer.description}`.toLowerCase().includes(state.filter)) continue;
            if (!groups.has(offer.groupKey)) groups.set(offer.groupKey, { offer, accounts: [] });
            groups.get(offer.groupKey).accounts.push({ account, offer });
        }
    }
    return [...groups.values()];
}

// Every card-offer pair that could be enrolled, before the priority order picks one.
function enrollmentCandidates(groupKey = null) {
    const seenCardOffers = new Set();
    return groupedOffers({ applyDisplayFilter: false }).filter((group) => !groupKey || group.offer.groupKey === groupKey)
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

// The combination template owns cross-card deduplication and target allocation.
function enrollmentPlan(groupKey = null, { forExecution = false } = {}) {
    const records = forExecution ? offerWorkflow.plan() : offerWorkflow.preview();
    return records.filter(record => !groupKey || record.groupId === groupKey)
        .map(record => ({ account: record.account, offer: record.source }));
}
