const test = require('node:test');
const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const { readPublishedSharedRuntime } = require('../helpers/published-issuer-source.cjs');

function shared() {
    const context = {};
    runInNewContext(`${readPublishedSharedRuntime()}
        globalThis.probe = { hubRewardValue, hubSavedRewardValue, hubRewardRate, hubRewardTotal, hubFormatReward, hubRewardLimitsFromText,
            hubNormalizeRewardFilter, hubRewardPassesFilter, createHubRewardFilterStore, serializeWorkspaceRecord, workspaceRecord };`, context);
    return context.probe;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('a reward keeps only explicit positive amounts and drops a contradictory total', () => {
    const h = shared();
    for (const [kind, amount] of [['percent', 0], ['percent', -5], ['percent', 101], ['percent', '10'], ['fixed', NaN], ['points', 5], [undefined, 5]]) {
        assert.equal(h.hubRewardValue(kind, amount), null, `${kind} ${amount}`);
    }
    assert.deepEqual(plain(h.hubRewardValue('percent', 10, { maxReward: 0, minSpend: 0 })), { kind: 'percent', amount: 10, maxReward: null, minSpend: null });
    assert.deepEqual(plain(h.hubRewardValue('fixed', 20, { maxReward: 5, minSpend: 100 })), { kind: 'fixed', amount: 20, maxReward: null, minSpend: 100 });
});

test('rate and total come from the stated values only', () => {
    const h = shared();
    const cases = [
        [h.hubRewardValue('percent', 10, { maxReward: 7 }), 10, 7, '10% back · up to $7'],
        [h.hubRewardValue('percent', 5, { minSpend: 50 }), 5, null, '5% back · no cap listed · min spend $50'],
        [h.hubRewardValue('percent', 2.5, { maxReward: 1.4 }), 2.5, 1.4, '2.5% back · up to $1.40'],
        [h.hubRewardValue('fixed', 20, { minSpend: 100 }), 20, 20, '$20 back on $100 (20%)'],
        [h.hubRewardValue('fixed', 20), null, 20, '$20 back'],
        [h.hubRewardValue('fixed', 5, { maxReward: 25, minSpend: 15 }), 5 / 15 * 100, 25, '$5 back each on $15 (33.33%) · up to $25 total'],
        [h.hubRewardValue('fixed', 250, { minSpend: 1000 }), 25, 250, '$250 back on $1,000 (25%)']
    ];
    for (const [reward, rate, total, text] of cases) {
        assert.equal(h.hubRewardRate(reward), rate);
        assert.equal(h.hubRewardTotal(reward), total);
        assert.equal(h.hubFormatReward(reward), text);
    }
    assert.equal(h.hubFormatReward(null), '');
});

test('caps and minimum spend are read only from the explicit Cardlytics phrases', () => {
    const h = shared();
    assert.deepEqual(plain(h.hubRewardLimitsFromText('Earn 10% cash back on your Example purchase, with a $7.00 cash back maximum.<br/><br/>About Example.')),
        { maxReward: 7, minSpend: null });
    assert.deepEqual(plain(h.hubRewardLimitsFromText('Earn 2% cash back on all of your Example purchases, until a $1,250.50 cash back maximum is reached.')),
        { maxReward: 1250.5, minSpend: null });
    assert.deepEqual(plain(h.hubRewardLimitsFromText('Earn 15% cash back on your first payment, <b>when you spend $9.99 or more.</b>')),
        { maxReward: null, minSpend: 9.99 });
    assert.deepEqual(plain(h.hubRewardLimitsFromText('Earn $15 cash back when you spend $75 at Example!', undefined)), { maxReward: null, minSpend: 75 });
    assert.deepEqual(plain(h.hubRewardLimitsFromText('Save up to $50 on your next order.', null)), { maxReward: null, minSpend: null });
});

test('the filter hides only offers known to be below a threshold', () => {
    const h = shared();
    assert.deepEqual(plain(h.hubNormalizeRewardFilter({ minRate: 250, minTotal: -3 })), { minRate: 100, minTotal: 0 });
    assert.deepEqual(plain(h.hubNormalizeRewardFilter({ minRate: NaN, minTotal: '5' })), { minRate: 0, minTotal: 0 });
    const filter = { minRate: 3, minTotal: 10 };
    const shown = reward => h.hubRewardPassesFilter(reward, filter);
    assert.equal(shown(null), true, 'unknown value');
    assert.equal(shown(h.hubRewardValue('percent', 2, { maxReward: 100 })), false, 'rate below');
    assert.equal(shown(h.hubRewardValue('percent', 10, { maxReward: 4 })), false, 'cap below');
    assert.equal(shown(h.hubRewardValue('percent', 10)), true, 'no cap stated');
    assert.equal(shown(h.hubRewardValue('fixed', 5, { minSpend: 25 })), false, 'total below');
    assert.equal(shown(h.hubRewardValue('fixed', 30)), true, 'no minimum stated');
    assert.equal(shown(h.hubRewardValue('fixed', 30, { minSpend: 2000 })), false, 'rate 1.5% below');
    assert.equal(h.hubRewardPassesFilter(h.hubRewardValue('percent', 1), { minRate: 0, minTotal: 0 }), true, 'filter off');
});

test('the filter store keeps an unreadable value and reports save failures', () => {
    const h = shared();
    const storage = new Map();
    const access = { get: (key, fallback) => storage.get(key) ?? fallback, set: (key, value) => storage.set(key, value) };
    const store = h.createHubRewardFilterStore({ storage: access, storageKey: 'bank:reward-filter' });
    assert.deepEqual(plain(store.load()), { filter: { minRate: 0, minTotal: 0 }, error: '' });
    assert.equal(store.save({ minRate: 5, minTotal: 10 }), '');
    assert.deepEqual(plain(storage.get('bank:reward-filter')), { schemaVersion: 1, minRate: 5, minTotal: 10 });
    assert.deepEqual(plain(h.createHubRewardFilterStore({ storage: access, storageKey: 'bank:reward-filter' }).load().filter), { minRate: 5, minTotal: 10 });

    storage.set('bank:reward-filter', { schemaVersion: 9, minRate: 1 });
    const future = h.createHubRewardFilterStore({ storage: access, storageKey: 'bank:reward-filter' });
    assert.match(future.load().error, /could not be read and was kept/);
    assert.match(future.save({ minRate: 2, minTotal: 0 }), /this visit only/);
    assert.deepEqual(storage.get('bank:reward-filter'), { schemaVersion: 9, minRate: 1 });

    const failing = h.createHubRewardFilterStore({ storage: { get: () => null, set: () => { throw new Error('full'); } }, storageKey: 'k' });
    assert.match(failing.save({ minRate: 1, minTotal: 0 }), /could not be saved/);
});

test('saved records carry an optional reward; older saves without one read as unknown', () => {
    const h = shared();
    const fields = { offerId: 'id', title: 'text', reward: 'reward' };
    const reward = h.hubRewardValue('percent', 10, { maxReward: 7 });
    assert.deepEqual(plain(h.serializeWorkspaceRecord({ offerId: 'a', title: 'T', reward, extra: 'dropped' }, fields)),
        { offerId: 'a', title: 'T', reward: { kind: 'percent', amount: 10, maxReward: 7, minSpend: null } });
    assert.deepEqual(plain(h.serializeWorkspaceRecord({ offerId: 'a', title: 'T' }, fields)), { offerId: 'a', title: 'T', reward: null });
    assert.deepEqual(plain(h.workspaceRecord({ offerId: 'a', title: 'T' }, fields)), { offerId: 'a', title: 'T', reward: null });
    assert.throws(() => h.workspaceRecord({ offerId: 'a', title: 'T', reward: { kind: 'percent', amount: 500 } }, fields), /Invalid saved reward/);
    assert.throws(() => h.workspaceRecord({ offerId: 'a', title: 'T', reward: 'ten percent' }, fields), /Invalid saved reward/);
});
