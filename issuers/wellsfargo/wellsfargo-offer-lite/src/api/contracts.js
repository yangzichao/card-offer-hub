function normalizeOffers(payload) {
    if (payload?.status?.statusCode !== 200
        || payload.status.messages?.[0]?.code !== 'SUCCESS' || typeof payload.data !== 'string') {
        throw new Error('Wells Fargo did not confirm a successful offer scan. Reopen Deals and scan again.');
    }
    let data;
    try { data = JSON.parse(payload.data); }
    catch { throw new Error('Wells Fargo offer data was not recognized.'); }
    const available = data?.availableDeals;
    if (data?.error || !Array.isArray(available?.cardlyticsEligibleDeals) || !Array.isArray(available?.activatedDeals)) {
        throw new Error('Wells Fargo offer-list response was not recognized.');
    }
    const offers = new Map();
    for (const [records, activatedGroup] of [[available.cardlyticsEligibleDeals, false], [available.activatedDeals, true]]) {
        for (const record of records) {
            const details = record?.merchantDealDetails;
            if (typeof details?.merchantOfferId !== 'string' || !/^\d+$/.test(details.merchantOfferId)
                || typeof details.status !== 'string') throw new Error('Wells Fargo returned an incomplete offer record.');
            const supported = record.vendorName === 'CL' && record.multiCardFlag === false
                && (details.cards === undefined || (Array.isArray(details.cards) && details.cards.length === 0));
            let status = 'UNSUPPORTED';
            if (activatedGroup || record.isActivated === true) status = 'ACTIVATED';
            else if (supported && record.isActivated === false && details.status === 'AVAILABLE') status = 'AVAILABLE';
            const offer = {
                offerId: details.merchantOfferId, status,
                merchant: typeof details.merchantName === 'string' ? details.merchantName : 'Merchant',
                title: typeof details.shortDescription === 'string' ? details.shortDescription : '',
                expires: typeof details.expirationDate === 'string' ? details.expirationDate : ''
            };
            const existing = offers.get(offer.offerId);
            if (existing) {
                if (existing.status !== status) existing.status = 'CONFLICT';
            } else offers.set(offer.offerId, offer);
        }
    }
    // The captured count is 0 despite 78 records. Use the actual arrays.
    return [...offers.values()];
}
function enrollmentBody(offer) {
    if (offer.status !== 'AVAILABLE' || !/^\d+$/.test(offer.offerId)) throw new Error('Offer is not eligible for activation. Scan again.');
    // Captured successful activations send an empty value, NOT the list checkSum.
    return { offerIdCheckSumMap: { [offer.offerId]: '' }, activityCode: 'ENROLL', displayType: 'Offer', sendEmailFlag: false };
}
function enrollmentConfirmed(payload) {
    return payload?.status === 'SUCCESS';
}
