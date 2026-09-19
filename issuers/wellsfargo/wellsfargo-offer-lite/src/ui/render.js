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
        title.textContent = `${offer.merchant} · ${offer.title}`;
        const detail = document.createElement('small');
        detail.textContent = `${offer.status} · ${offer.expires}`;
        row.append(title, detail);
        container.appendChild(row);
    }
    if (visible.length > 200) {
        const note = document.createElement('p');
        note.textContent = `Showing 200 of ${visible.length}; search to narrow the display. All eligible offers remain in the queue.`;
        container.appendChild(note);
    }
}
function renderPanel() {
    if (!state.panel) return;
    const panel = state.panel;
    const blocked = state.busy || Boolean(state.storageError);
    panel.getElementById('scan').disabled = blocked;
    panel.getElementById('add').disabled = blocked || !state.accountConsent || state.needsScan;
    panel.getElementById('consent').disabled = blocked;
    panel.getElementById('consent').checked = state.accountConsent;
    panel.getElementById('stop').disabled = !state.busy || state.stopRequested;
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    panel.getElementById('counts').textContent = `${state.offers.length} offers · ${state.offers.filter(offer => offer.status === 'AVAILABLE').length} eligible · ${state.offers.filter(offer => ['UNSUPPORTED', 'CONFLICT'].includes(offer.status)).length} skipped · ${state.confirmed}/${state.total} added this run`;
    renderOffers();
}
