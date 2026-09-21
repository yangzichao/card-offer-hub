// The bank owns its start/finish state and error presentation. Cleanup is guaranteed
// even if a request, confirmation, persistence operation, or initial render fails.
async function runHubActionLifecycle({ isBusy, begin, execute, fail, finish }) {
    if (isBusy()) return;
    try {
        begin();
        return await execute();
    } catch (error) {
        return fail(error);
    } finally {
        finish();
    }
}
