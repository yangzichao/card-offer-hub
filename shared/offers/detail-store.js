// Long offer text (full description and terms) is kept apart from the workspace
// snapshot: it is written once per completed scan, never on each add, and
// identical text shared by many offers or cards is stored once.
const HUB_OFFER_DETAIL_SCHEMA_VERSION = 1;
const HUB_OFFER_DETAIL_MAX_CHARACTERS = 8000;
function hubOfferDetailText(value) {
    return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, HUB_OFFER_DETAIL_MAX_CHARACTERS) : '';
}
// Returns Map(offerKey -> { details, terms }). Unknown versions and malformed
// data throw so callers can preserve them instead of overwriting.
function hubDecodeOfferDetails(saved) {
    if (saved === null || saved === undefined) return new Map();
    if (!saved || saved.schemaVersion !== HUB_OFFER_DETAIL_SCHEMA_VERSION || !Array.isArray(saved.texts)
        || !saved.entries || typeof saved.entries !== 'object' || Array.isArray(saved.entries)) {
        throw new Error('Unsupported saved offer details');
    }
    const text = index => {
        if (index === -1) return '';
        if (!Number.isSafeInteger(index) || typeof saved.texts[index] !== 'string') throw new Error('Invalid saved offer details');
        return saved.texts[index];
    };
    return new Map(Object.entries(saved.entries).map(([key, value]) => {
        if (!Array.isArray(value) || value.length !== 2) throw new Error('Invalid saved offer details');
        return [key, { details: text(value[0]), terms: text(value[1]) }];
    }));
}
function hubEncodeOfferDetails(detailsByKey, savedAt) {
    const texts = [], indexes = new Map(), entries = {};
    const intern = value => {
        if (!value) return -1;
        if (!indexes.has(value)) { indexes.set(value, texts.length); texts.push(value); }
        return indexes.get(value);
    };
    for (const [key, value] of detailsByKey) {
        if (value.details || value.terms) entries[key] = [intern(value.details), intern(value.terms)];
    }
    return { schemaVersion: HUB_OFFER_DETAIL_SCHEMA_VERSION, savedAt, texts, entries };
}
// Offers read in this scan carry runtime details/terms. Offers restored from an
// earlier scan (for example, cards not refreshed this time) keep their saved text.
// Offers no longer in the workspace are dropped.
function hubMergeOfferDetails(previous, offers, keyOf) {
    const next = new Map();
    for (const offer of offers) {
        const key = keyOf(offer);
        const fresh = typeof offer.details === 'string' || typeof offer.terms === 'string';
        const value = fresh ? { details: hubOfferDetailText(offer.details), terms: hubOfferDetailText(offer.terms) } : previous.get(key);
        if (value) next.set(key, value);
    }
    return next;
}
