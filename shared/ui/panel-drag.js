// Drag a panel by its header, or move it with the arrow keys on its Move button.
// The spot is saved as the nearest viewport corner plus the gap to it, so a
// minimized panel expands away from that corner. Home on the Move button or a
// double-click on the header puts the panel back in its default corner. The
// shown spot is pulled back inside the window whenever the window or the panel
// changes size; the saved spot stays as the user left it. Nothing here sends a
// request.
const HUB_PANEL_EDGE_GAP = 8;
const HUB_PANEL_KEY_STEP = 16;
const HUB_PANEL_DRAG_THRESHOLD = 4;
function hubClampPanelOffset(value, size, viewport) {
    return Math.round(Math.min(Math.max(value, HUB_PANEL_EDGE_GAP), Math.max(HUB_PANEL_EDGE_GAP, viewport - size - HUB_PANEL_EDGE_GAP)));
}
function hubNearestPanelCorner(rect, viewportWidth, viewportHeight) {
    const horizontal = rect.left + rect.width / 2 < viewportWidth / 2 ? 'left' : 'right';
    const vertical = rect.top + rect.height / 2 < viewportHeight / 2 ? 'top' : 'bottom';
    return {
        horizontal, x: Math.max(0, Math.round(horizontal === 'left' ? rect.left : viewportWidth - rect.right)),
        vertical, y: Math.max(0, Math.round(vertical === 'top' ? rect.top : viewportHeight - rect.bottom))
    };
}
// The default corner comes from the :host rule (right/bottom), so a moved panel
// sets its own two sides and turns the other two to auto; otherwise the host
// would stretch between both edges.
const HUB_PANEL_OPPOSITE_SIDE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
function hubPlacePanelHost(host, position) {
    for (const side of ['left', 'right', 'top', 'bottom']) host.style.removeProperty(side);
    if (!position) return;
    host.style.setProperty(position.horizontal, `${position.x}px`);
    host.style.setProperty(HUB_PANEL_OPPOSITE_SIDE[position.horizontal], 'auto');
    host.style.setProperty(position.vertical, `${position.y}px`);
    host.style.setProperty(HUB_PANEL_OPPOSITE_SIDE[position.vertical], 'auto');
}
function hubShowPanelAt(host, position) {
    hubPlacePanelHost(host, position);
    if (!position || !host.isConnected) return;
    const rect = host.getBoundingClientRect();
    const left = hubClampPanelOffset(rect.left, rect.width, innerWidth);
    const top = hubClampPanelOffset(rect.top, rect.height, innerHeight);
    if (Math.abs(left - rect.left) >= 1 || Math.abs(top - rect.top) >= 1) {
        hubPlacePanelHost(host, { horizontal: 'left', x: left, vertical: 'top', y: top });
    }
}
function hubEnablePanelDrag(root, { storage, storageKey }) {
    const host = root.host;
    const header = root.querySelector('header');
    if (!host || !header || header.querySelector('.hub-move')) return;
    const store = createHubPanelPositionStore({ storage, storageKey });
    const loaded = store.load();
    let position = loaded.position;
    const move = document.createElement('button');
    move.type = 'button';
    move.className = 'hub-move';
    move.setAttribute('aria-label', 'Move panel');
    move.title = 'Drag to move the panel. Arrow keys move it; Home puts it back.';
    header.prepend(move);
    header.classList.add('hub-draggable');
    const notice = document.createElement('p');
    notice.className = 'hub-position-error';
    notice.setAttribute('role', 'status');
    header.after(notice);
    const showError = message => { notice.textContent = message; notice.hidden = !message; };
    let drag = null;
    const show = () => { if (!drag?.moved) hubShowPanelAt(host, position); };
    const remember = next => { position = next; show(); showError(store.save(position)); };
    const rememberShownSpot = () => remember(hubNearestPanelCorner(host.getBoundingClientRect(), innerWidth, innerHeight));
    const placeTopLeft = (left, top, rect) => hubPlacePanelHost(host, { horizontal: 'left', x: hubClampPanelOffset(left, rect.width, innerWidth),
        vertical: 'top', y: hubClampPanelOffset(top, rect.height, innerHeight) });
    showError(loaded.error);
    show();
    // Fires once the host is laid out, and again when the panel expands or collapses.
    new ResizeObserver(show).observe(host);
    addEventListener('resize', () => { if (host.isConnected) show(); });

    const startsDrag = target => !target.closest('button, a, input, select, textarea, label, summary') || target.closest('.hub-move');
    header.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !startsDrag(event.target)) return;
        drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, rect: host.getBoundingClientRect(), moved: false };
        header.setPointerCapture(event.pointerId);
    });
    header.addEventListener('pointermove', event => {
        if (drag?.pointer !== event.pointerId) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < HUB_PANEL_DRAG_THRESHOLD) return;
        drag.moved = true;
        header.classList.add('hub-dragging');
        placeTopLeft(drag.rect.left + dx, drag.rect.top + dy, drag.rect);
        event.preventDefault();
    });
    const finishDrag = event => {
        if (drag?.pointer !== event.pointerId) return;
        const moved = drag.moved;
        drag = null;
        header.classList.remove('hub-dragging');
        if (moved) rememberShownSpot();
    };
    header.addEventListener('pointerup', finishDrag);
    header.addEventListener('pointercancel', finishDrag);
    header.addEventListener('dblclick', event => { if (startsDrag(event.target)) remember(null); });
    move.addEventListener('keydown', event => {
        if (event.key === 'Home') {
            event.preventDefault();
            remember(null);
            return;
        }
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!direction) return;
        event.preventDefault();
        const step = event.shiftKey ? HUB_PANEL_KEY_STEP * 4 : HUB_PANEL_KEY_STEP;
        const rect = host.getBoundingClientRect();
        placeTopLeft(rect.left + direction[0] * step, rect.top + direction[1] * step, rect);
        rememberShownSpot();
    });
}
