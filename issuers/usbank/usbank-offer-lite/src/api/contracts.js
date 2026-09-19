function graphqlData(payload, field) {
    // GraphQL may report failures alongside data with HTTP 200. Never expose
    // its raw error messages, which may contain customer/session identifiers.
    if (!payload || (payload.errors !== undefined
        && (!Array.isArray(payload.errors) || payload.errors.length))) {
        throw new Error('US Bank returned a GraphQL error. Scan again after resolving the error.');
    }
    const data = payload.data?.[field];
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('US Bank response was not recognized. Scan again.');
    }
    return data;
}
function normalizeListing(payload) {
    const data = graphqlData(payload, 'getCashbackOffersAds');
    if (!requiredSessionString(data.requestId) || !requiredSessionString(data.sessionTokenId) || !Array.isArray(data.ads)) {
        throw new Error('US Bank returned an incomplete offer list. Scan again.');
    }
    const offers = new Map();
    for (const raw of data.ads) {
        if (!requiredSessionString(raw?.offerId) || !raw.ad || typeof raw.ad !== 'object') {
            throw new Error('US Bank returned an incomplete offer record. Scan again.');
        }
        const ad = raw.ad;
        const offer = {
            offerId: raw.offerId, serveToken: ad.adServeToken,
            merchant: typeof ad.merchantName === 'string' ? ad.merchantName : 'Merchant',
            title: typeof ad.assets?.copy?.value?.headline === 'string' ? ad.assets.copy.value.headline : '',
            category: typeof ad.categoryName === 'string' ? ad.categoryName : '',
            starts: ad.startDate, expires: ad.endDate, activationState: ad.activationState,
            status: ad.activationState === 'ACTIVATED' ? 'ACTIVATED' : 'SKIPPED',
            adType: ad.adType, visibilityState: ad.visibilityState,
            activationModel: ad.reward?.activationModel,
            affiliate: ad.isAffiliateMarketing,
            requiresLink: ad.reward?.purchaseRequirement?.merchantUrlLinkClickRequired
        };
        if (isActivatable(offer)) offer.status = 'AVAILABLE';
        if (offers.has(offer.offerId)) {
            // Even apparently identical duplicates may have different serving
            // contexts. Keep one visible entry but never write against it.
            offers.get(offer.offerId).status = 'CONFLICT';
        } else offers.set(offer.offerId, offer);
    }
    return { requestId: data.requestId, sessionTokenId: data.sessionTokenId, offers: [...offers.values()] };
}
function isActivatable(offer) {
    const now = Date.now();
    return ['NEW', 'SERVED'].includes(offer.activationState)
        && offer.adType === 'CASH_BACK_OFFER' && offer.visibilityState === 'VISIBLE'
        && offer.activationModel === 'ACTIVATABLE' && offer.affiliate === false && offer.requiresLink === false
        && requiredSessionString(offer.serveToken)
        && Number.isFinite(Date.parse(offer.starts)) && Date.parse(offer.starts) <= now
        && Number.isFinite(Date.parse(offer.expires)) && Date.parse(offer.expires) > now;
}
function activationBody(offer, listing) {
    if (offer.status !== 'AVAILABLE' || !isActivatable(offer)) throw new Error('Offer is no longer eligible. Scan again.');
    return { request: {
        sessionTokenId: listing.sessionTokenId,
        clientEvents: [{
            clientOfferId: offer.offerId, clientEventId: listing.requestId,
            clientEventType: 'AdInteraction', clientEvent: 'ActivateOffer',
            clientEventTimestamp: new Date().toISOString(),
            clientEventMetadata: { serveToken: offer.serveToken, section: 'Summary', channel: 'OLB',
                imageSlots: ['logo', 'smallRectangle', 'largeRectangle'],
                displayPosition: listing.offers.findIndex(item => item.offerId === offer.offerId) + 1 },
            curationId: 'Featured'
        }]
    } };
}
function activationAcknowledged(payload) {
    return Boolean(requiredSessionString(graphqlData(payload, 'getActivateOffer').requestId));
}
function activationConfirmed(listing, offerId) {
    return listing.offers.some(offer => offer.offerId === offerId && offer.status === 'ACTIVATED');
}
