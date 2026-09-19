const HUB_SEARCH_SETTINGS_KEY = 'hub:search-preferences';
function hubLoadSearchPreferences() {
    const defaults = { query: '', bank: '', status: '' };
    try {
        const saved = GM_getValue(HUB_SEARCH_SETTINGS_KEY, null);
        if (saved === null) return { preferences: defaults, error: '' };
        if (saved.schemaVersion !== 1 || typeof saved.query !== 'string' || typeof saved.bank !== 'string'
            || !['', 'available', 'added', 'review', 'other'].includes(saved.status)) throw new Error('Invalid preferences');
        return { preferences: { query: saved.query, bank: HUB_BANKS.some(bank => bank.id === saved.bank) ? saved.bank : '', status: saved.status }, error: '' };
    } catch {
        return { preferences: defaults, error: 'Search settings could not be read. Saved data is preserved; changes apply to this visit only.' };
    }
}
function hubSaveSearchPreferences(preferences) {
    try {
        GM_setValue(HUB_SEARCH_SETTINGS_KEY, { schemaVersion: 1, ...preferences });
        return '';
    } catch {
        return 'Search settings could not be saved. Changes apply to this visit only.';
    }
}
