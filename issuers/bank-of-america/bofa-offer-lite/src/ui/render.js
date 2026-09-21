function renderOffers() {
    if (!state.panel) return;
    const list = state.panel.getElementById('offers');
    list.replaceChildren();
    const visible = state.offers.filter(offer => hubMatchesSearch(offer, state.search));
    if (!visible.length) hubShowEmptyOffers(list, state.search);
    for (const offer of visible) {
        const row = document.createElement('div');
        row.className = 'offer';
        const title = document.createElement('strong');
        title.textContent = `${offer.name} · ${offer.headline}`;
        const detail = document.createElement('small');
        detail.textContent = offer.result === 'Unconfirmed' ? 'Needs review' : offer.activated ? 'Added' : offer.eligible ? 'Available' : `Skipped · ${offer.reason || 'Not eligible'}`;
        row.append(title, detail);
        list.append(row);
    }
}
function renderPanel() {
    const panel = state.panel;
    if (!panel) return;
    panel.getElementById('workspace-cache').textContent = workspaceCacheNotice();
    panel.getElementById('status').textContent = state.status;
    panel.getElementById('storage-error').textContent = state.storageError;
    const blocked = state.busy || Boolean(state.storageError);
    panel.getElementById('consent').checked = state.consent;
    panel.getElementById('consent').disabled = blocked;
    panel.getElementById('scan').disabled = blocked;
    panel.getElementById('stop').disabled = !state.busy || state.stopRequested;
    const available = state.offers.filter(offer => offer.eligible && !offer.activated).length;
    panel.getElementById('counts').textContent = `${state.offers.length} offers · ${available} available · ${state.confirmed}/${state.total} added this run`;
    renderHubWorkflow(panel, { readOnly: !SETTINGS.capabilities.activation, count: available, hasScope: state.consent, needsScan: state.needsScan,
        busy: state.busy, storageError: state.storageError, coolingDown: Date.now() < state.cooldownUntil,
        progress: state.activeAction === 'add' && state.total ? { completed: state.confirmed, total: state.total } : null });
    renderOffers();
}
