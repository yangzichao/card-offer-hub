function renderControls() {
    if (!uiElement('btn-detect')) return;
    const coolingDown = Date.now() < state.cooldownUntil;
    const detect = uiElement('btn-detect');
    detect.disabled = Boolean(state.busy) || state.detected || coolingDown || Date.now() < state.discoveryRetryAt;
    detect.textContent = state.detected ? `Detected ${state.accounts.length} cards` : 'Detect card list';
    const refresh = uiElement('btn-refresh-cards');
    refresh.hidden = !state.detected;
    refresh.disabled = Boolean(state.busy) || coolingDown || Date.now() < state.discoveryRetryAt;
    const scan = uiElement('btn-scan');
    scan.disabled = Boolean(state.busy) || !state.detected || !selectedAccounts().length || coolingDown;
    scan.textContent = `Scan whitelist (${selectedAccounts().length})`;
    const enroll = uiElement('btn-enroll-all');
    const plannedCount = enrollmentPlan().length;
    enroll.disabled = Boolean(state.busy) || !plannedCount || coolingDown;
    enroll.textContent = `${state.filter ? 'Add filtered offers' : 'Add all offers'} (${plannedCount})`;
    uiElement('btn-stop').disabled = !state.busy || state.cancelRequested;
    uiElement('content').hidden = state.minimized;
    uiElement('btn-toggle').textContent = state.minimized ? 'Open' : 'Minimize';
    for (const identifier of ['btn-detect', 'btn-scan', 'btn-enroll-all', 'btn-toggle']) {
        const control = uiElement(identifier);
        control.setAttribute('aria-label', control.textContent);
    }
    const remainingSeconds = Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
    uiElement('cooldown').textContent = remainingSeconds ? `Cooling down: ${remainingSeconds}s. Restart manually afterward.` : '';
}

function renderStatus() {
    const status = uiElement('status');
    if (!status) return;
    status.textContent = state.status;
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
