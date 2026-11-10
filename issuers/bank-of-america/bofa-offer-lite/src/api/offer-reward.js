// Deals lists reward_type (FIXED or PERCENTAGE) with reward_value in dollars or
// reward_rate in percent. The headline is not reliable ("Shop and Earn Today").
// A cap counts only when the offer can be used once; minimum spend comes from
// minimum_spend or the "when you spend $75" phrase.
function bofaOfferReward(raw) {
    const kind = { FIXED: 'fixed', PERCENTAGE: 'percent' }[raw?.reward_type];
    const amount = kind === 'fixed' ? raw.reward_value : raw?.reward_rate;
    const written = hubRewardLimitsFromText(raw?.headline, raw?.description);
    return hubRewardValue(kind, amount, {
        maxReward: raw?.maximum_redemptions === 1 ? raw.maximum_reward_per_transaction : written.maxReward,
        minSpend: hubRewardNumber(raw?.minimum_spend) ?? written.minSpend
    });
}
