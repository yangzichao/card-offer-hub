// Hand-authored synthetic values, matching the shape observed in the second HAR.
// The real response does not echo accountId; correlate it with the serial request.
function enrollmentResponse(offerId) {
    return {
        MerchantOfferDetails: {
            merchantBannerImageUrl: 'https://example.invalid/banner.png',
            merchantCategory: 'Shopping',
            merchantImageUrl: 'https://example.invalid/logo.png',
            merchantLocation: null,
            merchantName: 'Synthetic Merchant',
            merchantOfferText: [{
                languagePreference: 'English',
                offerDescription: 'Synthetic offer description',
                offerLongDescription: 'Synthetic long description',
                offerTitle: '$5 Back',
                offerUsesPerPeriodText: null,
                termsAndConditionsText: 'Synthetic terms for offline testing only.'
            }],
            offerDiscount: '5.0',
            offerDiscountType: 'CashBack',
            offerEndDate: 'Dec 31, 2099',
            offerId,
            offerStatus: 'ENROLLED',
            offerType: 'SYNTHETIC',
            redemptionType: 'Online',
            storeLocatorUrl: null,
            websiteUrl: 'https://example.invalid'
        },
        EnrolledOfferInfo: {
            ActivatedCouponInformation: {
                activatedCouponUrl: null, contentType: null, couponText: [], redemptionType: null
            },
            enrollmentId: 'synthetic-enrollment-id',
            offerEndDate: 'Dec 31, 2099'
        }
    };
}
module.exports = { enrollmentResponse };
