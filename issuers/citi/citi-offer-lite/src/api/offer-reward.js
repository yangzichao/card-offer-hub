// Citi's list has no numeric reward field. offerTitle is always "$30 Back" or
// "5% Back" (37 distinct titles in 695 offers), and offerDiscountType says which
// (ABSOLUTE or PERCENTAGE). A title that disagrees with its type is unknown.
// The list carries no cap or minimum spend.
function citiOfferReward(raw) {
    const match = /^\s*(\$)?(\d+(?:\.\d+)?)(%)?\s+back\s*$/i.exec(typeof raw?.offerTitle === 'string' ? raw.offerTitle : '');
    if (!match || Boolean(match[1]) === Boolean(match[3])) return null;
    const kind = match[1] ? 'fixed' : 'percent';
    const declared = { ABSOLUTE: 'fixed', PERCENTAGE: 'percent' }[raw.offerDiscountType];
    if (raw.offerDiscountType != null && declared !== kind) return null;
    return hubRewardValue(kind, Number(match[2]));
}
