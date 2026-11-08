const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const cli = resolve(__dirname, '../../scripts/offers/read-offer-export.cjs');
// Synthetic export in the shape written by Search all banks → Export all.
function exportFile(offers, exportedAt = '2026-11-08T09:30:00.000Z') {
    return { format: 'card-offer-hub-offers', schemaVersion: 1, exportedAt, release: '1.8.0', note: 'Synthetic export.',
        statuses: {}, coverage: [{ bankId: 'chase-offer-lite', bankName: 'Chase', state: 'saved', count: offers.length },
            { bankId: 'citi-offer-lite', bankName: 'Citi', state: 'missing', count: 0 }], offers };
}
function offer(overrides) {
    return { bankId: 'chase-offer-lite', bankName: 'Chase', card: 'Sapphire · 3003', merchant: 'Everyday Market',
        description: '10% back', details: 'Earn 10% back on groceries.', terms: 'Minimum spend $50. Maximum $15.',
        category: 'Groceries', status: 'available', expires: '2026-12-31', scannedAt: '2026-11-07T12:00:00.000Z',
        incomplete: false, url: 'https://secure.chase.com/web/auth/dashboard', ...overrides };
}
function withExports(files, run) {
    const directory = mkdtempSync(join(tmpdir(), 'card-offer-hub-export-'));
    try {
        for (const [name, content] of Object.entries(files)) writeFileSync(join(directory, name), typeof content === 'string' ? content : JSON.stringify(content));
        return run(directory);
    } finally { rmSync(directory, { recursive: true, force: true }); }
}
function runCli(...args) {
    return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('reads the newest export and searches full details and terms', () => withExports({
    'card-offer-hub-offers-2026-11-01T00-00-00-000Z.json': exportFile([offer({ merchant: 'Old Export Shop' })], '2026-11-01T00:00:00.000Z'),
    'card-offer-hub-offers-2026-11-08T09-30-00-000Z.json': exportFile([offer({}),
        offer({ bankId: 'citi-offer-lite', bankName: 'Citi', card: 'Custom Cash · 2002', merchant: 'Harbor Books', status: 'added', details: '', terms: '' })]),
    'unrelated.json': '{}'
}, directory => {
    const result = runCli('--dir', directory, '--query', 'minimum spend');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /card-offer-hub-offers-2026-11-08T09-30-00-000Z\.json/);
    assert.match(result.stdout, /matching offers: 1 of 2/);
    assert.match(result.stdout, /## Chase\n\n### Sapphire · 3003\n\n- \*\*Everyday Market\*\* — 10% back/);
    assert.match(result.stdout, /terms: Minimum spend \$50\. Maximum \$15\./);
    assert.match(result.stdout, /coverage: Chase saved \(2\), Citi missing/);
    assert.doesNotMatch(result.stdout, /Old Export Shop/);

    const json = JSON.parse(runCli('--dir', directory, '--bank', 'citi', '--status', 'added', '--format', 'json').stdout);
    assert.deepEqual(json.offers.map(item => item.merchant), ['Harbor Books']);
    assert.equal(json.total, 2);
    const brief = runCli('--dir', directory, '--no-details', '--limit', '1');
    assert.doesNotMatch(brief.stdout, /terms:/);
    assert.match(brief.stdout, /matching offers: 1 of 2/);
}));

test('missing, foreign and malformed exports and bad options fail with guidance', () => withExports({
    'card-offer-hub-offers-2026-11-08T00-00-00-000Z.json': { format: 'something-else', schemaVersion: 1, offers: [], coverage: [] }
}, directory => {
    let result = runCli('--dir', directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a supported Card Offer Hub export/);
    result = runCli('--dir', join(directory, 'nothing-here'));
    assert.equal(result.status, 1);
    result = withExports({}, empty => runCli('--dir', empty));
    assert.match(result.stderr, /No Card Offer Hub export found .* click Export all/);
    assert.match(runCli('--status', 'activated', '--file', '/dev/null').stderr, /not readable JSON|Unknown status/);
    assert.match(runCli('--format', 'xml').stderr, /Unknown format/);
    assert.match(runCli('--limit', '0').stderr, /positive integer/);
    assert.match(runCli('--help').stdout, /Usage: node scripts\/offers\/read-offer-export\.cjs/);
}));
