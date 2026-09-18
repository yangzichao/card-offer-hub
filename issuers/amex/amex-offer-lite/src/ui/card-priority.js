// Dragging is the fast way to rank cards; the move buttons do the same job with a
// keyboard or on a touch screen, where HTML5 drag-and-drop is not available.
let draggedCardToken = null;

function cardDragHandle(account) {
    const handle = element('span', '⠿', 'drag-handle');
    handle.draggable = true;
    handle.title = `Drag to change where ${account.cardName} ranks for shared offers`;
    handle.setAttribute('aria-hidden', 'true');
    handle.ondragstart = (event) => {
        if (state.busy) return event.preventDefault();
        draggedCardToken = account.token;
        event.dataTransfer.effectAllowed = 'move';
        // Some browsers refuse to start a drag without payload. The token is already
        // in this page and never leaves it.
        event.dataTransfer.setData('text/plain', account.token);
    };
    handle.ondragend = () => {
        draggedCardToken = null;
        renderCards();
    };
    return handle;
}

function makeCardDropTarget(row, account) {
    row.ondragover = (event) => {
        if (!draggedCardToken || draggedCardToken === account.token) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        row.classList.add('drop-target');
    };
    row.ondragleave = () => row.classList.remove('drop-target');
    row.ondrop = (event) => {
        event.preventDefault();
        row.classList.remove('drop-target');
        if (draggedCardToken) dropCardPriority(draggedCardToken, account.token);
        draggedCardToken = null;
    };
}

function cardMoveButton(account, label, offset, disabled) {
    const control = element('button', label, 'move');
    control.type = 'button';
    control.disabled = Boolean(state.busy) || disabled;
    control.setAttribute('aria-label', `Move ${account.cardName} ${offset < 0 ? 'up' : 'down'} in offer priority`);
    control.onclick = () => moveCardPriority(account.token, offset);
    return control;
}

function cardPriorityControls(account, index, cardCount) {
    const controls = element('div', '', 'card-move');
    controls.append(cardMoveButton(account, '↑', -1, index === 0));
    controls.append(cardMoveButton(account, '↓', 1, index === cardCount - 1));
    return controls;
}
