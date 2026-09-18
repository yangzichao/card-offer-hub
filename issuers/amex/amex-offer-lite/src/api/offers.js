class OfferSchemaError extends Error {}

function offersInSection(response, sectionName) {
    if (response?.status?.purpose && response.status.purpose !== 'SUCCESS') {
        throw new Error('Offers Hub reported an unsuccessful response.');
    }
    const section = response?.[sectionName];
    const pages = section?.offersList;
    if (!pages || typeof pages !== 'object' || Array.isArray(pages)) {
        throw new OfferSchemaError(`Offers Hub ${sectionName}.offersList was not recognized; this view is incomplete.`);
    }
    if (section.hasMore === true || section.nextPage || response.hasMore === true || response.nextPage) {
        throw new OfferSchemaError('Offers Hub indicated additional server pages; this view is incomplete.');
    }
    const offers = Object.values(pages).flatMap((page) => {
        if (!Array.isArray(page)) throw new OfferSchemaError('An Offers Hub page was not a list.');
        return page;
    });
    if (offers.some((offer) => !offer || typeof offer.offerId !== 'string')) {
        throw new OfferSchemaError('An Offer did not contain a valid identifier.');
    }
    return offers;
}

function normalizeHubOffer(offer) {
    const enrollmentStatus = offer.enrollmentDetails?.status;
    const status = enrollmentStatus === 'NOT_ENROLLED' ? 'ELIGIBLE'
        : enrollmentStatus === 'ENROLLED' ? 'ENROLLED' : 'UNKNOWN';
    const name = offer.title || 'Untitled offer';
    const description = offer.shortDescription || '';
    const expiry = offer.expiration?.text || '';
    return {
        id: offer.offerId, name, description, expiry, status,
        type: offer.offerType || 'UNKNOWN',
        enrollable: offer.offerType === 'MERCHANT' && offer.ctaDetails?.ctaType === 'MODAL',
        // Hub IDs may be card-specific. Group only offers with the same visible terms.
        groupKey: JSON.stringify([offer.offerType, name, description, expiry, offer.longDescription || '', offer.terms?.details || '']
            .map((value) => String(value || '').replace(/\s+/g, ' ').trim()))
    };
}

async function getAllOffersForAccount(accountToken, onProgress = () => {}) {
    const collected = new Map();
    const viewErrors = [];
    for (const [requestType, sectionName] of [
        ['OFFERSHUB_LANDING', 'recommendedOffers'],
        // The full added view has a different key from the landing/enrollment preview.
        ['ADDEDTOCARD_LANDING', 'addedToCardViewAll']
    ]) {
        requireActiveRequest();
        const response = await requestHub('ReadOffersHubPresentation.web.v1', accountToken, {
            offerPage: 'page1', requestType
        });
        if (response?.accountNumberProxy && response.accountNumberProxy !== accountToken) {
            throw new Error('Offers Hub returned a different card; this scan was stopped.');
        }
        try {
            for (const rawOffer of offersInSection(response, sectionName)) {
                const offer = normalizeHubOffer(rawOffer);
                // Prefer the enrolled view if the same offer appears in both lists.
                if (collected.get(offer.id)?.status !== 'ENROLLED') collected.set(offer.id, offer);
            }
        } catch (error) {
            if (!(error instanceof OfferSchemaError)) throw error;
            viewErrors.push(error.message);
            // Preserve valid results and continue to the other view/card at the same slow pace.
        }
        onProgress([...collected.values()]);
    }
    return { offers: [...collected.values()], viewErrors };
}
