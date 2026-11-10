// US Bank lists the reward in ad.reward: rewardType, rewardAmount, maxRewardAmount
// and purchaseRequirement.minSpendAmount. Most offers send a minimum of 0.2 for
// "any purchase", so a minimum under $1 is treated as no minimum.
function usbankOfferReward(reward) {
    const kind = { PERCENT_AMOUNT_PURCHASE: 'percent', FIXED_AMOUNT_PURCHASE: 'fixed' }[reward?.rewardType];
    const minSpend = reward?.purchaseRequirement?.minSpendAmount;
    return hubRewardValue(kind, reward?.rewardAmount,
        { maxReward: reward?.maxRewardAmount, minSpend: typeof minSpend === 'number' && minSpend >= 1 ? minSpend : null });
}
