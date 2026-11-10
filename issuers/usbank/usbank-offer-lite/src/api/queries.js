// Only fields observed in the captured first-party GraphQL query are requested.
// GraphQL returns only what is asked for: the reward amounts must be listed here
// or every offer reads as "No listed value" (the 1.9.0 bug).
const LIST_OFFERS_QUERY = `query getCashbackOffersAds($request: CashbackOffersAdsRequest) {
    getCashbackOffersAds(request: $request) {
        requestId sessionTokenId
        ads { offerId rank ad {
            adType adServeToken startDate endDate merchantName categoryName
            activationState visibilityState isAffiliateMarketing
            reward { rewardType rewardAmount maxRewardAmount activationModel
                purchaseRequirement { minSpendAmount merchantUrlLinkClickRequired } }
            assets { copy { value { headline rewardCopy } } }
        } }
    }
}`;
const ACTIVATE_OFFER_QUERY = `query ($request: ClientEventsRequestInput) {
    getActivateOffer(request: $request) { requestId }
}`;
