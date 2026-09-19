function renderOffers() {
    if (!state.panel) return;
    const container = state.panel.getElementById('offers');
    container.replaceChildren();
    const search = state.search.trim().toLowerCase();
    const visible = state.offers.filter(offer => `${offer.merchant} ${offer.title} ${offer.category}`.toLowerCase().includes(search));
    for (const offer of visible) {
        const row = document.createElement('label');
        row.className = 'offer';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.selected.has(offer.offerId);
        checkbox.disabled = state.busy || Boolean(state.storageError) || offer.status !== 'AVAILABLE';
        checkbox.setAttribute('aria-label', `Select ${offer.merchant}: ${offer.title}`);
        checkbox.addEventListener('change', () => setOfferSelected(offer.offerId, checkbox.checked));
        const title = document.createElement('strong');
        title.textContent = ` ${offer.merchant} · ${offer.title}`;
        const detail = document.createElement('small');
        const date = typeof offer.expires === 'string' ? offer.expires.slice(0, 10) : 'Unknown expiry';
        detail.textContent = `${offer.status} · ${date}`;
        row.append(checkbox, title, detail);
        container.appendChild(row);
    }
}
function renderPanel() {
    if (!state.panel) return;
    const panel = state.panel;
    panel.getElementById('workspace-cache').textContent = workspaceCacheNotice();
    const blocked = state.busy || Boolean(state.storageError);
    const available = state.offers.filter(offer => offer.status === 'AVAILABLE').length;
    panel.getElementById('scan').disabled = blocked;
    panel.getElementById('select-all').disabled = blocked || !available;
    panel.getElementById('clear').disabled = blocked || !state.selected.size;
    panel.getElementById('activate').disabled = blocked || !state.selected.size || state.needsScan;
    panel.getElementById('stop').disabled = !state.busy || state.stopRequested;
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    panel.getElementById('counts').textContent = `${state.offers.length} offers · ${available} available · ${state.selected.size} selected · ${state.confirmed}/${state.total} newly confirmed`;
    renderOffers();
}
