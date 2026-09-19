const { registerWorkspacePersistenceTests } = require('../helpers/workspace-persistence.cjs');
const { createHarness, listing, jsonResponse } = require('./helpers/userscript-harness.cjs');
registerWorkspacePersistenceTests({ create: (options = {}) => createHarness(request => jsonResponse(options.shouldFail?.() ? {} : request.method === 'GET' ? listing() : { status: 'SUCCESS' }, options.shouldFail?.() ? 500 : 200), options),
    prepare: harness => harness.scanOffers(), choose: harness => { harness.state.accountConsent = true; },
    activate: harness => harness.addAllOffers(), secrets: ['synthetic-token', 'token=', 'checkSum'] });

const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrap } = require('./helpers/userscript-harness.cjs');
test('a changed Wells Fargo page token requires fresh account consent', async () => {
    const first = createHarness(); await first.scanOffers(); first.state.accountConsent = true; first.saveWorkspace();
    const next = createHarness(undefined, { storage: first.storage, scripts: [bootstrap('/deals-portal/as/activateCLDeal?token=new-session')] });
    next.restoreWorkspace(); await next.scanOffers();
    assert.equal(next.state.accountConsent, false);
    assert.equal(next.state.needsScan, false);
    const count = next.requests.length; await next.addAllOffers(); assert.equal(next.requests.length, count);
});
