const HUB_PACING_LOG_LIMIT = 200;
const HUB_PACING_EVENT_KINDS = ['request-start', 'request-end', 'rate-limited', 'pacing-read-failed', 'pacing-save-failed'];
const HUB_PACING_EVENT_NUMBERS = ['at', 'startedAt', 'previousCompletedAt', 'durationMs', 'gapBeforeMs',
    'gapAfterMs', 'successCount', 'observedActiveMs', 'cooldownUntil', 'serverWaitMs'];

// An allowlist at both capture and export: never serialize bank state or errors wholesale.
function hubSafePacingEvent(event) {
    if (!event || !HUB_PACING_EVENT_KINDS.includes(event.kind)) return null;
    const result = { kind: event.kind };
    for (const key of HUB_PACING_EVENT_NUMBERS) {
        if (Number.isSafeInteger(event[key]) && event[key] >= 0) result[key] = event[key];
    }
    if (['success', 'failure', 'neutral', 'limited'].includes(event.outcome)) result.outcome = event.outcome;
    if (typeof event.version === 'string' && /^\d+\.\d+\.\d+$/.test(event.version)) result.version = event.version;
    if (Number.isInteger(event.httpStatus) && event.httpStatus >= 100 && event.httpStatus <= 599) result.httpStatus = event.httpStatus;
    return result;
}
function hubPacingDebugSnapshot(state) {
    const diagnostics = state.pacingDiagnostics;
    const profile = {};
    for (const key of [...Object.keys(hubNewPacingProfile(HUB_PACING_POLICY)), 'nextRequestAt', 'cooldownUntil']) {
        const value = key in state.pacing ? state.pacing[key] : state[key];
        if (value === null || (Number.isSafeInteger(value) && value >= 0)) profile[key] = value;
    }
    return { schemaVersion: 1, exportedAt: Date.now(), issuer: diagnostics.issuer, version: diagnostics.version,
        profile, requestInFlight: Boolean(state.requestInFlight), pacingStorageFailed: Boolean(state.storageError),
        logStorageFailed: Boolean(diagnostics.storageError),
        events: diagnostics.events.slice(-HUB_PACING_LOG_LIMIT).map(hubSafePacingEvent).filter(Boolean) };
}
