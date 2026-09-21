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
        title.textContent = `${offer.merchant} · ${offer.title}`;
        const detail = document.createElement('small');
        const card = state.accounts.find(account => account.accountId === offer.accountId);
        detail.textContent = `${card?.name || 'Card'} · ${hubOfferStatusLabel(offer.status)} · ${offer.expires}`;
        row.append(title, detail);
        container.appendChild(row);
    }
    if (visible.length > 200) {
        const note = document.createElement('p');
        note.textContent = `Showing 200 of ${visible.length}; search to narrow the display. All available offers remain in the queue.`;
        container.appendChild(note);
    }
}
function renderPanel() {
    if (!state.panel) return;
    const panel = state.panel;
    renderHubPacingDetails(panel, state);
    panel.getElementById('workspace-cache').textContent = state.lastScanAt
        ? `Offers last refreshed: ${new Date(state.lastScanAt).toLocaleString()}` : '';
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    const scopeOffers = state.offers.filter(offer => state.selected.has(offer.accountId));
    panel.getElementById('counts').textContent = `${scopeOffers.filter(offer => offer.status === 'AVAILABLE').length} available · ${scopeOffers.filter(offer => offer.status === 'ENROLLED').length} added`;
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
        checkbox.disabled = state.busy;
        checkbox.setAttribute('aria-label', `Select ${card.name}`);
        checkbox.addEventListener('change', () => setCardSelected(card.accountId, checkbox.checked));
        label.append(checkbox, document.createTextNode(card.name));
        cards.appendChild(label);
    }
    renderCitiActions(panel);
    renderOffers();
}
