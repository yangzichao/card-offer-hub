// Entirely synthetic: never substitute captured account IDs, tokens, or HAR data.
function account(identifier = '101', name = 'Synthetic Card A') {
    return { digitalAccountIdentifier: Number(identifier), accountNickname: name,
        accountProductClassificationName: 'CREDIT_CARD', maskedAccountNumber: '...0000',
        shoppingEligibilityIndicator: true };
}
function offer(identifier = 'synthetic-offer-a', status = 'NEW') {
    return { offerIdentifier: identifier, offerStatusName: status,
        merchantDetails: { merchantName: `Example ${identifier}` },
        offerDisplayDetails: { shortMessageText: '10% back' },
        offerDetails: { offerEndTimestamp: '2099-12-31' } };
}
function listing(accountIdentifier = '101', offers = [offer()], cards = [account(), account('202', 'Synthetic Card B')]) {
    return { primaryIndividualEnterprisePartyIdentifier: '909', digitalProfileAccounts: cards, customerOffers: [{
        digitalAccountIdentifier: Number(accountIdentifier), partial: false,
        totalAvailableOfferCount: offers.length, offers
    }] };
}
const endpoint = 'https://secure.chase.com/svc/wr/profile/secure/gateway/ccb/marketing/offer-management/digital-customer-targeted-offers/v3/customer-offers';
function sessionHeaders(accountIdentifier = '101', enterprisePartyIdentifier = '909') {
    return { 'channel-identifier': 'C30', 'channel-type': 'WEB', 'x-jpmc-channel': 'id=C30',
        'x-jpmc-csrf-token': 'synthetic-token', 'path-params': JSON.stringify({
            enterprisePartyIdentifier, primaryDigitalAccountIdentifierList: [accountIdentifier]
        }) };
}
const dashboardEndpoint = `${endpoint}?${new URLSearchParams({
    'offer-count': '12', offerStatusNameList: 'NEW,ACTIVATED,SERVED',
    'source-application-system-name': 'CHASE_WEB', 'source-request-component-name': 'OVERVIEW_DASHBOARD'
})}`;
function dashboardHeaders(enterprisePartyIdentifier = '909') {
    return { ...sessionHeaders(), 'path-params': JSON.stringify({
        enterprisePartyIdentifier, primaryDigitalAccountIdentifierList: []
    }) };
}
module.exports = { account, offer, listing, endpoint, sessionHeaders, dashboardEndpoint, dashboardHeaders };
