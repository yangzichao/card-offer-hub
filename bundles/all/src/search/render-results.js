const HUB_STATUS_LABELS = { available: 'Available when scanned', added: 'Added', review: 'Needs review', other: 'Other / skipped' };
function hubNode(tag, text = '', className = '') {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
}
function hubRenderSearchResults(root, saved, preferences, limit) {
    const filtered = hubFilterResults(saved.records, preferences);
    const list = root.getElementById('hub-results');
    list.replaceChildren();
    root.getElementById('hub-result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`;
    root.getElementById('hub-result-coverage').textContent = `${new Set(filtered.map(record => record.bankId)).size} banks · saved snapshots`;
    for (const record of filtered.slice(0, limit)) {
        const row = hubNode('article', '', 'hub-result');
        const top = hubNode('div', '', 'hub-result-top');
        top.append(hubNode('span', record.bankName, 'hub-bank'), hubNode('span', HUB_STATUS_LABELS[record.status], `hub-state ${record.status}`));
        const metadata = hubNode('div', '', 'hub-result-meta');
        metadata.append(hubNode('span', record.card), hubNode('span', record.scannedAt ? `Scanned ${new Date(record.scannedAt).toLocaleString()}` : 'Scan time unavailable'));
        if (record.expires) metadata.append(hubNode('span', `Expires ${record.expires}`));
        if (record.incomplete) metadata.append(hubNode('span', 'Incomplete scan'));
        const link = hubNode('a', `Open ${record.bankName} →`);
        link.href = record.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `Open ${record.bankName} offers in a new tab`);
        row.append(top, hubNode('h3', record.merchant || 'Saved offer'));
        if (record.description && record.description !== record.merchant) row.append(hubNode('p', record.description));
        row.append(metadata, link);
        list.append(row);
    }
    if (!filtered.length) list.append(hubNode('div', saved.records.length
        ? 'No matching offers. Try another merchant, bank or status.'
        : 'No saved offers yet. Open a bank website and scan with the All Banks script, then reload saved results here.', 'hub-empty'));
    const more = root.getElementById('hub-load-more');
    more.hidden = filtered.length <= limit;
    more.textContent = `Show more (${Math.min(limit, filtered.length)} of ${filtered.length})`;
    const coverage = root.getElementById('hub-coverage-list');
    coverage.replaceChildren();
    for (const entry of saved.coverage) {
        const row = hubNode('li');
        row.append(hubNode('span', entry.bank.label), hubNode('span', entry.state === 'error' ? 'Cannot read saved data' : entry.state === 'missing' ? 'Not scanned in All Banks' : `${entry.count} saved offers`));
        coverage.append(row);
    }
    root.getElementById('hub-data-warning').textContent = saved.coverage.some(entry => entry.state === 'error')
        ? 'Some saved results could not be read and are excluded. Original data has been preserved; see bank coverage below.' : '';
}
