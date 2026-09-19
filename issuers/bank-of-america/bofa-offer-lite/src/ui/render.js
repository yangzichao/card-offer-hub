function renderPanel() {
    const root = state.panel;
    if (!root) return;
    root.querySelector('.workspace-cache').textContent = workspaceCacheNotice();
    root.querySelector('main').hidden = state.collapsed;
    const toggle = root.querySelector('header button');
    toggle.textContent = state.collapsed ? '+' : '−';
    toggle.setAttribute('aria-label', state.collapsed ? 'Expand Deals panel' : 'Minimize Deals panel');
    root.querySelector('[role=status]').textContent = state.storageError || state.status;
    root.querySelector('input').checked = state.consent;
    root.querySelector('input').disabled = state.busy || Boolean(state.storageError);
    root.querySelector('[aria-label="Scan Deals offers"]').disabled = state.busy || !!state.storageError;
    root.querySelector('[aria-label="Activate eligible Deals offers"]').disabled = state.busy || state.needsScan
        || !state.consent || !!state.storageError || !state.offers.some(offer => offer.eligible && !offer.activated);
    root.querySelector('[aria-label="Stop Deals activation"]').disabled = !state.busy;
    const list = root.querySelector('.offers');
    list.replaceChildren();
    for (const offer of state.offers) {
        const row = document.createElement('div');
        row.className = 'offer';
        row.textContent = `${offer.name} — ${offer.headline}\n${offer.result || offer.reason || 'Eligible'}`;
        list.appendChild(row);
    }
}
