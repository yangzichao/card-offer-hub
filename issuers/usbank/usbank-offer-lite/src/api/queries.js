// Only fields observed in the captured first-party GraphQL query are requested.
// GraphQL returns only what is asked for: every field normalizeListing reads must
// be listed here. 1.9.0 left out the reward amounts (every offer read "No listed
// value"); before 1.10.1 marketingCopy and termsAndConditions were missing, so
// exports had no US Bank details or terms.
const LIST_OFFERS_QUERY = `query getCashbackOffersAds($request: CashbackOffersAdsRequest) {
    getCashbackOffersAds(request: $request) {
        requestId sessionTokenId
        ads { offerId rank ad {
            adType adServeToken startDate endDate merchantName categoryName
            activationState visibilityState isAffiliateMarketing
            reward { rewardType rewardAmount maxRewardAmount activationModel
                purchaseRequirement { minSpendAmount merchantUrlLinkClickRequired } }
            assets { copy { value { headline rewardCopy marketingCopy termsAndConditions } } }
        } }
    }
}`;
const ACTIVATE_OFFER_QUERY = `query ($request: ClientEventsRequestInput) {
    getActivateOffer(request: $request) { requestId }
}`;
