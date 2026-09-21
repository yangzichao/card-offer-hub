function hubWorkflowMarkup(scopeMarkup, { bank, extraReviewMarkup = '', readOnly = false,
    scanLabel = 'Scan offers', scanDescription = 'Scan to refresh saved offers. Nothing runs until you click.' } = {}) {
    return `<div class="panel">
      <header><h2></h2><button id="collapse" aria-label="Minimize ${bank} panel" aria-expanded="true">−</button></header>
      <div id="body">
        <section class="hub-step" data-step="scope"><h3>1. Choose scope</h3>${scopeMarkup}</section>
        <section class="hub-step" data-step="scan"><h3>2. Scan offers</h3>
          <p class="muted">${scanDescription}</p>
          <div class="actions"><button id="scan" aria-label="${scanLabel}">${scanLabel}</button><button id="stop" class="stop" aria-label="Stop">Stop</button></div>
        </section>
        <section class="hub-step" data-step="review"><h3>3. Review & add</h3>
          <input id="search" type="search" aria-label="Search saved offers" placeholder="Search saved offers">
          <button id="hub-clear-search" class="hub-clear-search" aria-label="Clear search">Clear search</button>
          <p class="muted hub-search-rule">Search changes the list only. Add all includes offers hidden by search within your chosen scope.</p>
          <p id="counts" class="muted"></p><div class="actions"><button id="add" class="primary" aria-label="Add all offers" aria-describedby="hub-action-reason">Add all offers</button>${extraReviewMarkup}</div>
          <p id="hub-action-reason" class="hub-action-reason" role="note"></p>
          ${readOnly ? `<p id="enrollment-notice" class="notice">${bank} is read-only here. Add offers on the bank website.</p>` : ''}
          <div id="offers" class="offers"></div>
        </section>
        <footer><p id="workspace-cache" class="muted"></p><div id="status" role="status" aria-live="polite"></div><div id="storage-error" class="error" role="alert"></div></footer>
      </div></div>`;
}
function hubMatchesSearch(offer, query) {
    return [offer.merchant, offer.name, offer.title, offer.description, offer.headline, offer.category]
        .filter(value => typeof value === 'string').join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
function hubOfferStatusLabel(status) {
    if (['AVAILABLE', 'ELIGIBLE', 'NEW'].includes(status)) return 'Available';
    if (['ENROLLED', 'ACTIVATED'].includes(status)) return 'Added';
    if (['UNCONFIRMED', 'UNKNOWN', 'FAILED', 'CONFLICT'].includes(status)) return 'Needs review';
    return 'Skipped';
}
function hubShowEmptyOffers(container, query) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = query.trim() ? 'No offers match your search. Clear search to view all saved offers in this scope.' : 'No offers in this scope yet. Choose your scope and scan to refresh.';
    container.append(note);
}
function hubSetActionLabel(control, label, count = null) {
    if (!control) return;
    control.textContent = count === null ? label : `${label} (${count})`;
    control.setAttribute('aria-label', label);
}
function renderHubWorkflow(root, { count, hasScope = true, needsScan = false, busy = false,
    storageError = '', readOnly = false, coolingDown = false, progress = null } = {}) {
    const add = root.getElementById('add') || root.getElementById('btn-enroll-all');
    hubSetActionLabel(add, 'Add all offers', busy ? null : count);
    add.disabled = Boolean(busy || storageError || readOnly || coolingDown || !hasScope || needsScan || !count);
    const reason = root.getElementById('hub-action-reason');
    reason.textContent = storageError ? 'Resolve the storage error before continuing.'
        : busy ? progress ? `Adding ${progress.completed} of ${progress.total}. The task keeps its original scope while you search or switch tabs.` : 'Working. Use Stop to end the current task.'
        : readOnly ? 'Adding is unavailable for this bank. You can still scan and search.'
        : coolingDown ? 'Waiting for the bank cooldown. Start again manually when it ends.'
        : !hasScope ? 'Choose or confirm your scope in step 1.'
        : needsScan ? 'Scan offers in step 2 before adding.'
        : !count ? 'No available offers in this scope. Scan again to refresh.'
        : `Ready to add ${count} available ${count === 1 ? 'offer' : 'offers'} in your chosen scope. Search does not change this total.`;
}
