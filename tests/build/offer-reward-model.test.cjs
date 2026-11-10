const test = require('node:test');
const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const { readPublishedSharedRuntime } = require('../helpers/published-issuer-source.cjs');

function shared() {
    const context = {};
    runInNewContext(`${readPublishedSharedRuntime()}
        globalThis.probe = { hubRewardValue, hubSavedRewardValue, hubRewardRate, hubRewardTotal, hubFormatReward, hubRewardLimitsFromText,
            hubNormalizeOfferView, hubRewardFilterVerdict, hubRewardPassesFilter, createHubOfferViewStore, hubCompareOfferRewards,
            hubOfferListView, hubOfferListGroup, serializeWorkspaceRecord, workspaceRecord };`, context);
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

test('minimums hide offers known to be below them; unlisted values stay unless the user hides them too', () => {
    const h = shared();
    assert.deepEqual(plain(h.hubNormalizeOfferView({ minRate: 250, minTotal: -3, sort: 'random', show: 'everything' })),
        { minRate: 100, minTotal: 0, keepUnlisted: true, sort: 'value', show: 'available' });
    assert.deepEqual(plain(h.hubNormalizeOfferView({ minRate: NaN, minTotal: '5', keepUnlisted: false, sort: 'rate', show: 'added' })),
        { minRate: 0, minTotal: 0, keepUnlisted: false, sort: 'rate', show: 'added' });
    const view = { minRate: 3, minTotal: 10 };
    const verdict = reward => h.hubRewardFilterVerdict(reward, view);
    assert.equal(verdict(null), 'kept-unlisted', 'no value listed');
    assert.equal(verdict(h.hubRewardValue('percent', 2, { maxReward: 100 })), 'hidden-small', 'rate below');
    assert.equal(verdict(h.hubRewardValue('percent', 10, { maxReward: 4 })), 'hidden-small', 'cap below');
    assert.equal(verdict(h.hubRewardValue('percent', 10)), 'kept-unlisted', 'no cap listed');
    assert.equal(verdict(h.hubRewardValue('fixed', 5, { minSpend: 25 })), 'hidden-small', 'total below');
    assert.equal(verdict(h.hubRewardValue('fixed', 30)), 'kept-unlisted', 'no minimum spend listed');
    assert.equal(verdict(h.hubRewardValue('fixed', 30, { minSpend: 2000 })), 'hidden-small', 'rate 1.5% below');
    assert.equal(verdict(h.hubRewardValue('percent', 10, { maxReward: 50 })), 'shown');
    assert.equal(h.hubRewardFilterVerdict(null, { ...view, keepUnlisted: false }), 'hidden-unlisted');
    assert.equal(h.hubRewardPassesFilter(h.hubRewardValue('percent', 10), { ...view, keepUnlisted: false }), false);
    assert.equal(h.hubRewardPassesFilter(h.hubRewardValue('percent', 1), undefined), true, 'no view mounted hides nothing');
    assert.equal(h.hubRewardFilterVerdict(null, { minRate: 0, minTotal: 0, keepUnlisted: false }), 'shown', 'no minimum, nothing to judge');
});

test('best value sorts by total, then rate; unknown values go last and ties keep bank order', () => {
    const h = shared();
    const rewards = {
        capped: h.hubRewardValue('percent', 10, { maxReward: 7 }), big: h.hubRewardValue('fixed', 200, { minSpend: 1000 }),
        uncapped: h.hubRewardValue('percent', 15), unknown: null, alsoCapped: h.hubRewardValue('percent', 20, { maxReward: 7 })
    };
    const order = sort => Object.keys(rewards).sort((left, right) => h.hubCompareOfferRewards(sort)(rewards[left], rewards[right]));
    assert.deepEqual(order('value'), ['big', 'alsoCapped', 'capped', 'uncapped', 'unknown']);
    assert.deepEqual(order('rate'), ['big', 'alsoCapped', 'uncapped', 'capped', 'unknown']);
    assert.deepEqual(order('bank'), Object.keys(rewards));
});

test('the list shows one tab, counts every tab after the minimums, and says why it is empty', () => {
    const h = shared();
    const item = (name, group, reward) => ({ offer: name, group, reward });
    const items = [item('small', 'available', h.hubRewardValue('percent', 2, { maxReward: 5 })),
        item('big', 'available', h.hubRewardValue('fixed', 50, { minSpend: 100 })), item('unknown', 'available', null),
        item('done', 'added', h.hubRewardValue('percent', 10)), item('info', 'other', null)];
    const names = view => Array.from(view.items, entry => entry.offer);
    const state = { offerView: { show: 'available' } };
    assert.deepEqual(names(h.hubOfferListView(null, items, state)), ['big', 'small', 'unknown']);
    state.offerView = { show: 'available', minRate: 5 };
    assert.deepEqual(names(h.hubOfferListView(null, items, state)), ['big', 'unknown']);
    state.offerView = { show: 'available', minRate: 5, keepUnlisted: false };
    assert.deepEqual(names(h.hubOfferListView(null, items, state)), ['big']);
    state.offerView = { show: 'all', sort: 'bank' };
    assert.deepEqual(names(h.hubOfferListView(null, items, state)), ['small', 'big', 'unknown', 'done', 'info']);
    state.offerView = { show: 'added' };
    assert.deepEqual(names(h.hubOfferListView(null, items, state)), ['done']);

    state.offerView = { show: 'available', minTotal: 100 };
    assert.match(h.hubOfferListView(null, items.slice(0, 2), state).emptyMessage, /^All 2 offers here are hidden by your minimum value/);
    state.offerView = { show: 'available' };
    assert.equal(h.hubOfferListView(null, items.slice(3), state).emptyMessage, 'Nothing left to add. See All for the other 2 offers.');
    assert.equal(h.hubOfferListView(null, [], state).emptyMessage, '', 'an empty bank list keeps the bank\'s own note');
    assert.equal(h.hubOfferListGroup('Not added'), 'available', 'Add tries it again');
    assert.equal(h.hubOfferListGroup('Needs review'), 'available', 'an unconfirmed offer stays in view');
    assert.equal(h.hubOfferListGroup('Add on Chase'), 'available', 'still yours to add on Chase');
    assert.equal(h.hubOfferListGroup('Added'), 'added');
    assert.equal(h.hubOfferListGroup('Skipped'), 'other');
});

test('list options save per bank, read 1.9.0 filters forward, keep an unreadable value, and report save failures', () => {
    const h = shared();
    const storage = new Map();
    const access = { get: (key, fallback) => storage.get(key) ?? fallback, set: (key, value) => storage.set(key, value) };
    const store = () => h.createHubOfferViewStore({ storage: access, storageKey: 'bank:reward-filter' });
    assert.deepEqual(plain(store().load()), { view: { minRate: 0, minTotal: 0, keepUnlisted: true, sort: 'value', show: 'available' }, error: '' });

    storage.set('bank:reward-filter', { schemaVersion: 1, minRate: 40, minTotal: 50 });
    assert.deepEqual(plain(store().load().view), { minRate: 40, minTotal: 50, keepUnlisted: true, sort: 'value', show: 'available' }, '1.9.0 save');
    assert.equal(store().save({ minRate: 5, minTotal: 10, keepUnlisted: false, sort: 'rate', show: 'all' }), '');
    assert.deepEqual(plain(storage.get('bank:reward-filter')), { schemaVersion: 2, minRate: 5, minTotal: 10, keepUnlisted: false, sort: 'rate', show: 'all' });
    assert.deepEqual(plain(store().load().view), { minRate: 5, minTotal: 10, keepUnlisted: false, sort: 'rate', show: 'all' });

    for (const unreadable of [{ schemaVersion: 9, minRate: 1, minTotal: 0 }, { schemaVersion: 2, minRate: 1, minTotal: 0, keepUnlisted: true, sort: 'x', show: 'all' }, 'text']) {
        storage.set('bank:reward-filter', unreadable);
        const future = store();
        assert.match(future.load().error, /could not be read and were kept/);
        assert.match(future.save({ minRate: 2 }), /this visit only/);
        assert.deepEqual(storage.get('bank:reward-filter'), unreadable);
    }
    const failing = h.createHubOfferViewStore({ storage: { get: () => null, set: () => { throw new Error('full'); } }, storageKey: 'k' });
    assert.match(failing.save({ minRate: 1 }), /could not be saved/);
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
