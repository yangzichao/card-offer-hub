const SEARCHABLE_FIELDS = ['bankName', 'card', 'merchant', 'description', 'details', 'terms', 'category'];
const STATUSES = ['available', 'added', 'review', 'other'];

function normalizedText(value) {
    return String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

// Every query word must appear somewhere in the offer, like cross-bank search,
// but full details and terms are searched too.
function filterOffers(offers, { query = '', bank = '', status = '' } = {}) {
    if (status && !STATUSES.includes(status)) throw new Error(`Unknown status "${status}". Use one of: ${STATUSES.join(', ')}.`);
    const terms = normalizedText(query).split(/\s+/).filter(Boolean);
    const bankFilter = normalizedText(bank);
    return offers.filter(offer => (!bankFilter || normalizedText(offer.bankId) === bankFilter || normalizedText(offer.bankName).includes(bankFilter))
        && (!status || offer.status === status)
        && terms.every(term => normalizedText(SEARCHABLE_FIELDS.map(field => offer[field]).join(' ')).includes(term)));
}

module.exports = { filterOffers, STATUSES };
