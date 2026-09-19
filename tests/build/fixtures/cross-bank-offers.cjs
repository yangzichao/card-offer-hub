const scannedAt = Date.UTC(2026, 8, 19, 12);
function workspace(overrides) {
    return { schemaVersion: 1, savedAt: scannedAt, lastScanAt: scannedAt, scopeIdentity: '',
        consent: false, search: '', collapsed: false, accounts: [], offers: [], selected: [], ...overrides };
}
function offer(overrides) {
    return { accountId: 'card-citi', offerId: 'example-offer', status: 'AVAILABLE',
        merchant: 'Everyday Market', title: 'Spend $75, get $10 back', category: 'Groceries', expires: '2026-10-31', ...overrides };
}
function crossBankStorage() {
    const storage = new Map();
    const set = (id, key, value) => storage.set(`issuer:${id}:${key}`, value);
    set('amex-offer-lite', 'card_offer_hub_amex_saved_cards_v1', { schemaVersion: 2, detected: true,
        accounts: [{ token: 'synthetic-amex-card', cardName: 'Gold · 1001' }], whitelist: ['synthetic-amex-card'], priorityOrder: ['synthetic-amex-card'] });
    set('amex-offer-lite', 'card_offer_hub_amex_saved_offers_v1', { schemaVersion: 1, cards: [{ accountToken: 'synthetic-amex-card', complete: true, scannedAt,
        offers: [{ id: 'amex-market', groupKey: 'amex-market', name: 'Everyday Market', description: 'Spend $100, get $15 back', expiry: '2026-10-20', status: 'ELIGIBLE', type: 'OFFER', enrollable: true }] }] });
    set('citi-offer-lite', 'citi-offer-lite:workspace', workspace({ accounts: [{ accountId: 'card-citi', name: 'Custom Cash · 2002' }], selected: ['card-citi'],
        offers: [offer({}), offer({ offerId: 'citi-review', merchant: 'Café Atlas', title: 'Earn 5% back on dining', status: 'UNCONFIRMED', category: 'Dining' })] }));
    set('chase-offer-lite', 'chase-offer-lite:workspace', workspace({ accounts: [{ accountId: 'card-chase', name: 'Sapphire · 3003', lastFour: '3003', eligible: true }],
        offers: [offer({ accountId: 'card-chase', merchant: 'Northline Travel', title: 'Earn $20 back on your next trip', status: 'ENROLLED' })] }));
    set('bofa-offer-lite', 'bofa-offer-lite:workspace', workspace({ offers: [{ id: 'bofa-offer', name: 'Harbor Home', headline: 'Get 10% back on home essentials', eligible: true, activated: false, reason: '', result: '' }] }));
    set('usbank-offer-lite', 'usbank-offer-lite:workspace', workspace({ offers: [offer({ merchant: 'Trail & Field', title: 'Earn 8% back on outdoor gear', starts: '' })] }));
    set('wellsfargo-offer-lite', 'wellsfargo-offer-lite:workspace', workspace({ offers: [offer({ merchant: 'Everyday Market', status: 'ACTIVATED', title: 'Earn 5% back on groceries' })] }));
    return storage;
}
module.exports = { crossBankStorage, workspace, offer };
