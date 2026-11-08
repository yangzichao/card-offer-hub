// Entirely synthetic: never substitute captured coupon, loyalty-card or account data.
function coupon(id, extra = {}) {
    return { id, krogerCouponNumber: `90000${id}`, brand: `Example Brand ${id}`,
        displayDescription: `Save $1.00 on ${id}`, categories: ['Pantry'], expirationDate: '2099-12-31',
        canBeAddedToCard: true, addedToCard: false, ...extra };
}
function couponPage(coupons, hasMore = false, offset = 0) {
    return { data: { coupons }, meta: { coupons: {
        page: { offset, size: 72, hasMore },
        filterSummaryByType: { totalCount: coupons.length }
    } } };
}
function clipResponse(couponNumbers) {
    return { data: { modifiedCoupons: couponNumbers.map(krogerCouponNumber => ({ krogerCouponNumber, loyaltyCardNumber: 'synthetic-card' })) } };
}
const contextHeaders = {
    'x-kroger-channel': 'WEB', 'x-modality': '{"type":"PICKUP","locationId":"00000000"}',
    'x-modality-type': 'PICKUP', 'x-facility-id': '00000000',
    'x-laf-object': '[{"modality":{"type":"PICKUP"},"sources":[]}]', 'x-ab-test': '[]'
};
module.exports = { coupon, couponPage, clipResponse, contextHeaders };
