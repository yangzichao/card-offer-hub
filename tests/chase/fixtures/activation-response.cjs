const { listing, offer } = require('./offers-response.cjs');
const clickEndpoint = 'https://reco.chase.com/events/recoengine/public/recommendation/ccb/sales-relationship/crm/personalization-recommendation-interactions/v2/customer-interaction';
function activationListing(accountId = '101', offers = [offer('new'), offer('seen', 'SERVED'), offer('already', 'ACTIVATED')], revision = 'initial') {
    const payload = listing(accountId, offers);
    const account = payload.customerOffers[0];
    account.customerOfferSessionTokenIdentifier = `synthetic-session-${accountId}-${revision}`;
    account.offers = offers.map(raw => {
        const recommendationIdentifier = `synthetic-recommendation-${raw.offerIdentifier}`;
        const offerImpressionTokenIdentifier = `synthetic-impression-${accountId}-${raw.offerIdentifier}-${revision}`;
        const parameters = new URLSearchParams({
            'enterprise-party-identifier': '909', 'recommendation-event-type-code': 'CLICK',
            'recommendation-identifier': recommendationIdentifier,
            'source-application-system-name': 'CHASE_WEB', 'source-request-component-name': 'OFFERS_HUB_CAROUSELS',
            'request-context': 'MERCHANT_OFFERS', 'digital-account-identifier': accountId,
            'offer-identifier': raw.offerIdentifier, 'offer-impression-token-identifier': offerImpressionTokenIdentifier,
            'offer-session-token-identifier': account.customerOfferSessionTokenIdentifier
        });
        return { ...raw, recommendationIdentifier, offerImpressionTokenIdentifier,
            digitalInteractionDestUrlText: `/ccb/sales-relationship/crm/personalization-recommendation-events/v2/events?${parameters}` };
    });
    return payload;
}
function emptyAcknowledgement(status = 200, retryAfter = null) {
    return { status, ok: status >= 200 && status < 300, headers: { get: () => retryAfter }, text: async () => '' };
}
module.exports = { activationListing, clickEndpoint, emptyAcknowledgement };
