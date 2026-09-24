function renderOffers() {
    if (!state.panel) return;
    const container = state.panel.getElementById('offers');
    container.replaceChildren();
    const search = state.search;
    const visible = state.offers.filter(offer => hubMatchesSearch(offer, search));
    if (!visible.length) hubShowEmptyOffers(container, search);
    for (const offer of visible) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.selected.has(offer.offerId);
        checkbox.disabled = state.busy || Boolean(state.storageError) || offer.status !== 'AVAILABLE';
        checkbox.setAttribute('aria-label', `Select ${offer.merchant}: ${offer.title}`);
        checkbox.addEventListener('change', () => setOfferSelected(offer.offerId, checkbox.checked));
        const date = typeof offer.expires === 'string' ? hubOfferExpiry(offer.expires.slice(0, 10)) : 'Unknown expiry';
        container.appendChild(hubOfferRow({ tag: 'label', leading: checkbox, merchant: offer.merchant, title: offer.title,
            status: hubOfferStatusLabel(offer.status), meta: [date] }));
    }
}
function renderPanel() {
    if (!state.panel) return;
    const panel = state.panel;
    renderHubPacingDetails(panel, state);
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
    renderHubWorkflow(panel, { template: offerWorkflow, readOnly: !SETTINGS.capabilities.activation, count: offerWorkflow.preview().length, needsScan: state.needsScan, busy: state.busy,
        storageError: state.storageError, coolingDown: Date.now() < state.cooldownUntil,
        progress: state.activeAction === 'add' && state.total ? { completed: state.confirmed, total: state.total } : null });
    hubSetActionLabel(panel.getElementById('activate'), 'Add selected offers', state.selected.size);
    renderOffers();
}
