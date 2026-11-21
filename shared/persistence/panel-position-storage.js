// One key per bank, `${script-id}:panel-position`, in the bank's own storage:
// { schemaVersion: 1, position: null | { horizontal, x, vertical, y } }.
// position is the viewport corner nearest the dragged panel and the gap to it in
// px; null is the default bottom-right spot. An unreadable value is kept
// untouched and moving the panel applies to this visit only.
const HUB_PANEL_POSITION_READ_ERROR = 'Saved panel position could not be read and was kept. Moving the panel applies to this visit only.';
function hubIsPanelPosition(value) {
    return Boolean(value) && typeof value === 'object'
        && ['left', 'right'].includes(value.horizontal) && ['top', 'bottom'].includes(value.vertical)
        && Number.isFinite(value.x) && Number.isFinite(value.y) && value.x >= 0 && value.y >= 0;
}
function hubCopyPanelPosition(value) {
    return value ? { horizontal: value.horizontal, x: value.x, vertical: value.vertical, y: value.y } : null;
}
function createHubPanelPositionStore({ storage, storageKey }) {
    let readFailed = false;
    return {
        load() {
            try {
                const saved = storage.get(storageKey, null);
                if (saved === null) return { position: null, error: '' };
                if (saved?.schemaVersion === 1 && (saved.position === null || hubIsPanelPosition(saved.position))) {
                    return { position: hubCopyPanelPosition(saved.position), error: '' };
                }
                throw new Error('Unsupported saved panel position');
            } catch {
                readFailed = true;
                return { position: null, error: HUB_PANEL_POSITION_READ_ERROR };
            }
        },
        save(position) {
            if (readFailed) return HUB_PANEL_POSITION_READ_ERROR;
            try {
                storage.set(storageKey, { schemaVersion: 1, position: hubCopyPanelPosition(position) });
                return '';
            } catch {
                return 'Panel position could not be saved. It applies to this visit only.';
            }
        }
    };
}
