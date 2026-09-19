// Only fields observed in the captured first-party GraphQL query are requested.
const LIST_OFFERS_QUERY = `query getCashbackOffersAds($request: CashbackOffersAdsRequest) {
    getCashbackOffersAds(request: $request) {
        requestId sessionTokenId
        ads { offerId rank ad {
            adType adServeToken startDate endDate merchantName categoryName
            activationState visibilityState isAffiliateMarketing
            reward { activationModel purchaseRequirement { merchantUrlLinkClickRequired } }
            assets { copy { value { headline rewardCopy } } }
        } }
    }
}`;
const ACTIVATE_OFFER_QUERY = `query ($request: ClientEventsRequestInput) {
    getActivateOffer(request: $request) { requestId }
}`;
