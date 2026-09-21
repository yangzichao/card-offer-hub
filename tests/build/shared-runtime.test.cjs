const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { loadScriptRegistry } = require('../../scripts/build/script-registry.cjs');
const { readPublishedSharedRuntime, readPublishedIssuerBody } = require('../helpers/published-issuer-source.cjs');

function runtimeHarness() {
    let now = 1000;
    const timers = [];
    class TestDate extends Date { static now() { return now; } }
    const context = { Date: TestDate,
        setTimeout(callback, milliseconds) { timers.push(milliseconds); now += milliseconds; queueMicrotask(callback); } };
    const source = readPublishedSharedRuntime();
    runInNewContext(source + '\nglobalThis.access = { createHubRequestScheduler, createHubWorkspaceStore, createHubPacingStorage, hubRetryAfterMilliseconds, createHubActionRunner, runHubActionLifecycle };', context);
    return { ...context.access, timers, advance: duration => { now += duration; }, now: () => now };
}

test('every shared module is emitted once and bank bodies own no shared definitions', () => {
    const published = readFileSync(resolve(__dirname, '../../dist/card-offer-hub-all.user.js'), 'utf8');
    const scripts = loadScriptRegistry();
    for (const source of new Set(scripts.flatMap(script => script.sharedModules))) {
        assert.equal(published.split(`// Source: shared/${source}\n`).length - 1, 1, source);
    }
    assert.equal(published.split('const HUB_DESIGN_STYLES =').length - 1, 1);
    for (const script of scripts) assert.doesNotMatch(readPublishedIssuerBody(script.id), /\/\/ Source: shared\//);
});

test('loading the common runtime is passive and requires no page, issuer state, storage, or network', () => {
    const runtime = runtimeHarness();
    assert.equal(runtime.timers.length, 0);
});

function schedulerFixture(runtime, overrides = {}) {
    const state = { nextRequestAt: 0, cooldownUntil: 0 };
    const settings = { state, gapMilliseconds: 500, ensureRunning() {}, ...overrides };
    return { state, ...runtime.createHubRequestScheduler(settings) };
}

test('the slot stays exclusive through body completion and measures the gap after completion', async () => {
    const runtime = runtimeHarness(), scheduler = schedulerFixture(runtime);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const first = scheduler.withRequestSlot(async () => { await pending; runtime.advance(1800); });
    await Promise.resolve();
    await assert.rejects(scheduler.withRequestSlot(() => assert.fail('overlap')), /still active/);
    release();
    await first;
    const completedAt = runtime.now();
    await scheduler.withRequestSlot(() => assert.equal(runtime.now() - completedAt, 500));
    assert.equal(scheduler.state.requestInFlight, false);
});

test('stop during the gap cancels the next operation and releases the slot', async () => {
    const runtime = runtimeHarness();
    let stopped = false;
    const scheduler = schedulerFixture(runtime, {
        ensureRunning() { if (stopped) throw new Error('Stopped'); }, onWait() { stopped = true; }
    });
    scheduler.state.nextRequestAt = runtime.now() + 500;
    await assert.rejects(scheduler.withRequestSlot(() => assert.fail('sent after stop')), /Stopped/);
    assert.equal(scheduler.state.requestInFlight, false);
});

test('reservation storage failure prevents sending and preserves the reserved deadline', async () => {
    const runtime = runtimeHarness();
    const scheduler = schedulerFixture(runtime, { reservationMilliseconds: 45000,
        persist() { throw new Error('Cannot save'); } });
    await assert.rejects(scheduler.withRequestSlot(() => assert.fail('sent without persistence')), /Cannot save/);
    assert.equal(scheduler.state.nextRequestAt, runtime.now() + 45500);
    assert.equal(scheduler.state.requestInFlight, false);
});

test('completion persistence failure still releases the slot and does not retry', async () => {
    const runtime = runtimeHarness();
    let saves = 0, requests = 0;
    const scheduler = schedulerFixture(runtime, { reservationMilliseconds: 45000,
        persist() { if (++saves === 2) throw new Error('Cannot save completion'); } });
    await assert.rejects(scheduler.withRequestSlot(() => { requests++; }), /Cannot save completion/);
    assert.equal(requests, 1);
    assert.equal(scheduler.state.requestInFlight, false);
});

test('scheduler instances do not share state or block a different bank', async () => {
    const runtime = runtimeHarness(), first = schedulerFixture(runtime), second = schedulerFixture(runtime);
    let release;
    const pending = first.withRequestSlot(() => new Promise(resolve => { release = resolve; }));
    await Promise.resolve();
    let ran = false;
    await second.withRequestSlot(() => { ran = true; });
    assert.equal(ran, true);
    assert.equal(first.state.requestInFlight, true);
    release();
    await pending;
});

test('cooldown blocks before waiting and Retry-After rejects overflow without shortening the policy floor', async () => {
    const runtime = runtimeHarness(), scheduler = schedulerFixture(runtime);
    scheduler.state.cooldownUntil = runtime.now() + 60000;
    scheduler.state.nextRequestAt = runtime.now() + 45000;
    await assert.rejects(scheduler.withRequestSlot(() => assert.fail('sent during cooldown')), /Rate limited/);
    assert.deepEqual(runtime.timers, []);
    assert.equal(runtime.hubRetryAfterMilliseconds('9'.repeat(400), 300000), 300000);
    assert.equal(runtime.hubRetryAfterMilliseconds('1', 120000, 0, 120000), 120000);
});

test('workspace instances isolate pending requests and persist only declared fields', () => {
    const runtime = runtimeHarness(), storage = new Map();
    const fields = { accounts: null, offers: { offerId: 'id', status: 'text', merchant: 'text' } };
    function instance(storageKey) {
        const state = { offers: [{ offerId: 'same-id', status: 'AVAILABLE', merchant: 'Store', requestToken: 'never-save' }],
            lastScanAt: 1000, workspaceScope: 'scope', collapsed: false };
        return { state, ...runtime.createHubWorkspaceStore({ state, fields, storageKey, workflowType: 'account',
            storage: { get: (key, fallback) => storage.get(key) ?? fallback, set: (key, value) => storage.set(key, value) } }) };
    }
    const first = instance('first'), second = instance('second');
    first.markWorkspaceOfferPending(first.state.offers[0]);
    second.saveWorkspace();
    assert.equal(storage.get('first').offers[0].status, 'UNCONFIRMED');
    assert.equal(storage.get('second').offers[0].status, 'AVAILABLE');
    assert.doesNotMatch(JSON.stringify([...storage]), /never-save|requestToken/);
});

test('read-only capability is enforced by the runner before any task begins', async () => {
    const runtime = runtimeHarness(), state = { busy: false };
    const run = runtime.createHubActionRunner({ state, supportsActivation: false });
    await run(() => assert.fail('read-only write executed'), 'add');
    assert.equal(state.busy, false);
});

test('task cleanup runs when initialization or execution fails', async () => {
    const runtime = runtimeHarness();
    for (const phase of ['begin', 'execute']) {
        const calls = [];
        await runtime.runHubActionLifecycle({
            isBusy: () => false,
            begin() { calls.push('begin'); if (phase === 'begin') throw new Error('Initial render failed'); },
            execute() { calls.push('execute'); throw new Error('Request failed'); },
            fail(error) { calls.push(error.message); },
            finish() { calls.push('finish'); }
        });
        assert.equal(calls.at(-1), 'finish');
        assert.equal(calls.includes('execute'), phase === 'execute');
    }
});

test('an already running task does not reinitialize or finalize the active task', async () => {
    const runtime = runtimeHarness();
    const forbidden = () => assert.fail('second click changed the active task');
    await runtime.runHubActionLifecycle({ isBusy: () => true,
        begin: forbidden, execute: forbidden, fail: forbidden, finish: forbidden });
});
