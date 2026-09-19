function openHubSearch(launcher) {
    if (document.getElementById('card-offer-hub-search')) return;
    const host = hubNode('div');
    host.id = 'card-offer-hub-search';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${HUB_SEARCH_STYLES}</style>
      <dialog aria-labelledby="hub-search-title">
        <header><div class="hub-heading"><div class="hub-eyebrow">Card Offer Hub · All Banks</div><h2 id="hub-search-title">Find your next offer.</h2></div>
          <button class="hub-close" aria-label="Close cross-bank search">×</button></header>
        <div class="hub-search-content">
          <p class="hub-search-intro">Search offers you have saved across banks. Results reflect your last scans; open the bank to check current terms and availability.</p>
          <input id="hub-query" class="hub-query" type="search" aria-label="Search offers across all banks" placeholder="Merchant, offer or card name" autocomplete="off">
          <div class="hub-filters">
            <label>Bank<select id="hub-bank" aria-label="Filter by bank"><option value="">All banks</option></select></label>
            <label>Status<select id="hub-status" aria-label="Filter by offer status"><option value="">All statuses</option><option value="available">Available when scanned</option><option value="added">Added</option><option value="review">Needs review</option><option value="other">Other / skipped</option></select></label>
            <button id="hub-reload" aria-label="Reload saved results">Reload saved results</button>
            <button id="hub-reset" aria-label="Clear cross-bank filters">Clear filters</button>
          </div>
          <p id="hub-preferences-error" class="hub-search-error" role="alert"></p>
          <p id="hub-data-warning" class="hub-search-error" role="alert"></p>
          <div class="hub-search-summary" role="status" aria-live="polite"><strong id="hub-result-count"></strong><span id="hub-result-coverage" class="muted"></span></div>
          <div id="hub-results"></div><button id="hub-load-more" class="hub-more" aria-label="Show more cross-bank results"></button>
          <details class="hub-coverage"><summary aria-label="Show saved bank coverage">Saved bank coverage</summary><ul id="hub-coverage-list"></ul><p>Data from standalone scripts is separate. Scan each bank using All Banks to include it here.</p></details>
        </div>
      </dialog>`;
    const loaded = hubLoadSearchPreferences();
    const preferences = loaded.preferences;
    let saved = hubReadSavedResults(), limit = 60;
    const query = root.getElementById('hub-query'), bank = root.getElementById('hub-bank'), status = root.getElementById('hub-status');
    for (const entry of HUB_BANKS) {
        const option = hubNode('option', entry.label);
        option.value = entry.id;
        bank.append(option);
    }
    query.value = preferences.query; bank.value = preferences.bank; status.value = preferences.status;
    const error = root.getElementById('hub-preferences-error');
    error.textContent = loaded.error;
    const render = () => hubRenderSearchResults(root, saved, preferences, limit);
    const changed = () => {
        Object.assign(preferences, { query: query.value, bank: bank.value, status: status.value });
        if (!loaded.error) error.textContent = hubSaveSearchPreferences(preferences);
        limit = 60;
        render();
    };
    query.addEventListener('input', changed);
    bank.addEventListener('change', changed);
    status.addEventListener('change', changed);
    root.getElementById('hub-reset').onclick = () => { query.value = bank.value = status.value = ''; changed(); query.focus(); };
    root.getElementById('hub-reload').onclick = () => { saved = hubReadSavedResults(); limit = 60; render(); };
    root.getElementById('hub-load-more').onclick = () => { limit += 60; render(); };
    const dialog = root.querySelector('dialog');
    const close = () => { dialog.close(); host.remove(); if (launcher?.isConnected) launcher.focus(); };
    root.querySelector('.hub-close').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
    });
    document.body.append(host);
    render();
    dialog.showModal();
    query.focus();
}
