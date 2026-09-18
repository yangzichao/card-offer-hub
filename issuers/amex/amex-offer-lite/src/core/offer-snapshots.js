const SAVED_OFFER_FIELDS = ['id', 'name', 'description', 'expiry', 'status', 'type', 'groupKey'];
const SAVED_OFFER_STATUSES = new Set(['ELIGIBLE', 'ENROLLED', 'UNKNOWN', 'FAILED', 'UNCONFIRMED']);

function enrollmentStorageKey(accountToken, groupKey) {
    return JSON.stringify([accountToken, groupKey]);
}

function offerSnapshotValue(offer) {
    if (!offer || SAVED_OFFER_FIELDS.some((field) => typeof offer[field] !== 'string') ||
        !offer.id || !offer.groupKey || typeof offer.enrollable !== 'boolean' || !SAVED_OFFER_STATUSES.has(offer.status)) {
        throw new Error('Saved offer data has an unrecognized format.');
    }
    return { ...Object.fromEntries(SAVED_OFFER_FIELDS.map((field) => [field, offer[field]])), enrollable: offer.enrollable };
}

function validateOfferSnapshot(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.cards)) {
        throw new Error('Saved offers have an unrecognized format.');
    }
    const accounts = new Set();
    return snapshot.cards.map((card) => {
        if (!card || typeof card.accountToken !== 'string' || !card.accountToken || accounts.has(card.accountToken) ||
            !Array.isArray(card.offers) || typeof card.complete !== 'boolean' || !Number.isFinite(card.scannedAt) || card.scannedAt < 0) {
            throw new Error('Saved card offers are incomplete or invalid.');
        }
        accounts.add(card.accountToken);
        return { accountToken: card.accountToken, complete: card.complete, scannedAt: card.scannedAt,
            offers: card.offers.map(offerSnapshotValue) };
    });
}
