function hubText(value) { return typeof value === 'string' ? value : ''; }
function hubTimestamp(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
function hubStatus(value) {
    if (['AVAILABLE', 'ELIGIBLE'].includes(value)) return 'available';
    if (['ENROLLED', 'ACTIVATED'].includes(value)) return 'added';
    if (['UNCONFIRMED', 'UNKNOWN', 'FAILED', 'CONFLICT'].includes(value)) return 'review';
    return 'other';
}
function hubOfferRecord(bank, offer, context) {
    if (!offer || typeof offer !== 'object' || Array.isArray(offer)) throw new Error('Invalid saved offer');
    const merchant = hubText(offer.merchant || offer.name);
    const description = hubText(offer.title || offer.description || offer.headline);
    if (!merchant && !description) throw new Error('Missing saved offer text');
    let status = hubStatus(offer.status);
    if (bank.issuer === 'amex' && status === 'available' && offer.enrollable !== true) status = 'other';
    if (bank.issuer === 'bank-of-america') {
        status = offer.result === 'Unconfirmed' ? 'review' : offer.activated === true ? 'added' : offer.eligible === true ? 'available' : 'other';
    }
    return { bankId: bank.id, bankName: bank.label, merchant, description,
        card: context.card || 'Account-wide', scannedAt: hubTimestamp(context.scannedAt),
        incomplete: Boolean(context.incomplete), status, expires: hubText(offer.expires || offer.expiry),
        category: hubText(offer.category), url: bank.url };
}
function hubNormalizeWorkspace(bank, snapshot) {
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.offers) || !Array.isArray(snapshot.accounts)) {
        throw new Error('Unsupported saved results');
    }
    const accounts = new Map(snapshot.accounts.map(account => {
        if (!account || typeof account.accountId !== 'string' || typeof account.name !== 'string') throw new Error('Invalid saved card');
        return [account.accountId, account.name];
    }));
    return snapshot.offers.map(offer => hubOfferRecord(bank, offer, {
        card: accounts.get(offer?.accountId) || (['chase', 'citi'].includes(bank.issuer) ? 'Saved card' : 'Account-wide'),
        scannedAt: snapshot.lastScanAt
    }));
}
function hubNormalizeAmex(bank, snapshot, savedCards) {
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.cards)) throw new Error('Unsupported saved results');
    const accounts = new Map();
    if (savedCards) {
        if (![1, 2].includes(savedCards.schemaVersion) || !Array.isArray(savedCards.accounts)) throw new Error('Unsupported saved cards');
        for (const account of savedCards.accounts) {
            if (!account || typeof account.token !== 'string' || typeof account.cardName !== 'string') throw new Error('Invalid saved card');
            accounts.set(account.token, account.cardName);
        }
    }
    return snapshot.cards.flatMap(card => {
        if (!card || typeof card.accountToken !== 'string' || !Array.isArray(card.offers) || typeof card.complete !== 'boolean') {
            throw new Error('Invalid saved card results');
        }
        return card.offers.map(offer => hubOfferRecord(bank, offer, {
            card: accounts.get(card.accountToken) || 'Saved card', scannedAt: card.scannedAt, incomplete: !card.complete
        }));
    });
}
