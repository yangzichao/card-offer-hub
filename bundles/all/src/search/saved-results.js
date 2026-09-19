// Read the existing snapshots directly; search never copies them into another store.
function hubReadSavedResults() {
    const records = [], coverage = [];
    for (const bank of HUB_BANKS) {
        const prefix = `issuer:${bank.id}:`;
        try {
            const snapshot = GM_getValue(prefix + (bank.issuer === 'amex' ? 'card_offer_hub_amex_saved_offers_v1' : `${bank.id}:workspace`), null);
            if (snapshot === null) { coverage.push({ bank, state: 'missing', count: 0 }); continue; }
            const offers = bank.issuer === 'amex'
                ? hubNormalizeAmex(bank, snapshot, GM_getValue(prefix + 'card_offer_hub_amex_saved_cards_v1', null))
                : hubNormalizeWorkspace(bank, snapshot);
            records.push(...offers);
            coverage.push({ bank, state: 'saved', count: offers.length });
        } catch {
            coverage.push({ bank, state: 'error', count: 0 });
        }
    }
    return { records, coverage };
}
function hubSearchText(value) {
    return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}
function hubFilterResults(records, preferences) {
    const terms = hubSearchText(preferences.query).trim().split(/\s+/).filter(Boolean);
    return records.filter(record => (!preferences.bank || record.bankId === preferences.bank)
        && (!preferences.status || record.status === preferences.status)
        && terms.every(term => hubSearchText([record.bankName, record.card, record.merchant, record.description, record.category].join(' ')).includes(term)))
        .sort((left, right) => left.merchant.localeCompare(right.merchant) || left.bankName.localeCompare(right.bankName) || left.card.localeCompare(right.card));
}
