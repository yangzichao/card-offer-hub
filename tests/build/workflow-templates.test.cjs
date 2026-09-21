const test = require('node:test');
const assert = require('node:assert/strict');
const { runInNewContext } = require('node:vm');
const { readPublishedSharedRuntime } = require('../helpers/published-issuer-source.cjs');

function harness(type, records, context, activation = true) {
    const sandbox = {};
    runInNewContext(readPublishedSharedRuntime() + '\nglobalThis.probe = { createHubWorkflow, hubMigrateWorkflowSnapshot };', sandbox);
    const workflow = sandbox.probe.createHubWorkflow({ type,
        capabilities: { activation, scope: type === 'account' ? 'account' : 'card' },
        readRecords: () => records, readContext: () => context });
    return { workflow, ...sandbox.probe };
}
const offer = (ownership, status = 'available') => ({ offerId: 'shared', source: {}, ...ownership, status });
const cardContext = { selectedCardIds: ['a', 'b'], priorityCardIds: ['a', 'b'] };

test('per-card keeps the same offer on two cards and never lets one card settle another', () => {
    const records = [offer({ cardId: 'a' }), offer({ cardId: 'b' })];
    const { workflow } = harness('per-card', records, cardContext);
    assert.deepEqual(Array.from(workflow.plan(), record => record.cardId), ['a', 'b']);
    records[0].status = 'added';
    assert.deepEqual(Array.from(workflow.plan(), record => record.cardId), ['b']);
    records[0].status = 'unconfirmed';
    assert.deepEqual(Array.from(workflow.plan(), record => record.cardId), ['b']);
});

test('per-card ignores priority, respects deselection, and deduplicates only exact card-offer identities', () => {
    const records = [offer({ cardId: 'a' }), offer({ cardId: 'a' }), offer({ cardId: 'b' })];
    const context = { selectedCardIds: ['a', 'b'], priorityCardIds: ['b', 'a'], search: 'hidden' };
    const { workflow } = harness('per-card', records, context);
    assert.deepEqual(Array.from(workflow.plan(), record => record.cardId), ['a', 'b']);
    context.selectedCardIds = ['b'];
    assert.deepEqual(Array.from(workflow.plan(), record => record.cardId), ['b']);
});

test('account identity and consent are required; card selection cannot repeat account offers', () => {
    const records = [offer({ accountId: 'customer' }), offer({ accountId: 'customer' })];
    const context = { accountId: 'customer', consent: false, selectedCardIds: ['a', 'b'] };
    const { workflow } = harness('account', records, context);
    assert.equal(workflow.plan().length, 0);
    context.consent = true;
    assert.equal(workflow.plan().length, 1);
    context.accountId = 'different';
    assert.throws(() => workflow.plan(), /current account/);
});

test('conflicting duplicate states cannot produce an arbitrary per-card or account write', () => {
    for (const type of ['per-card', 'account']) {
        const ownership = type === 'account' ? { accountId: 'customer' } : { cardId: 'a' };
        const context = type === 'account' ? { accountId: 'customer', consent: true } : cardContext;
        const { workflow } = harness(type, [offer(ownership), offer(ownership, 'added')], context);
        assert.throws(() => workflow.plan(), /Conflicting/);
    }
});

test('combination assigns a shared offer once, follows priority, and keeps per-card statuses unchanged', () => {
    const records = [offer({ cardId: 'a', groupId: 'group' }), offer({ cardId: 'b', groupId: 'group' })];
    const context = { ...cardContext };
    const { workflow } = harness('amex-combination', records, context);
    assert.deepEqual(Array.from(workflow.plan(), record => record.cardId), ['a']);
    context.priorityCardIds = ['b', 'a'];
    assert.deepEqual(Array.from(workflow.plan(), record => record.cardId), ['b']);
    assert.deepEqual(records.map(record => record.status), ['available', 'available']);
    for (const status of ['added', 'unconfirmed']) {
        records[0].status = status;
        assert.equal(workflow.plan().length, 0, 'a settled or uncertain group cannot move to another card');
    }
});

test('combination keeps card-exclusive groups and cannot choose unselected cards', () => {
    const records = [offer({ cardId: 'a', groupId: 'shared' }), offer({ cardId: 'b', groupId: 'shared' }),
        offer({ cardId: 'b', groupId: 'exclusive', offerId: 'only-b' })];
    const context = { selectedCardIds: ['b'], priorityCardIds: ['a', 'b'] };
    const { workflow } = harness('amex-combination', records, context);
    assert.equal(workflow.plan().length, 2);
    assert.ok(workflow.plan().every(record => record.cardId === 'b'));
    context.priorityCardIds = ['a'];
    assert.throws(() => workflow.plan(), /priority order/);
});

test('ownership records cannot cross workflow boundaries or omit required identifiers', () => {
    for (const [type, invalid] of [
        ['per-card', { accountId: 'customer' }], ['per-card', { cardId: 'a', groupId: 'shared' }],
        ['account', { accountId: 'customer', cardId: 'a' }], ['account', { accountId: '' }],
        ['amex-combination', { cardId: 'a' }], ['amex-combination', { cardId: 'a', groupId: 'g', accountId: 'customer' }]
    ]) {
        const { workflow } = harness(type, [offer(invalid)], cardContext);
        assert.throws(() => workflow.plan(), /requires|does not accept/);
    }
});

test('read-only banks can preview offers but cannot plan or authorize writes', () => {
    const records = [offer({ cardId: 'a' })];
    const { workflow } = harness('per-card', records, cardContext, false);
    assert.equal(workflow.preview().length, 1);
    assert.throws(() => workflow.plan(), /unavailable/);
    assert.throws(() => workflow.assertAction(records[0].source), /unavailable/);
});

test('execution rechecks current target and selection rather than trusting a stale preview', () => {
    const records = [offer({ cardId: 'a', groupId: 'g' }), offer({ cardId: 'b', groupId: 'g' })];
    const context = { ...cardContext };
    const { workflow } = harness('amex-combination', records, context);
    const previous = workflow.plan()[0].source;
    workflow.assertAction(previous);
    context.priorityCardIds = ['b', 'a'];
    assert.throws(() => workflow.assertAction(previous), /target changed/);
    workflow.assertAction(records[1].source);
    context.selectedCardIds = [];
    assert.throws(() => workflow.assertAction(records[1].source), /target changed/);
});

test('workflow declaration has no fallback and rejects mismatched capability scope', () => {
    const { createHubWorkflow } = harness('per-card', [], cardContext);
    for (const type of [undefined, 'unknown', 'account']) {
        assert.throws(() => createHubWorkflow({ type, capabilities: { scope: 'card', activation: true } }), /do not match/);
    }
});

test('snapshot migration preserves old fields without mutating data and rejects other or future workflows', () => {
    const { hubMigrateWorkflowSnapshot } = harness('per-card', [], cardContext);
    const old = { schemaVersion: 1, offers: [{ offerId: 'a' }], selected: ['card-a'], search: 'saved' };
    const migrated = hubMigrateWorkflowSnapshot(old, 'per-card');
    assert.equal(old.schemaVersion, 1);
    assert.equal(migrated.schemaVersion, 2);
    assert.equal(migrated.workflowType, 'per-card');
    assert.equal(migrated.offers, old.offers);
    assert.equal(migrated.search, old.search);
    for (const invalid of [{ ...migrated, workflowType: 'account' }, { ...old, schemaVersion: 3 },
        { ...old, schemaVersion: 2 }, { ...old, workflowType: 'amex-combination' }]) {
        assert.throws(() => hubMigrateWorkflowSnapshot(invalid, 'per-card'), /unsupported workflow/);
    }
});
