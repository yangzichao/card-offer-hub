// Clip all needs no prior load: it always reloads the full list itself.
function renderKrogerActions(panel) {
    const coolingDown = Date.now() < state.cooldownUntil;
    const blocked = state.busy || Boolean(state.storageError) || coolingDown;
    const ready = state.needsScan ? null : offerWorkflow.preview().length;
    const clip = panel.getElementById('add');
    hubSetActionLabel(clip, 'Clip all coupons', state.busy ? null : ready);
    clip.title = 'Reload every Kroger coupon, then clip each one Kroger allows, one request at a time.';
    clip.disabled = blocked;
    clip.classList.toggle('primary', !clip.disabled);
    const load = panel.getElementById('scan');
    load.disabled = blocked;
    load.classList.toggle('primary', clip.disabled && !state.busy);
    const stop = panel.getElementById('stop');
    stop.hidden = !state.busy;
    stop.disabled = !state.busy || state.stopRequested;
    const reason = panel.getElementById('hub-action-reason');
    reason.textContent = state.storageError ? 'Resolve the storage error before continuing.'
        : state.busy ? '' : coolingDown ? 'Kroger asked us to wait. Try again after the cooldown.'
        : ready === 0 ? 'No loaded coupons are left to clip. Clip all coupons checks Kroger again.' : '';
    reason.hidden = !reason.textContent;
    hubRenderTaskProgress(panel, { busy: Boolean(state.busy), completed: state.processed, total: state.activeAction === 'add' ? state.total : 0 });
    hubRenderSearchControls(panel);
}
