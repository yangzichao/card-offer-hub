function renderOffers() {
    if (!state.panel) return;
    const container = state.panel.getElementById('offers');
    container.replaceChildren();
    const search = state.search;
    const visible = state.offers.filter(offer => state.selected.has(offer.accountId)).filter(offer => hubMatchesSearch(offer, search));
    if (!visible.length) hubShowEmptyOffers(container, search);
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
    const canContinue = canContinueSavedOffers();
    panel.getElementById('workspace-cache').textContent = canContinue
        ? `Last complete scan: ${new Date(state.lastScanAt).toLocaleString()}. Saved results restored. Continue adding, or optionally refresh all cards & offers.`
        : workspaceCacheNotice().replace('scan again before adding', 'refresh all cards & offers before adding');
    const blocked = state.busy || Boolean(state.storageError);
    panel.getElementById('scan').disabled = blocked;
    panel.getElementById('stop').disabled = !state.busy || state.stopRequested;
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    const scopeOffers = state.offers.filter(offer => state.selected.has(offer.accountId));
    panel.getElementById('counts').textContent = `${scopeOffers.length} offers · ${scopeOffers.filter(offer => offer.status === 'AVAILABLE').length} available · ${state.confirmed}/${state.total} added this run`;
    const cards = panel.getElementById('cards');
    cards.replaceChildren();
    if (!state.accounts.length) {
        const note = document.createElement('p');
        note.className = 'muted';
        note.textContent = 'Click Refresh all cards & offers to load your cards and offers together.';
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
    renderHubWorkflow(panel, { count: state.offers.filter(offer => state.selected.has(offer.accountId) && offer.status === 'AVAILABLE').length, hasScope: state.selected.size > 0,
        needsScan: (state.needsScan && !canContinue) || !state.lastScanAt, busy: state.busy, storageError: state.storageError,
        coolingDown: Date.now() < state.cooldownUntil, readOnly: !SETTINGS.capabilities.activation,
        progress: state.activeAction === 'add' && state.total ? { completed: state.confirmed, total: state.total } : null });
    const reason = panel.getElementById('hub-action-reason');
    if (canContinue && !panel.getElementById('add').disabled) {
        reason.textContent = 'Continue with your saved card choices. Add all offers checks the current login and offer status before adding what remains. Refreshing all cards is optional.';
    } else {
        reason.textContent = reason.textContent.replace('Scan offers in step 2', 'Refresh all cards & offers in step 2')
            .replace('Scan again to refresh', 'Refresh all cards & offers to check for new offers');
    }
    renderOffers();
}
