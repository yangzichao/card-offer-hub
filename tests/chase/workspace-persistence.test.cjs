const { registerWorkspacePersistenceTests } = require('../helpers/workspace-persistence.cjs');
const { createHarness, jsonResponse, selectCards } = require('./helpers/userscript-harness.cjs');
const { listing } = require('./fixtures/offers-response.cjs');
registerWorkspacePersistenceTests({ create: (options = {}) => createHarness(request => jsonResponse(options.shouldFail?.() ? {} : listing(JSON.parse(request.headers['path-params']).primaryDigitalAccountIdentifierList[0]), options.shouldFail?.() ? 500 : 200), options),
    prepare: async harness => { await harness.detectCards(); selectCards(harness); await harness.scanOffers(); },
    activate: harness => harness.addAllOffers(), secrets: ['Cookie', 'Authorization', 'customerOfferSessionToken'] });
