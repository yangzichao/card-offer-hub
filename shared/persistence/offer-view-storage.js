// One key per bank, `${script-id}:reward-filter`:
// { schemaVersion: 2, minRate, minTotal, keepUnlisted, sort, show }.
// 1.9.0 saved { schemaVersion: 1, minRate, minTotal } under the same key; it reads
// forward with the new defaults and is rewritten on the next change. An
// unreadable value is kept untouched and the options apply to this visit only.
const HUB_OFFER_VIEW_READ_ERROR = 'Saved list options could not be read and were kept. Changes apply to this visit only.';
function hubMigrateOfferView(saved) {
    const hasMinimums = typeof saved?.minRate === 'number' && typeof saved?.minTotal === 'number';
    if (saved?.schemaVersion === 1 && hasMinimums) return hubNormalizeOfferView({ minRate: saved.minRate, minTotal: saved.minTotal });
    if (saved?.schemaVersion === 2 && hasMinimums && typeof saved.keepUnlisted === 'boolean'
        && HUB_OFFER_VIEW_SORTS.includes(saved.sort) && HUB_OFFER_VIEW_TABS.includes(saved.show)) return hubNormalizeOfferView(saved);
    throw new Error('Unsupported saved list options');
}
function createHubOfferViewStore({ storage, storageKey }) {
    let readFailed = false;
    return {
        load() {
            try {
                const saved = storage.get(storageKey, null);
                return { view: saved === null ? hubNormalizeOfferView(null) : hubMigrateOfferView(saved), error: '' };
            } catch {
                readFailed = true;
                return { view: hubNormalizeOfferView(null), error: HUB_OFFER_VIEW_READ_ERROR };
            }
        },
        save(view) {
            if (readFailed) return HUB_OFFER_VIEW_READ_ERROR;
            try {
                storage.set(storageKey, { schemaVersion: 2, ...hubNormalizeOfferView(view) });
                return '';
            } catch {
                return 'List options could not be saved. They apply to this visit only.';
            }
        }
    };
}
