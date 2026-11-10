function renderOffers() {
    if (!state.panel) return;
    const container = state.panel.getElementById('offers');
    container.replaceChildren();
    const search = state.search;
    const view = hubOfferListView(state.panel, state.offers.filter(offer => state.selected.has(offer.accountId))
        .filter(offer => hubMatchesSearch(offer, search)).map(offer => {
            const status = hubOfferStatusLabel(offer.status);
            return { offer, status, reward: offer.reward ?? null, group: hubOfferListGroup(status) };
        }), state);
    const visible = view.items;
    if (!visible.length) {
        hubShowEmptyNote(container, view.emptyMessage || (search.trim() ? 'No offers match your search.'
            : state.selected.size ? 'No saved offers on these cards. Use Refresh & add offers.' : 'Your selected cards’ offers will appear here.'));
    }
    for (const { offer, status, reward } of visible.slice(0, 200)) {
        const card = state.accounts.find(account => account.accountId === offer.accountId);
        container.appendChild(hubOfferRow({ merchant: offer.merchant, title: offer.title, status, reward,
            meta: [card?.name || 'Card', hubOfferExpiry(offer.expires)] }));
    }
    if (visible.length > 200) {
        const note = document.createElement('p');
        note.className = 'muted hub-list-limit';
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
        note.className = 'muted hub-empty-note';
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
