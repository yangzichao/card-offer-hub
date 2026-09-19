function normalizeAccounts(payload) {
    if (!Array.isArray(payload?.cardArtDetails)) throw new Error('Citi card-list response was not recognized.');
    const accounts = new Map();
    for (const card of payload.cardArtDetails) {
        if (typeof card.accountId !== 'string' || !card.accountId.trim()
            || typeof card.displayProductName !== 'string') throw new Error('Citi returned an incomplete card record.');
        accounts.set(card.accountId, { accountId: card.accountId, name: card.displayProductName });
    }
    return [...accounts.values()];
}
function normalizeOffers(payload, accountId) {
    if (!Array.isArray(payload?.merchantOffers)) throw new Error('Citi offer-list response was not recognized.');
    const offers = new Map();
    for (const group of payload.merchantOffers) {
        if (!Array.isArray(group.offers)) throw new Error('Citi returned an incomplete offer category.');
        for (const raw of group.offers) {
            if (typeof raw.offerId !== 'string' || !raw.offerId.trim() || typeof raw.offerStatus !== 'string') {
                throw new Error('Citi returned an incomplete offer record.');
            }
            const existing = offers.get(raw.offerId);
            const status = raw.offerStatus.toUpperCase();
            if (existing) {
                // Conflicting duplicates must never turn an enrolled/unknown
                // offer back into an AVAILABLE enrollment candidate.
                if (existing.status !== status) existing.status = 'CONFLICT';
                continue;
            }
            offers.set(raw.offerId, {
                accountId, offerId: raw.offerId, status,
                merchant: typeof raw.merchantName === 'string' ? raw.merchantName : 'Merchant',
                title: typeof raw.offerTitle === 'string' ? raw.offerTitle : '',
                category: group.displayOffersCategory || '', expires: raw.offerEndDate || ''
            });
        }
    }
    return [...offers.values()];
}
function enrollmentBody(offer) {
    return { offerId: offer.offerId, accountId: offer.accountId, oneClickEnroll: 'true' };
}
function enrollmentConfirmed(payload, offer) {
    const enrollmentId = payload?.EnrolledOfferInfo?.enrollmentId;
    const details = payload?.MerchantOfferDetails;
    if (typeof enrollmentId !== 'string' || !enrollmentId.trim() || !details || typeof details !== 'object'
        || Array.isArray(details) || !Object.keys(details).length) return false;
    if (details.offerId !== undefined && details.offerId !== offer.offerId) return false;
    if (details.accountId !== undefined && details.accountId !== offer.accountId) return false;
    if (details.offerStatus !== undefined && String(details.offerStatus).toUpperCase() !== 'ENROLLED') return false;
    if (payload.EnrolledOfferInfo.accountId !== undefined && payload.EnrolledOfferInfo.accountId !== offer.accountId) return false;
    if (payload.EnrolledOfferInfo.offerId !== undefined && payload.EnrolledOfferInfo.offerId !== offer.offerId) return false;
    return true;
}
