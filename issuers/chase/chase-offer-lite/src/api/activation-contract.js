const CHASE_CLICK_URL = 'https://reco.chase.com/events/recoengine/public/recommendation/ccb/sales-relationship/crm/personalization-recommendation-interactions/v2/customer-interaction';
const CHASE_CLICK_SOURCE_PATH = '/ccb/sales-relationship/crm/personalization-recommendation-events/v2/events';
const CHASE_CLICK_PARAMETER_NAMES = [
    'enterprise-party-identifier', 'recommendation-event-type-code', 'recommendation-identifier',
    'source-application-system-name', 'source-request-component-name', 'request-context',
    'digital-account-identifier', 'offer-identifier', 'offer-impression-token-identifier', 'offer-session-token-identifier'
];
function validateChaseClickParameters(parameters, offer, identity) {
    const names = [...parameters.keys()];
    return names.length === CHASE_CLICK_PARAMETER_NAMES.length
        && CHASE_CLICK_PARAMETER_NAMES.every(name => parameters.getAll(name).length === 1
            && parameters.get(name)?.trim() && !/[\r\n]/.test(parameters.get(name)))
        && parameters.get('enterprise-party-identifier') === identity
        && parameters.get('digital-account-identifier') === offer.accountId
        && parameters.get('offer-identifier') === offer.offerId
        && parameters.get('recommendation-event-type-code') === 'CLICK'
        && parameters.get('source-application-system-name') === 'CHASE_WEB'
        && ['OFFERS_HUB_ALL', 'OFFERS_HUB_CAROUSELS'].includes(parameters.get('source-request-component-name'))
        && parameters.get('request-context') === 'MERCHANT_OFFERS';
}
function readChaseClickParameters(rawOffer, account, identity) {
    try {
        if (!['NEW', 'SERVED'].includes(rawOffer.offerStatusName)) return null;
        const destination = rawOffer.digitalInteractionDestUrlText;
        if (typeof destination !== 'string' || !destination.startsWith(`${CHASE_CLICK_SOURCE_PATH}?`)) return null;
        const url = new URL(destination, 'https://secure.chase.com');
        const parameters = url.searchParams;
        const offer = { accountId: chaseIdentifier(account.digitalAccountIdentifier), offerId: rawOffer.offerIdentifier };
        if (url.pathname !== CHASE_CLICK_SOURCE_PATH || url.hash
            || !validateChaseClickParameters(parameters, offer, chaseIdentifier(identity))
            || parameters.get('recommendation-identifier') !== String(rawOffer.recommendationIdentifier)
            || parameters.get('offer-impression-token-identifier') !== rawOffer.offerImpressionTokenIdentifier
            || parameters.get('offer-session-token-identifier') !== account.customerOfferSessionTokenIdentifier) return null;
        // Runtime only. Workspace persistence explicitly excludes these parameters.
        return parameters.toString();
    } catch { return null; }
}
function buildChaseClickRequest(offer) {
    ensureSelectedSession(offer.accountId);
    const parameters = new URLSearchParams(offer.activationParameters || '');
    if (!['NEW', 'SERVED'].includes(offer.status)
        || !validateChaseClickParameters(parameters, offer, state.sessionIdentity)) {
        throw new Error('Chase click details are missing or changed. Scan offers again before adding.');
    }
    // The server supplies the event identity and tokens. The observed browser
    // sends these to this fixed CORS endpoint; never follow arbitrary URLs.
    return `${CHASE_CLICK_URL}?${parameters}`;
}
