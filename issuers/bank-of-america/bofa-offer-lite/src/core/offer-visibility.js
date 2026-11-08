// Deals mixes real card-linked offers with shopping links (AFFILIATE,
// MERCHANT_FULFILLED, OUTBOUND_LINK_CLICK) and offers that need no activation.
// Live sample (2026-11-08): 36 of 168 listed offers could be added. Only offers
// that can be added, are added, or still need review are kept and shown.
function isBofaOfferShown(offer) {
    return offer.eligible === true || offer.activated === true || ['Unconfirmed', 'Not added'].includes(offer.result);
}
