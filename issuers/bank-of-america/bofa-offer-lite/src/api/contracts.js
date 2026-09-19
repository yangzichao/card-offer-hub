function normalizeLocation(payload) {
    if (!Number.isFinite(payload?.latitude) || Math.abs(payload.latitude) > 90
        || !Number.isFinite(payload?.longitude) || Math.abs(payload.longitude) > 180) {
        throw new Error('Deals did not return a valid location. Scan stopped.');
    }
    return { latitude: payload.latitude, longitude: payload.longitude };
}
function normalizeOffer(raw) {
    if (!raw || typeof raw.offer_id !== 'string' || !/^\d+$/.test(raw.offer_id)
        || (raw.id !== undefined && raw.id !== raw.offer_id)
        || typeof raw.is_activated !== 'boolean') throw new Error('Unrecognized offer identity or activation state.');
    let reason = '';
    if (raw.is_activated) reason = 'Already activated';
    else if (raw.type !== 'CARD_LINKED') reason = 'Not an ordinary card-linked offer';
    else if (raw.activation_required !== true) reason = 'No explicit activation required';
    else if (raw.activation_type !== 'CLICK') reason = 'Shopping link / unsupported activation';
    else if (!Array.isArray(raw.activation_triggers) || raw.activation_triggers.length !== 1
        || raw.activation_triggers[0] !== 'OFFER_DETAILS_CLICK') reason = 'Unsupported activation trigger';
    return {
        id: raw.offer_id, name: typeof raw.merchant_name === 'string' ? raw.merchant_name : 'Merchant',
        headline: typeof raw.headline === 'string' ? raw.headline : '',
        eligible: !reason, activated: raw.is_activated, reason, result: ''
    };
}
function normalizePage(payload) {
    if (!payload || !Array.isArray(payload.offers) || !Number.isSafeInteger(payload.total)
        || payload.total < 0 || payload.total > 10000 || payload.user_information_available === false
        || payload.offers.length > SETTINGS.pageSize) throw new Error('Unrecognized or incomplete Deals search response.');
    return { offers: payload.offers.map(normalizeOffer), total: payload.total };
}
function normalizeDetail(payload, expectedId) {
    const offer = normalizeOffer(payload?.offer);
    if (offer.id !== expectedId) throw new Error('Offer detail identity mismatch. Activation unconfirmed; scan again.');
    return offer;
}
