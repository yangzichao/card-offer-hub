const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adaptiveHarness, observe } = require('../helpers/adaptive-pacing.cjs');

test('adaptive controllers start passively and learn independently for each bank', () => {
    const values = new Map();
    const citi = adaptiveHarness({ values, key: 'citi:pacing' });
    const amex = adaptiveHarness({ values, key: 'amex:pacing', policy: { defaultCooldownMs: 120000 } });
    assert.equal(values.size, 0);
    assert.equal(citi.state.pacing.currentGapMs, 1000);
    citi.pacing.rateLimited('1'); citi.savePacing();
    assert.equal(citi.state.pacing.currentGapMs, 2000);
    assert.equal(amex.state.pacing.currentGapMs, 1000);
    assert.equal(amex.state.cooldownUntil, 0);
    assert.equal(amex.pacing.policy.defaultCooldownMs, 120000);
});

test('a stable window needs both enough validated successes and enough active time', () => {
    const fast = adaptiveHarness();
    for (let index = 0; index < 30; index++) observe(fast, 'success', 1);
    assert.equal(fast.state.pacing.currentGapMs, 1000);
    const slow = adaptiveHarness();
    for (let index = 0; index < 29; index++) observe(slow, 'success', 3000);
    assert.equal(slow.state.pacing.currentGapMs, 1000);
    observe(slow, 'success', 3000);
    assert.equal(slow.state.pacing.currentGapMs, 950);
    assert.equal(slow.state.pacing.lastStableGapMs, 1000);
    assert.equal(slow.state.pacing.successCount, 0);
    assert.equal(slow.state.pacing.observedActiveMs, 0);
    observe(slow);
    assert.equal(slow.state.pacing.currentGapMs, 950, 'a new window is required before another speed increase');
});

test('idle time and long background timer delays do not become stable running time', () => {
    const harness = adaptiveHarness();
    for (let index = 0; index < 40; index++) {
        harness.advance(86400000);
        harness.pacing.startRun();
        observe(harness, 'success', 0);
    }
    assert.equal(harness.state.pacing.observedActiveMs, 0);
    assert.equal(harness.state.pacing.currentGapMs, 1000);
    harness.advance(86400000);
    observe(harness, 'success', 0);
    assert.equal(harness.state.pacing.observedActiveMs, 1000, 'only one actual pacing interval can be credited');
});

test('normal request duration plus serial waiting counts, and improvement stops at the floor', () => {
    const harness = adaptiveHarness();
    for (let window = 0; window < 15; window++) {
        for (let index = 0; index < 30; index++) observe(harness);
    }
    assert.equal(harness.state.pacing.currentGapMs, 500);
    assert.equal(harness.state.pacing.lastStableGapMs, 500);
});

test('HTTP failures, invalid results, and unconfirmed writes clear evidence without inventing a rate limit', () => {
    const harness = adaptiveHarness();
    for (let index = 0; index < 29; index++) observe(harness);
    observe(harness, 'failure');
    assert.equal(harness.state.pacing.currentGapMs, 1000);
    assert.equal(harness.state.pacing.successCount, 0);
    assert.equal(harness.state.pacing.consecutiveLimits, 0);
    assert.equal(harness.state.cooldownUntil, 0);
    observe(harness, 'neutral');
    assert.equal(harness.state.pacing.successCount, 0, 'an acknowledgement is not confirmed success');
});

test('explicit rate limits double the gap and persist a server or client cooldown, whichever is longer', () => {
    const harness = adaptiveHarness();
    harness.state.cooldownUntil = harness.now() + 900000;
    harness.pacing.rateLimited('1');
    assert.equal(harness.state.pacing.currentGapMs, 2000);
    assert.equal(harness.state.cooldownUntil, harness.now() + 900000);
    assert.equal(harness.savePacing(), true);
    const reloaded = adaptiveHarness({ values: harness.values }); reloaded.restorePacing();
    assert.equal(reloaded.state.pacing.currentGapMs, 2000);
    assert.equal(reloaded.state.cooldownUntil, harness.state.cooldownUntil);
    assert.equal(reloaded.writes.length, 0);
});

test('Retry-After dates, seconds, malformed values and repeated limits keep bounded client backoff', () => {
    for (const header of ['86400', new Date(1800000000000 + 86400000).toUTCString()]) {
        const harness = adaptiveHarness(); harness.pacing.rateLimited(header);
        assert.equal(harness.state.cooldownUntil, harness.now() + 86400000, 'server deadlines have no client cap');
    }
    const harness = adaptiveHarness();
    for (let index = 0; index < 12; index++) harness.pacing.rateLimited('invalid');
    assert.equal(harness.state.pacing.currentGapMs, 15000);
    assert.equal(harness.state.cooldownUntil, harness.now() + 3600000);
    assert.equal(harness.state.pacing.consecutiveLimits, 12);
});

test('recovery waits for the hold period and a new stable window before accelerating', () => {
    const harness = adaptiveHarness(); harness.pacing.rateLimited(null);
    harness.advance(300000); harness.pacing.startRun();
    for (let index = 0; index < 30; index++) observe(harness);
    assert.equal(harness.state.pacing.currentGapMs, 2000);
    assert.equal(harness.state.pacing.consecutiveLimits, 1);
    harness.advance(300000); harness.pacing.startRun();
    for (let index = 0; index < 30; index++) observe(harness);
    assert.equal(harness.state.pacing.currentGapMs, 1950);
    assert.equal(harness.state.pacing.consecutiveLimits, 0);
});

test('fractional or very large server delays still produce readable integer snapshots', () => {
    for (const header of ['100000.0001', '99999999999999999999']) {
        const harness = adaptiveHarness(); harness.pacing.rateLimited(header); harness.savePacing();
        assert.ok(Number.isSafeInteger(harness.state.cooldownUntil));
        const next = adaptiveHarness({ values: harness.values }); next.restorePacing();
        assert.equal(next.state.storageError, '');
        assert.equal(next.state.cooldownUntil, harness.state.cooldownUntil);
    }
});

test('legacy deadlines migrate without writes, fabricated successful samples, or lost waits', () => {
    const harness = adaptiveHarness();
    const old = { schemaVersion: 1, nextRequestAt: harness.now() + 10000, cooldownUntil: harness.now() + 300000 };
    harness.values.set(harness.storageKey, old);
    harness.restorePacing();
    assert.deepEqual(harness.snapshot(), old);
    assert.equal(harness.state.pacing.successCount, 0);
    assert.equal(harness.state.pacing.lastStableGapMs, null);
    assert.equal(harness.savePacing(), true);
    assert.equal(harness.snapshot().schemaVersion, 2);
    assert.equal(harness.snapshot().nextRequestAt, old.nextRequestAt);
    assert.equal(harness.snapshot().cooldownUntil, old.cooldownUntil);
});

test('Amex legacy cooldown is read only until an explicit save, then GM storage owns it', () => {
    let reads = 0;
    const harness = adaptiveHarness({ readLegacyCooldown() { reads++; return 1800000600000; } });
    harness.restorePacing();
    assert.equal(harness.state.cooldownUntil, 1800000600000);
    assert.equal(harness.values.size, 0);
    harness.savePacing();
    const next = adaptiveHarness({ values: harness.values, readLegacyCooldown() { throw new Error('website storage unavailable'); } });
    next.restorePacing();
    assert.equal(next.state.storageError, '');
    assert.equal(next.state.cooldownUntil, 1800000600000);
    assert.equal(reads, 1);
});

test('stale fast profiles return conservatively, stale slow profiles stay slow, and cooldowns remain', () => {
    for (const gap of [500, 2000]) {
        const previous = adaptiveHarness();
        previous.state.pacing.currentGapMs = gap;
        previous.state.pacing.lastStableGapMs = gap;
        previous.state.pacing.successCount = 29;
        previous.state.pacing.updatedAt = previous.now();
        previous.state.cooldownUntil = previous.now() + 20 * 86400000;
        previous.savePacing();
        const next = adaptiveHarness({ values: previous.values, now: previous.now() + 8 * 86400000 }); next.restorePacing();
        assert.equal(next.state.pacing.currentGapMs, Math.max(1000, gap));
        assert.equal(next.state.pacing.successCount, 0);
        assert.equal(next.state.pacing.lastStableGapMs, null);
        assert.equal(next.state.cooldownUntil, previous.state.cooldownUntil);
    }
});

test('future schemas, unknown policies, and malformed learned values are preserved and block writes', () => {
    const baseline = adaptiveHarness(); baseline.savePacing();
    for (const patch of [{ schemaVersion: 99 }, { policyVersion: 99 }, { currentGapMs: 0 },
        { lastStableGapMs: '1000' }, { successCount: -1 }, { nextRequestAt: Infinity }, { updatedAt: NaN }]) {
        const harness = adaptiveHarness();
        const corrupt = { ...baseline.snapshot(), ...patch };
        harness.values.set(harness.storageKey, corrupt); harness.restorePacing();
        assert.match(harness.state.storageError, /Cannot read/);
        assert.equal(harness.savePacing(), false);
        assert.deepEqual(harness.snapshot(), corrupt);
    }
});

test('an older tab cannot overwrite another tab retreat; a fresh restore picks up the learned gap', () => {
    const first = adaptiveHarness(); first.savePacing();
    const second = adaptiveHarness({ values: first.values }); second.restorePacing();
    first.pacing.rateLimited('600'); first.savePacing();
    const latest = structuredClone(first.snapshot());
    assert.equal(second.savePacing(), false);
    assert.deepEqual(first.snapshot(), latest);
    const third = adaptiveHarness({ values: first.values }); third.restorePacing();
    assert.equal(third.state.pacing.currentGapMs, 2000);
    assert.equal(third.state.cooldownUntil, first.state.cooldownUntil);
});

test('the scheduler applies the learned gap after body completion and counts it without overlap', async () => {
    const harness = adaptiveHarness(); harness.state.pacing.currentGapMs = 2300;
    await harness.scheduler.withRequestSlot(observe => { harness.advance(4000); observe('success'); });
    const completedAt = harness.now();
    await harness.scheduler.withRequestSlot(observe => {
        assert.equal(harness.now() - completedAt, 2300);
        harness.advance(7000); observe('success');
    });
    assert.equal(harness.state.pacing.observedActiveMs, 13300);
    assert.equal(harness.snapshot().currentGapMs, 2300);
    assert.equal(harness.state.requestInFlight, false);
});

test('storage failure prevents sending and a restored cooling profile schedules no retry', async () => {
    const failed = adaptiveHarness({ failWrites: true });
    await assert.rejects(failed.scheduler.withRequestSlot(() => assert.fail('must not send')), /Cannot save/);
    assert.equal(failed.state.requestInFlight, false);
    const limited = adaptiveHarness(); limited.pacing.rateLimited('600'); limited.savePacing();
    const next = adaptiveHarness({ values: limited.values }); next.restorePacing();
    const now = next.now();
    await assert.rejects(next.scheduler.withRequestSlot(() => assert.fail('must not retry')), /Rate limited/);
    assert.equal(next.now(), now, 'cooldown does not start a background wait/retry');
});
