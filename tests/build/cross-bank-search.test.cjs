const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { crossBankStorage } = require('./fixtures/cross-bank-offers.cjs');

function harness(storage = crossBankStorage(), failWrite = false) {
    const source = readFileSync(resolve(__dirname, '../../dist/card-offer-hub-all.user.js'), 'utf8');
    const boundary = source.indexOf('// --- Issuer dispatches ---');
    assert.ok(boundary > 0);
    const context = { GM_getValue: (key, fallback) => structuredClone(storage.get(key) ?? fallback),
        GM_setValue: (key, value) => { if (failWrite) throw new Error('No storage'); storage.set(key, structuredClone(value)); } };
    runInNewContext(source.slice(0, boundary) + 'globalThis.probe = { hubReadSavedResults, hubFilterResults, hubLoadSearchPreferences, hubSaveSearchPreferences };})();', context);
    return { ...context.probe, storage };
}
const filters = (overrides = {}) => ({ query: '', bank: '', status: '', ...overrides });

test('all six saved formats normalize without exposing account identifiers or writing a second index', () => {
    const h = harness(), before = structuredClone(h.storage);
    const saved = h.hubReadSavedResults();
    assert.equal(saved.records.length, 7);
    assert.equal(saved.coverage.filter(entry => entry.state === 'saved').length, 6);
    assert.equal(saved.records.find(row => row.bankName === 'Amex').card, 'Gold · 1001');
    assert.equal(saved.records.find(row => row.bankName === 'Citi').card, 'Custom Cash · 2002');
    assert.doesNotMatch(JSON.stringify(saved.records), /synthetic-amex-card|card-citi|card-chase/);
    assert.deepEqual(h.storage, before);
});
test('search combines merchant, description, bank and card words and normalizes accents', () => {
    const h = harness(), { records } = h.hubReadSavedResults();
    assert.equal(h.hubFilterResults(records, filters({ query: 'everyday' })).length, 3);
    assert.equal(h.hubFilterResults(records, filters({ query: 'MARKET gold 1001' })).length, 1);
    assert.equal(h.hubFilterResults(records, filters({ query: 'cafe dining', status: 'review' })).length, 1);
    assert.equal(h.hubFilterResults(records, filters({ query: 'everyday', bank: 'citi-offer-lite', status: 'added' })).length, 0);
    assert.equal(h.hubFilterResults(records, filters({ status: 'added' })).length, 2);
    assert.equal(h.hubFilterResults(records, filters({ status: 'available' })).length, 4);
});
test('malformed or future snapshots exclude only their bank and preserve original values', () => {
    const h = harness();
    h.storage.set('issuer:citi-offer-lite:citi-offer-lite:workspace', { schemaVersion: 99, valuable: 'preserve' });
    h.storage.set('issuer:chase-offer-lite:chase-offer-lite:workspace', { schemaVersion: 1, accounts: null });
    const before = structuredClone(h.storage), saved = h.hubReadSavedResults();
    assert.equal(saved.records.length, 4);
    assert.equal(saved.coverage.filter(entry => entry.state === 'error').length, 2);
    assert.deepEqual(h.storage, before);
});
test('uncertain BOFA and informational Amex offers cannot appear as available', () => {
    const h = harness();
    const bofa = h.storage.get('issuer:bofa-offer-lite:bofa-offer-lite:workspace');
    bofa.offers[0].result = 'Unconfirmed';
    const amex = h.storage.get('issuer:amex-offer-lite:card_offer_hub_amex_saved_offers_v1');
    amex.cards[0].offers[0].enrollable = false;
    const { records } = h.hubReadSavedResults();
    assert.equal(records.find(row => row.bankName === 'BankAmeriDeals').status, 'review');
    assert.equal(records.find(row => row.bankName === 'Amex').status, 'other');
});

test('search reads new workflow snapshots and excludes a mismatched bank without changing storage', () => {
    const h = harness();
    for (const [key, value] of h.storage) {
        if (!key.endsWith(':workspace') && !key.endsWith('saved_offers_v1')) continue;
        value.schemaVersion = 2;
        value.workflowType = key.includes('amex') ? 'amex-combination'
            : key.includes('citi') || key.includes('chase') ? 'per-card' : 'account';
    }
    assert.equal(h.hubReadSavedResults().records.length, 7);
    h.storage.get('issuer:citi-offer-lite:citi-offer-lite:workspace').workflowType = 'account';
    const before = structuredClone(h.storage);
    const result = h.hubReadSavedResults();
    assert.equal(result.coverage.filter(entry => entry.state === 'error').length, 1);
    assert.deepEqual(h.storage, before);
});
test('search preferences survive reload and unsupported preferences and save failures are visible', () => {
    const h = harness();
    const preferences = filters({ query: 'market', bank: 'amex-offer-lite', status: 'available' });
    assert.equal(h.hubSaveSearchPreferences(preferences), '');
    assert.deepEqual(JSON.parse(JSON.stringify(harness(h.storage).hubLoadSearchPreferences().preferences)), preferences);
    assert.match(harness(h.storage, true).hubSaveSearchPreferences(preferences), /could not be saved/);
    h.storage.set('hub:search-preferences', { schemaVersion: 2, query: 'preserve' });
    const before = structuredClone(h.storage);
    assert.match(h.hubLoadSearchPreferences().error, /preserved/);
    assert.deepEqual(h.storage, before);
});
