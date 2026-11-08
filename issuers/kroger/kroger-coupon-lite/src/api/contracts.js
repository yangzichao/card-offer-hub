// Contracts observed on www.kroger.com Coupons (2026-11-07). The list and clip
// endpoints are same-origin; the page sends its context headers with both.
const KROGER_COUPONS_PATH = '/atlas/v1/savings-coupons/v2/coupons';
const KROGER_CLIP_PATH = '/atlas/v1/savings-coupons/v1/clip-unclip';
// Kroger's list filter for coupons that can still be clipped.
function krogerCouponPageUrl(offset) {
    const parameters = new URLSearchParams([
        ['filter.sort', 'relevance'], ['filter.onlyNewCoupons', 'false'],
        ['page.size', String(SETTINGS.couponPageSize)],
        ['filter.status', 'unclipped'], ['filter.status', 'active'],
        ['page.offset', String(offset)]
    ]);
    return `${KROGER_COUPONS_PATH}?${parameters}`;
}
function krogerText(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function krogerCouponIdentifier(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
    if (typeof value === 'string' && /^\d+$/.test(value) && /[1-9]/.test(value)) return value;
    return '';
}
function normalizeKrogerCoupon(raw) {
    const offerId = krogerCouponIdentifier(raw?.id);
    if (!offerId) throw new Error('Kroger returned an incomplete coupon record. Reload Coupons and try again.');
    const couponNumber = krogerCouponIdentifier(raw.krogerCouponNumber);
    // Only explicit flags count. A coupon without its confirmation key cannot be
    // verified after clipping, so it is never offered for clipping.
    const status = raw.addedToCard === true ? 'ACTIVATED'
        : raw.canBeAddedToCard === true && raw.addedToCard === false && couponNumber ? 'AVAILABLE' : 'UNAVAILABLE';
    return {
        offerId, couponNumber, status,
        merchant: krogerText(raw.brand) || 'Kroger',
        title: krogerText(raw.displayDescription) || krogerText(raw.shortDescription) || krogerText(raw.title),
        category: Array.isArray(raw.categories) ? raw.categories.map(krogerText).filter(Boolean).join(', ') : '',
        expires: krogerText(raw.expirationDate)
    };
}
function normalizeKrogerCouponPage(payload) {
    const coupons = payload?.data?.coupons;
    const page = payload?.meta?.coupons?.page;
    if (!Array.isArray(coupons) || typeof page?.hasMore !== 'boolean') {
        throw new Error('Kroger coupon list was not recognized. Reload Coupons and try again.');
    }
    return { coupons: coupons.map(normalizeKrogerCoupon), hasMore: page.hasMore };
}
// The same coupon can appear twice while Kroger re-sorts pages. Matching copies
// merge; disagreeing copies become CONFLICT and are never clipped.
function mergeKrogerCoupons(couponsById, coupons) {
    for (const coupon of coupons) {
        const existing = couponsById.get(coupon.offerId);
        if (!existing) { couponsById.set(coupon.offerId, coupon); continue; }
        if (existing.status !== coupon.status || existing.couponNumber !== coupon.couponNumber) existing.status = 'CONFLICT';
    }
    return couponsById;
}
function krogerClipBody(coupon) {
    return JSON.stringify({ action: 'CLIP', couponId: coupon.offerId });
}
// HTTP 200 alone is not success: the response must name this coupon's number.
function krogerClipConfirmed(payload, coupon) {
    const modified = payload?.data?.modifiedCoupons;
    return Boolean(coupon.couponNumber) && Array.isArray(modified)
        && modified.some(item => krogerCouponIdentifier(item?.krogerCouponNumber) === coupon.couponNumber);
}
