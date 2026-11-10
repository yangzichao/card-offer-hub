// Chase lists the reward in offerDetails.offerOptions: one option with a type
// (PERCENTAGE or DOLLAR), the amount, a cap and a minimum spend; 0 means none.
// Observed: every one of 170 offers had exactly one option.
function chaseOfferReward(raw) {
    const options = raw?.offerDetails?.offerOptions;
    if (!Array.isArray(options) || options.length !== 1) return null;
    const [option] = options;
    const kind = { PERCENTAGE: 'percent', DOLLAR: 'fixed' }[option?.offerRewardTypeCode];
    return hubRewardValue(kind, option?.offerAmount,
        { maxReward: option?.maximumRewardOfferAmount, minSpend: option?.minimumSpendingAmount });
}
