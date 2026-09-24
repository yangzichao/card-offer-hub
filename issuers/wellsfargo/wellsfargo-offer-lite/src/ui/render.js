function renderOffers() {
    if (!state.panel) return;
    const container = state.panel.getElementById('offers');
    container.replaceChildren();
    const search = state.search;
    const visible = state.offers.filter(offer => hubMatchesSearch(offer, search));
    if (!visible.length) hubShowEmptyOffers(container, search);
    for (const offer of visible.slice(0, 200)) {
        container.appendChild(hubOfferRow({ merchant: offer.merchant, title: offer.title, status: hubOfferStatusLabel(offer.status),
            meta: [hubOfferExpiry(offer.expires)] }));
    }
    if (visible.length > 200) {
        const note = document.createElement('p');
        note.className = 'muted hub-list-limit';
        note.textContent = `Showing 200 of ${visible.length}; search to narrow the display. All eligible offers remain in the queue.`;
        container.appendChild(note);
    }
}
function renderPanel() {
    if (!state.panel) return;
    const panel = state.panel;
    renderHubPacingDetails(panel, state);
    panel.getElementById('workspace-cache').textContent = workspaceCacheNotice();
    const blocked = state.busy || Boolean(state.storageError);
    panel.getElementById('scan').disabled = blocked;
    panel.getElementById('add').disabled = blocked || !state.accountConsent || state.needsScan;
    panel.getElementById('consent').disabled = blocked;
    panel.getElementById('consent').checked = state.accountConsent;
    panel.getElementById('stop').disabled = !state.busy || state.stopRequested;
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    panel.getElementById('counts').textContent = `${state.offers.length} offers · ${state.offers.filter(offer => offer.status === 'AVAILABLE').length} eligible · ${state.offers.filter(offer => ['UNSUPPORTED', 'CONFLICT'].includes(offer.status)).length} skipped · ${state.confirmed}/${state.total} added this run`;
    renderHubWorkflow(panel, { template: offerWorkflow, count: offerWorkflow.preview().length, hasScope: state.accountConsent,
        needsScan: state.needsScan, busy: state.busy, storageError: state.storageError,
        coolingDown: Date.now() < state.cooldownUntil, readOnly: !SETTINGS.capabilities.activation,
        progress: state.activeAction === 'add' && state.total ? { completed: state.confirmed, total: state.total } : null });
    renderOffers();
}
