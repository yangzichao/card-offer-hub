// A local file for people and AI agents. It holds exactly what cross-bank
// search shows (display fields plus saved full text); no account identifiers,
// request data or credentials exist in these records.
const HUB_OFFER_EXPORT_FORMAT = 'card-offer-hub-offers';
const HUB_OFFER_EXPORT_SCHEMA_VERSION = 1;
function hubIsoTime(milliseconds) {
    return milliseconds > 0 ? new Date(milliseconds).toISOString() : null;
}
function hubBuildOfferExport(saved, exportedAt) {
    const offers = saved.records.map(record => ({
        bankId: record.bankId, bankName: record.bankName, card: record.card,
        merchant: record.merchant, description: record.description, details: record.details || '', terms: record.terms || '',
        category: record.category, status: record.status, expires: record.expires,
        scannedAt: hubIsoTime(record.scannedAt), incomplete: record.incomplete, url: record.url
    })).sort((left, right) => left.bankName.localeCompare(right.bankName) || left.card.localeCompare(right.card)
        || left.merchant.localeCompare(right.merchant));
    return {
        format: HUB_OFFER_EXPORT_FORMAT, schemaVersion: HUB_OFFER_EXPORT_SCHEMA_VERSION,
        exportedAt: hubIsoTime(exportedAt), release: HUB_RELEASE_VERSION,
        note: 'Saved results from each bank\'s last manual scan. Status is as of scannedAt; confirm current terms on the bank website.',
        statuses: { available: 'Available when scanned', added: 'Added', review: 'Needs review', other: 'Other / skipped' },
        coverage: saved.coverage.map(entry => ({ bankId: entry.bank.id, bankName: entry.bank.label, state: entry.state, count: entry.count })),
        offers
    };
}
function hubOfferExportFileName(exportedAt) {
    return `${HUB_OFFER_EXPORT_FORMAT}-${new Date(exportedAt).toISOString().replace(/[:.]/g, '-')}.json`;
}
// Same download path as the pacing debug log: a Blob link the user clicked for.
function hubDownloadOfferExport(saved, exportedAt = Date.now()) {
    const file = new Blob([JSON.stringify(hubBuildOfferExport(saved, exportedAt), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = hubNode('a');
    link.href = url;
    link.download = hubOfferExportFileName(exportedAt);
    document.body.append(link);
    try { link.click(); }
    finally { link.remove(); URL.revokeObjectURL(url); }
    return link.download;
}
