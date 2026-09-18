// The captured Amex page uses uncached Transit immutable maps/lists and JSON maps.
// Parse data only: never evaluate the page's initial-state script.
function decodePageState(value) {
    if (typeof value === 'string') {
        if (/^\^[0-9A-Za-z]/.test(value)) throw new Error('Unsupported compressed page state.');
        return value.startsWith('~~') ? value.slice(1) : value;
    }
    if (!Array.isArray(value)) return value;
    if (value[0] === '^ ') {
        if (value.length % 2 !== 1) throw new Error('Invalid page-state map.');
        return Object.fromEntries(Array.from({ length: (value.length - 1) / 2 }, (_, index) => [
            value[index * 2 + 1], decodePageState(value[index * 2 + 2])
        ]));
    }
    if (value[0] === '~#iM') {
        const entries = value[1];
        if (!Array.isArray(entries) || entries.length % 2 !== 0) throw new Error('Invalid immutable map.');
        return Object.fromEntries(Array.from({ length: entries.length / 2 }, (_, index) => [
            entries[index * 2], decodePageState(entries[index * 2 + 1])
        ]));
    }
    if (value[0] === '~#iL' || value[0] === '~#iS') return value[1].map(decodePageState);
    return value.map(decodePageState);
}

function readPageState() {
    const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    let initialState = pageWindow.__INITIAL_STATE__;
    if (!initialState) {
        const script = document.getElementById('initial-state')?.textContent || '';
        const assignment = script.match(/window\.__INITIAL_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
        if (assignment) initialState = JSON.parse(assignment[1]);
    }
    if (typeof initialState === 'string') initialState = JSON.parse(initialState);
    return decodePageState(initialState);
}
