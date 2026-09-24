function hubOfferStatusTone(label) {
    return { Available: 'available', Added: 'added', 'Needs review': 'review' }[label] || 'skipped';
}
// One scannable row: merchant and status on top, the offer itself, then card and dates.
function hubOfferRow({ merchant = '', title = '', status = '', meta = [], tag = 'div', leading = null }) {
    const row = document.createElement(tag);
    row.className = 'offer offer-row';
    if (leading) row.append(leading);
    const body = document.createElement('div');
    body.className = 'offer-body';
    const head = document.createElement('div');
    head.className = 'offer-head';
    const name = document.createElement('strong');
    name.className = 'offer-merchant';
    name.textContent = merchant || title || 'Offer';
    head.append(name);
    if (status) {
        const chip = document.createElement('span');
        chip.className = `offer-status ${hubOfferStatusTone(status)}`;
        chip.textContent = status;
        head.append(chip);
    }
    body.append(head);
    if (merchant && title) {
        const value = document.createElement('div');
        value.className = 'offer-value';
        value.textContent = title;
        body.append(value);
    }
    const details = meta.filter(Boolean);
    if (details.length) {
        const small = document.createElement('small');
        small.textContent = details.join(' · ');
        body.append(small);
    }
    row.append(body);
    return row;
}
function hubOfferExpiry(expires) {
    return expires ? `Expires ${expires}` : '';
}
