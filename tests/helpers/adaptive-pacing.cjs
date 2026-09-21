const { runInNewContext } = require('node:vm');
const { readPublishedSharedRuntime } = require('./published-issuer-source.cjs');

function adaptiveHarness(options = {}) {
    let now = options.now ?? 1800000000000;
    const values = options.values || new Map();
    const writes = [];
    class TestDate extends Date { static now() { return now; } }
    const context = { Date: TestDate,
        setTimeout(callback, duration) { now += duration; queueMicrotask(callback); } };
    runInNewContext(readPublishedSharedRuntime() + `\nglobalThis.access = {
        hubPacingPolicy, hubLearnPacing, hubNewPacingProfile, hubReadPacingSnapshot,
        createHubPacingStorage, createHubRequestScheduler, createHubActionRunner,
        hubSafePacingEvent, hubPacingDebugSnapshot, createHubPacingDiagnostics
    };`, context);
    const state = { nextRequestAt: 0, cooldownUntil: 0, storageError: '' };
    const storageKey = options.key || 'synthetic-bank:pacing';
    const storage = { get: (key, fallback) => structuredClone(values.get(key) ?? fallback),
        set(key, value) {
            options.onWrite?.(key, value);
            if (options.failWrites) throw new Error('Synthetic write error');
            writes.push(structuredClone(value)); values.set(key, structuredClone(value));
        } };
    const controls = context.access.createHubPacingStorage({ state, storage, storageKey,
        policy: options.policy, readLegacyCooldown: options.readLegacyCooldown, version: '1.5.1' });
    const scheduler = context.access.createHubRequestScheduler({ state, pacing: controls.pacing,
        reservationMilliseconds: 45000, ensureRunning() {}, persist: controls.savePacing,
        checkStorage() { if (state.storageError) throw new Error(state.storageError); } });
    return { ...context.access, ...controls, scheduler, state, values, writes, storageKey,
        now: () => now, advance: duration => { now += duration; },
        snapshot: () => values.get(storageKey) };
}
function observe(harness, outcome = 'success', duration = 2000) {
    const ticket = harness.pacing.requestStarted();
    harness.advance(duration);
    harness.pacing.requestFinished(ticket, outcome);
}
module.exports = { adaptiveHarness, observe };
