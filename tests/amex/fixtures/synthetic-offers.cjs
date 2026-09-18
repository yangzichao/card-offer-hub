function rawOffer(identifier, status = 'NOT_ENROLLED', overrides = {}) {
    return {
        offerId: identifier, offerType: 'MERCHANT', title: `Synthetic offer ${identifier}`,
        shortDescription: 'Spend $50, receive $10', longDescription: 'Synthetic terms only',
        expiration: { text: 'Expires Dec 31' }, terms: { details: 'Synthetic terms' },
        ctaDetails: { ctaType: 'MODAL' }, enrollmentDetails: { status }, ...overrides
    };
}

function hubResponse(section, offers, extra = {}) {
    return { status: { purpose: 'SUCCESS' }, [section]: { offersList: { page1: offers } }, ...extra };
}

function confirmation(identifier, extra = {}) {
    return { isEnrolled: true, identifier, ...extra };
}

module.exports = { rawOffer, hubResponse, confirmation };
