function readIssuerSavedResults(bank, readValue) {
    const snapshot = readValue('card_offer_hub_amex_saved_offers_v1', null);
    if (snapshot === null) return null;
    return amexSavedDisplayRecords(bank, snapshot, readValue('card_offer_hub_amex_saved_cards_v1', null));
}
function amexSavedDisplayRecords(bank, snapshot, savedCards) {
    snapshot = hubMigrateWorkflowSnapshot(snapshot, __USERSCRIPT_WORKFLOW__);
    if (!Array.isArray(snapshot.cards)) throw new Error('Unsupported saved results');
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
        return card.offers.map(offer => hubOfferRecord(bank, {
            merchant: offer.name, description: offer.description || offer.title,
            displayStatus: hubStatus(offer.status) === 'available' && offer.enrollable !== true ? 'other' : hubStatus(offer.status),
            expires: offer.expires || offer.expiry, category: offer.category
        }, {
            card: accounts.get(card.accountToken) || 'Saved card', scannedAt: card.scannedAt, incomplete: !card.complete
        }));
    });
}
