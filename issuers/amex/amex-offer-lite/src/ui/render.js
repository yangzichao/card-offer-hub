function renderControls() {
    if (!uiElement('btn-detect')) return;
    const coolingDown = Date.now() < state.cooldownUntil;
    const detect = uiElement('btn-detect');
    detect.disabled = Boolean(state.busy) || state.detected || coolingDown || Date.now() < state.discoveryRetryAt;
    hubSetActionLabel(detect, 'Detect cards', state.detected ? state.accounts.length : null);
    const refresh = uiElement('btn-refresh-cards');
    refresh.hidden = !state.detected;
    refresh.disabled = Boolean(state.busy) || coolingDown || Date.now() < state.discoveryRetryAt;
    const scan = uiElement('btn-scan');
    scan.disabled = Boolean(state.busy) || !state.detected || !selectedAccounts().length || coolingDown || Boolean(state.storageError);
    hubSetActionLabel(scan, 'Scan offers');
    renderHubWorkflow(panelRoot.shadowRoot, { template: offerWorkflow, readOnly: !SETTINGS.capabilities.activation, count: enrollmentPlan().length,
        hasScope: selectedAccounts().length > 0, busy: Boolean(state.busy), coolingDown,
        storageError: state.storageError || state.savedCardsError || state.savedOffersError,
        needsScan: selectedAccounts().length > 0 && !selectedAccounts().some(account => state.scanReports.get(account.token)?.startsWith('Complete')),
        progress: state.busy === 'enroll' ? state.enrollmentProgress : null });
    uiElement('btn-stop').disabled = !state.busy || state.cancelRequested;
    uiElement('content').hidden = state.minimized;
    const toggle = uiElement('btn-toggle');
    toggle.textContent = state.minimized ? '+' : '−';
    toggle.setAttribute('aria-label', state.minimized ? 'Expand Amex panel' : 'Minimize Amex panel');
    toggle.setAttribute('aria-expanded', String(!state.minimized));
    const remainingSeconds = Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
    uiElement('cooldown').textContent = remainingSeconds ? `Cooling down: ${remainingSeconds}s. Restart manually afterward.` : '';
}

function renderStatus() {
    const status = uiElement('status');
    if (!status) return;
    status.textContent = state.status;
    uiElement('storage-error').textContent = state.storageError;
    renderHubPacingDetails(panelRoot.shadowRoot, state);
    const logs = uiElement('logs');
    logs.replaceChildren(...state.logs.map((message) => element('div', message)));
}

function render() {
    renderControls();
    renderCards();
    renderOffers();
    renderStatus();
}

let previousCooldownActive = false;
function refreshTimers() {
    renderControls();
    const cooldownActive = Date.now() < state.cooldownUntil;
    if (previousCooldownActive !== cooldownActive) renderOffers();
    previousCooldownActive = cooldownActive;
}
