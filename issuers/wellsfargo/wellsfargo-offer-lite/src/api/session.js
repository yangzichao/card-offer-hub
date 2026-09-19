function activationUrl() {
    // The signed-in HTML embeds window.initialState = JSON.parse("...").
    // Parse only the JSON literal; never evaluate page code or copy a HAR token.
    const candidates = [];
    for (const script of document.querySelectorAll('script:not([src])')) {
        const match = script.textContent.match(/\bwindow\.initialState\s*=\s*JSON\.parse\(\s*("(?:\\.|[^"\\])*")\s*\)/);
        if (!match) continue;
        try {
            const initialState = JSON.parse(JSON.parse(match[1]));
            const action = initialState?.metadata?.clDealsActivateAction;
            if (typeof action === 'string') candidates.push(action);
        } catch { /* An unfamiliar bootstrap is not an activation authorization. */ }
    }
    if (candidates.length !== 1) throw new Error('Activation session is unavailable. Reopen My Wells Fargo Deals, then scan again.');
    let url;
    try { url = new URL(candidates[0], location.origin); }
    catch { throw new Error('Activation session URL was not recognized. Reopen My Wells Fargo Deals.'); }
    if (url.origin !== location.origin || url.pathname !== SETTINGS.enrollmentPath
        || url.username || url.password || url.hash
        || [...url.searchParams.keys()].some(key => key !== 'token')
        || url.searchParams.getAll('token').length !== 1 || !url.searchParams.get('token')?.trim()) {
        throw new Error('Activation session URL was not recognized. Reopen My Wells Fargo Deals.');
    }
    return url.pathname + url.search;
}
