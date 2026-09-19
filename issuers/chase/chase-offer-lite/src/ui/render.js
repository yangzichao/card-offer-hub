function chaseCardDisplayName(card) {
    return card.lastFour ? `${card.name} · ${card.lastFour}` : card.name;
}

function renderOffers() {
    if (!state.panel) return;
    const container = state.panel.getElementById('offers');
    container.replaceChildren();
    const search = state.search.trim().toLowerCase();
    const visible = state.offers.filter(offer => `${offer.merchant} ${offer.title}`.toLowerCase().includes(search));
    for (const offer of visible.slice(0, 200)) {
        const row = document.createElement('div');
        row.className = 'offer';
        const title = document.createElement('strong');
        title.textContent = [offer.merchant, offer.title].filter(Boolean).join(' · ');
        const detail = document.createElement('small');
        const card = state.accounts.find(account => account.accountId === offer.accountId);
        detail.textContent = [card ? chaseCardDisplayName(card) : 'Card', offer.status, offer.expires].filter(Boolean).join(' · ');
        row.append(title, detail);
        container.appendChild(row);
    }
    if (!visible.length) {
        const note = document.createElement('p');
        note.className = 'muted';
        note.textContent = search ? 'No offers match your search.' : 'No offers to display. Select cards and scan to load offers.';
        container.appendChild(note);
    }
    if (visible.length > 200) {
        const note = document.createElement('p');
        note.className = 'muted';
        note.textContent = `Showing 200 of ${visible.length}; search to narrow the display. This limit does not affect scanning.`;
        container.appendChild(note);
    }
}

function renderPanel() {
    if (!state.panel) return;
    const panel = state.panel;
    const blocked = state.busy || Boolean(state.storageError);
    panel.getElementById('detect').disabled = blocked;
    panel.getElementById('scan').disabled = blocked || !state.selected.size;
    panel.getElementById('add').disabled = blocked || !state.enrollmentSupported || !state.selected.size || state.needsScan;
    panel.getElementById('stop').disabled = !state.busy || state.stopRequested;
    panel.getElementById('enrollment-notice').hidden = Boolean(state.enrollmentSupported);
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    const newCount = state.offers.filter(offer => offer.status === 'NEW').length;
    const activatedCount = state.offers.filter(offer => offer.status === 'ACTIVATED').length;
    panel.getElementById('counts').textContent = `${state.offers.length} offers · ${newCount} new · ${activatedCount} activated`;
    const cards = panel.getElementById('cards');
    cards.replaceChildren();
    for (const card of state.accounts) {
        const label = document.createElement('label');
        label.className = 'card';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.selected.has(card.accountId);
        checkbox.disabled = blocked || card.eligible === false;
        const cardName = chaseCardDisplayName(card);
        checkbox.setAttribute('aria-label', `Select ${cardName}`);
        checkbox.addEventListener('change', () => setCardSelected(card.accountId, checkbox.checked));
        label.append(checkbox, document.createTextNode(`${cardName}${card.eligible === false ? ' · Not eligible for Offers' : ''}`));
        cards.appendChild(label);
    }
    renderOffers();
}
