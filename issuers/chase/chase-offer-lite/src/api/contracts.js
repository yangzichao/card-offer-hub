const CHASE_OFFERS_PATH = '/svc/wr/profile/secure/gateway/ccb/marketing/offer-management/digital-customer-targeted-offers/v3/customer-offers';
function chaseIdentifier(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
    if (typeof value === 'string' && /^\d+$/.test(value) && /[1-9]/.test(value)) return value;
    throw new Error('Chase returned an invalid account identifier. Open Offers and scan again.');
}
function normalizeAccounts(payload) {
    if (!Array.isArray(payload?.digitalProfileAccounts)) throw new Error('Chase card-list response was not recognized.');
    const accounts = new Map();
    for (const card of payload.digitalProfileAccounts) {
        const accountId = chaseIdentifier(card?.digitalAccountIdentifier);
        const name = typeof card.accountNickname === 'string' && card.accountNickname.trim()
            ? card.accountNickname : typeof card.accountProductClassificationName === 'string'
                ? card.accountProductClassificationName : 'Chase card';
        const maskedNumber = typeof card.maskedAccountNumber === 'string' ? card.maskedAccountNumber : '';
        const lastFour = maskedNumber.match(/(\d{4})$/)?.[1] || '';
        if (accounts.has(accountId)) throw new Error('Chase returned duplicate card records.');
        // Cards returned by the Offers profile can be selected for a read-only
        // scan. shoppingEligibilityIndicator is not an Offers eligibility flag:
        // Chase displays card-linked offers even when that field is false.
        // Keep the existing snapshot field; detection refreshes stale false values.
        accounts.set(accountId, { accountId, name, lastFour, eligible: true });
    }
    return [...accounts.values()];
}
function normalizeOffers(payload, requestedAccountId, expectedEnterprisePartyIdentifier) {
    if (expectedEnterprisePartyIdentifier !== undefined
        && chaseIdentifier(payload?.primaryIndividualEnterprisePartyIdentifier) !== chaseIdentifier(expectedEnterprisePartyIdentifier)) {
        throw new Error('Chase session changed. Detect cards and scan again.');
    }
    const accountId = chaseIdentifier(requestedAccountId);
    if (!Array.isArray(payload?.customerOffers)) throw new Error('Chase offer-list response was not recognized.');
    const matches = payload.customerOffers.filter(account => chaseIdentifier(account?.digitalAccountIdentifier) === accountId);
    if (matches.length !== 1 || payload.customerOffers.length !== 1) throw new Error('Chase returned offers for an unexpected card.');
    const account = matches[0];
    if (account.partial !== false || !Array.isArray(account.offers)
        || !Number.isSafeInteger(account.totalAvailableOfferCount) || account.totalAvailableOfferCount < 0
        || account.totalAvailableOfferCount !== account.offers.length) {
        throw new Error('Chase returned a partial or incomplete offer list. Open all Offers and scan again.');
    }
    const offers = new Map();
    for (const raw of account.offers) {
        if (typeof raw?.offerIdentifier !== 'string' || !raw.offerIdentifier.trim()
            || typeof raw.offerStatusName !== 'string' || !raw.offerStatusName.trim()) {
            throw new Error('Chase returned an incomplete offer record.');
        }
        const status = raw.offerStatusName;
        const existing = offers.get(raw.offerIdentifier);
        if (existing) {
            if (existing.status !== status) existing.status = 'CONFLICT';
            continue;
        }
        offers.set(raw.offerIdentifier, {
            accountId, offerId: raw.offerIdentifier, status,
            merchant: typeof raw.merchantDetails?.merchantName === 'string' ? raw.merchantDetails.merchantName : 'Merchant',
            title: typeof raw.offerDisplayDetails?.shortMessageText === 'string' ? raw.offerDisplayDetails.shortMessageText : '',
            category: Array.isArray(raw.offerCategories) ? raw.offerCategories.map(value => typeof value === 'string' ? value : value?.offerCategoryName)
                .filter(value => typeof value === 'string').join(', ') : '',
            expires: typeof raw.offerDetails?.offerEndTimestamp === 'string' ? raw.offerDetails.offerEndTimestamp : ''
        });
    }
    return [...offers.values()];
}
function buildOffersRequest(accountId) {
    const session = currentSession();
    const parameters = new URLSearchParams({
        'offer-count': '', offerStatusNameList: 'NEW,ACTIVATED,SERVED',
        'source-application-system-name': 'CHASE_WEB', 'source-request-component-name': 'OFFERS_HUB_ALL'
    });
    return {
        path: `${CHASE_OFFERS_PATH}?${parameters}`, method: 'GET',
        headers: { 'path-params': JSON.stringify({ enterprisePartyIdentifier: session.enterprisePartyIdentifier,
            primaryDigitalAccountIdentifierList: [chaseIdentifier(accountId)] }) }
    };
}
