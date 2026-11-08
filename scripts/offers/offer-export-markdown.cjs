function exportAgeText(exportedAt, now) {
    const days = Math.floor((now - Date.parse(exportedAt)) / 86400000);
    return Number.isFinite(days) ? (days <= 0 ? 'today' : `${days} day(s) ago`) : 'unknown';
}

function renderOfferMarkdown(offer, includeDetails) {
    const lines = [`- **${offer.merchant || 'Offer'}** — ${offer.description || '(no summary)'}`,
        `  - status: ${offer.status}${offer.incomplete ? ' (card scan incomplete)' : ''} · expires: ${offer.expires || 'unknown'} · scanned: ${offer.scannedAt || 'unknown'}`];
    if (offer.category) lines.push(`  - category: ${offer.category}`);
    if (includeDetails && offer.details) lines.push(`  - details: ${offer.details.replace(/\s+/g, ' ')}`);
    if (includeDetails && offer.terms) lines.push(`  - terms: ${offer.terms.replace(/\s+/g, ' ')}`);
    return lines.join('\n');
}

// Grouped by bank, then card, so an agent can answer "which card has X".
function renderExportMarkdown({ filePath, exported, offers, includeDetails = true, now = Date.now() }) {
    const output = [`# Card Offer Hub saved offers`, '',
        `- file: ${filePath}`,
        `- exported: ${exported.exportedAt} (${exportAgeText(exported.exportedAt, now)}), release ${exported.release || 'unknown'}`,
        `- note: ${exported.note || ''}`,
        `- coverage: ${exported.coverage.map(entry => `${entry.bankName} ${entry.state}${entry.state === 'saved' ? ` (${entry.count})` : ''}`).join(', ')}`,
        `- matching offers: ${offers.length} of ${exported.offers.length}`];
    const banks = new Map();
    for (const offer of offers) {
        const cards = banks.get(offer.bankName) || new Map();
        cards.set(offer.card, [...(cards.get(offer.card) || []), offer]);
        banks.set(offer.bankName, cards);
    }
    for (const [bankName, cards] of banks) {
        output.push('', `## ${bankName}`);
        for (const [card, cardOffers] of cards) {
            output.push('', `### ${card}`, '', ...cardOffers.map(offer => renderOfferMarkdown(offer, includeDetails)));
        }
    }
    return output.join('\n') + '\n';
}

module.exports = { renderExportMarkdown };
