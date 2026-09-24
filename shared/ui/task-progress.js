// Determinate when the task knows its total, indeterminate otherwise; hidden when idle.
function hubRenderTaskProgress(root, { busy = false, completed = 0, total = 0 } = {}) {
    const meter = root?.getElementById('hub-progress');
    if (!meter) return;
    meter.hidden = !busy;
    const determinate = Boolean(busy) && total > 0;
    meter.classList.toggle('indeterminate', Boolean(busy) && !determinate);
    for (const name of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) meter.removeAttribute(name);
    meter.style.removeProperty('--hub-progress');
    if (!determinate) return;
    const done = Math.max(0, Math.min(completed, total));
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', String(total));
    meter.setAttribute('aria-valuenow', String(done));
    meter.setAttribute('aria-valuetext', `${done} of ${total}`);
    meter.style.setProperty('--hub-progress', `${(done / total) * 100}%`);
}
