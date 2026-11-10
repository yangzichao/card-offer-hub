// Wells Fargo lists amountType ("%" or "$") and dealAmount as a numeric string.
// The cap and minimum spend appear only in longDescription.
function wellsFargoOfferReward(details) {
    const kind = { '%': 'percent', $: 'fixed' }[details?.amountType];
    const text = typeof details?.dealAmount === 'string' ? details.dealAmount.trim() : '';
    const amount = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
    return hubRewardValue(kind, amount, hubRewardLimitsFromText(details?.longDescription));
}
