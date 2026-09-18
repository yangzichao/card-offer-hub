async function scanAccountOffers(account) {
    const previousOffers = state.offersByAccount.get(account.token);
    const previousScanTime = state.offerScanTimes.get(account.token) || 0;
    state.scanReports.set(account.token, previousOffers ? 'Scanning · showing saved offers' : 'Scanning');
    renderCards();
    try {
        const result = await getAllOffersForAccount(account.token, (partialOffers) => {
            if (!previousOffers) {
                state.offersByAccount.set(account.token, partialOffers);
                state.offerScanTimes.set(account.token, Date.now());
                state.scanReports.set(account.token, 'Partial — reading both lists');
                persistOfferResults();
                renderOffers();
                renderCards();
            }
        });
        if (result.viewErrors.length && previousOffers) {
            state.scanReports.set(account.token, 'Incomplete · showing previous saved offers');
            state.offerScanTimes.set(account.token, previousScanTime);
            log(`${account.cardName}: refresh incomplete; previous saved offers kept.`);
        } else {
            state.offersByAccount.set(account.token, result.offers);
            state.offerScanTimes.set(account.token, Date.now());
            state.scanReports.set(account.token, result.viewErrors.length ? 'Incomplete' : 'Complete');
        }
        return result;
    } catch (error) {
        state.scanReports.set(account.token, previousOffers ? 'Incomplete · showing previous saved offers'
            : state.offersByAccount.has(account.token) ? 'Incomplete' : 'Not scanned');
        throw error;
    } finally {
        persistOfferResults();
        render();
    }
}
