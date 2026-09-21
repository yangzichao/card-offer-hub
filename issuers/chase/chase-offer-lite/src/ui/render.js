function chaseCardDisplayName(card) {
    return card.lastFour ? `${card.name} · ${card.lastFour}` : card.name;
}

function renderOffers() {
    if (!state.panel) return;
    const container = state.panel.getElementById('offers');
    container.replaceChildren();
    const search = state.search;
    const visible = state.offers.filter(offer => state.selected.has(offer.accountId)).filter(offer => hubMatchesSearch(offer, search));
    if (!visible.length) {
        const note = document.createElement('p');
        note.className = 'muted';
        note.textContent = search.trim() ? 'No offers match your search.'
            : state.selected.size ? 'No saved offers on these cards. Use Refresh & add offers.' : 'Your selected cards’ offers will appear here.';
        container.appendChild(note);
    }
    for (const offer of visible.slice(0, 200)) {
        const row = document.createElement('div');
        row.className = 'offer';
        const title = document.createElement('strong');
        title.textContent = [offer.merchant, offer.title].filter(Boolean).join(' · ');
        const detail = document.createElement('small');
        const card = state.accounts.find(account => account.accountId === offer.accountId);
        const statusLabel = !state.needsScan && ['NEW', 'SERVED'].includes(offer.status) && !offer.activationParameters
            ? 'Add on Chase: click details unavailable' : offer.status === 'SERVED' ? 'Available' : hubOfferStatusLabel(offer.status);
        detail.textContent = [card ? chaseCardDisplayName(card) : 'Card', statusLabel, offer.expires].filter(Boolean).join(' · ');
        row.append(title, detail);
        container.appendChild(row);
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
    renderHubPacingDetails(panel, state);
    panel.getElementById('workspace-cache').textContent = state.lastScanAt
        ? `Offers last refreshed: ${new Date(state.lastScanAt).toLocaleString()}` : '';
    const blocked = state.busy || Boolean(state.storageError);
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    const scopeOffers = state.offers.filter(offer => state.selected.has(offer.accountId));
    const newCount = offerWorkflow.preview().length;
    const activatedCount = scopeOffers.filter(offer => offer.status === 'ACTIVATED').length;
    panel.getElementById('counts').textContent = `${newCount} available · ${activatedCount} added`;
    const cards = panel.getElementById('cards');
    cards.replaceChildren();
    if (!state.accounts.length) {
        const note = document.createElement('p');
        note.className = 'muted';
        note.textContent = 'Load your cards to get started.';
        cards.appendChild(note);
    }
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
        label.append(checkbox, document.createTextNode(`${cardName}${card.eligible === false ? ' · Refresh to check' : ''}`));
        cards.appendChild(label);
    }
    renderChaseActions(panel);
    renderOffers();
}
