// The small-offer filter. It hides rows from the list, and the Add actions skip
// what it hides (banks pass it to createHubWorkflow as keepInPlan). An offer whose
// rate or total is unknown is never hidden by that threshold, so nothing
// disappears because a bank left it out.
const HUB_REWARD_FILTER_READ_ERROR = 'Saved filter could not be read and was kept. Changes apply to this visit only.';
function hubNormalizeRewardFilter(value) {
    const read = number => typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : 0;
    return { minRate: Math.min(read(value?.minRate), 100), minTotal: read(value?.minTotal) };
}
// A missing filter (panel not mounted yet) hides nothing.
function hubRewardPassesFilter(reward, filter) {
    filter = hubNormalizeRewardFilter(filter);
    const rate = hubRewardRate(reward);
    const total = hubRewardTotal(reward);
    if (filter.minRate > 0 && rate !== null && rate < filter.minRate) return false;
    if (filter.minTotal > 0 && total !== null && total < filter.minTotal) return false;
    return true;
}
// One small key per bank: { schemaVersion: 1, minRate, minTotal }. An unreadable
// value is preserved and the filter works for this visit only.
function createHubRewardFilterStore({ storage, storageKey }) {
    let readFailed = false;
    return {
        load() {
            try {
                const saved = storage.get(storageKey, null);
                if (saved === null) return { filter: hubNormalizeRewardFilter(null), error: '' };
                if (saved?.schemaVersion !== 1 || typeof saved.minRate !== 'number' || typeof saved.minTotal !== 'number') {
                    throw new Error('Unsupported saved filter');
                }
                return { filter: hubNormalizeRewardFilter(saved), error: '' };
            } catch {
                readFailed = true;
                return { filter: hubNormalizeRewardFilter(null), error: HUB_REWARD_FILTER_READ_ERROR };
            }
        },
        save(filter) {
            if (readFailed) return HUB_REWARD_FILTER_READ_ERROR;
            try {
                storage.set(storageKey, { schemaVersion: 1, ...hubNormalizeRewardFilter(filter) });
                return '';
            } catch {
                return 'Filter could not be saved. It applies to this visit only.';
            }
        }
    };
}
