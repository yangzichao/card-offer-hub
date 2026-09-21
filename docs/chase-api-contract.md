# Chase Offers scan and click activation contract

Current implementation: unified release 1.6.2. Evidence comes from local user-provided HAR files. No HAR, account identifiers, cookies, tokens or real-account fixtures are committed. Captured traffic is never replayed.

## Click activation evidence (2026-09-21)

The updated capture has 155 requests. One complete list contains 134 offers, including 3 already activated. Three previously `NEW` offers then receive browser GET requests at:

```text
https://reco.chase.com/events/recoengine/public/recommendation/ccb/sales-relationship/crm/personalization-recommendation-interactions/v2/customer-interaction
```

Each uses `recommendation-event-type-code=CLICK`, `request-context=MERCHANT_OFFERS`, and `source-application-system-name=CHASE_WEB`. All three match the preceding list's customer, card, offer, recommendation, impression token and offer-session token. After each click, the same customer's same-card summary returns activated counts 4, 5, and 6. This supports the user's observed behavior: opening the offer adds it.

The click responses are HTTP 200 with empty bodies. The CORS response allows `https://secure.chase.com`. The observed requests have no Cookie or bank CSRF headers. The implementation uses browser fetch with `mode: cors`, `credentials: omit`, `redirect: error`, `cache: no-store` and the fixed endpoint. It does not forward the bank's session headers to the click endpoint.

Earlier analysis focused on the customer-offers endpoint and POST requests and missed this GET side effect. A GET method is not evidence that an endpoint is read-only. The `OFFERS_ACTIVATION` category-list GET remains a recommendation read; it is separate from the state-changing CLICK request.

## Runtime activation credentials

Each list row supplies `digitalInteractionDestUrlText`, `recommendationIdentifier`, and `offerImpressionTokenIdentifier`. Its account group supplies `customerOfferSessionTokenIdentifier`. The relative destination must use the exact observed source path:

```text
/ccb/sales-relationship/crm/personalization-recommendation-events/v2/events
```

Exactly ten event parameters are validated: customer, card, offer, recommendation, impression token, session token, CLICK event, CHASE_WEB application, MERCHANT_OFFERS context, and a known Offers component (`OFFERS_HUB_ALL` or `OFFERS_HUB_CAROUSELS`). Duplicate/unknown parameters, foreign identities, mismatched tokens, arbitrary destination URLs and unknown components are rejected. The source path is mapped to the fixed observed reco.chase.com endpoint; the script never follows a server-provided arbitrary URL.

Parameters are retained only in the active page's normalized records. Workspace serialization continues to allow only existing display fields; no schema change or persisted token is introduced. After reload, Add saved offers obtains fresh credentials inside the explicit action, without requiring a separate scan click. It reconciles only previously saved offers and never imports newly discovered offers into that action, including during per-offer verification.

The capture's clicks include extra carousel display-position/category telemetry. The implementation sends the ten server-supplied event parameters, without inventing carousel positions for its own UI. This omission, `OFFERS_HUB_ALL` click context, and adding `SERVED` rows require live verification. The captured successful clicks are all `NEW`; `SERVED` is included only when it has the same validated CLICK contract and is not already activated.

Of 131 non-activated rows in the updated full list, 129 have internally consistent click credentials. Two `SERVED` rows have different impression tokens in the destination and the adjacent field. Those rows remain visible with an explanation to add on Chase and are excluded from the batch; they do not block other offers. Their tokens are not guessed or substituted.

## Manual activation and confirmation

The per-card workflow owns selection, deduplication and the immutable initial queue. Search affects display only. Both `NEW` and `SERVED` with verified click metadata are candidates; `ACTIVATED`, conflicting, unknown and unconfirmed records are not.

Each request uses the existing shared serial scheduler, response-to-next-request pacing, durable cooldown and Web Lock. Immediately before sending a click, the adapter rechecks selection, current customer identity and template authorization, then durably marks that offer `UNCONFIRMED`. Storage failure prevents the request.

An acknowledgement never counts as added. After each click, the script reads a complete same-card list and requires that exact offer ID to have `offerStatusName === ACTIVATED`. Only then does it replace the card's records and persist confirmation. Fresh list responses supply the next offer's current tokens. A summary count increase alone cannot settle an individual offer.

A missing target, unchanged status, malformed/partial response, changed login, network error, HTTP error, or stop halts the batch. A subsequent explicit Add saved offers action verifies current state, skips prior uncertainty and continues other saved offers; Refresh & add offers explicitly reloads all current offers. There is no automatic retry or click replay. A stop during the click leaves it unconfirmed; a stop during verification can retain a result already confirmed by that in-flight read. A reload retains pending records as unconfirmed.

## Session discovery and complete scans

At document start, passive fetch/XHR observers watch exact-origin `https://secure.chase.com` requests to:

```text
/svc/wr/profile/secure/gateway/ccb/marketing/offer-management/digital-customer-targeted-offers/v3/customer-offers
```

Installing the observer sends no requests. The initial Load cards & offers action combines discovery with reading complete lists for every current card; it does not activate offers. Native page traffic establishes the current customer, cards and allowlisted runtime request headers. Account/profile identifiers remain strings, including leading zeros. `shoppingEligibilityIndicator` does not determine Offers eligibility. New cards are selected by default and saved opt-outs are preserved. Refresh & add offers reads every current card, including deselected cards, before adding only to selected cards. A changed customer loads new cards but stops before activation for selection review. Failed or stopped multi-card refreshes preserve the previous complete workspace.

Dashboard discovery accepts an empty `primaryDigitalAccountIdentifierList` only for the observed `OVERVIEW_DASHBOARD`, `CHASE_WEB`, `offer-count=12`, `NEW,ACTIVATED,SERVED` query without a category filter. Dashboard previews do not become scan results, even when `partial=false`.

Each list request addresses exactly one card in the selected-card scope or the bounded, explicit all-card refresh scope with the current enterprise identity in `path-params`, empty `offer-count`, `offerStatusNameList=NEW,ACTIVATED,SERVED`, `source-application-system-name=CHASE_WEB`, and `source-request-component-name=OFFERS_HUB_ALL`.

The response must match the current customer, contain exactly one group for the requested card, have `partial === false`, and return a row count equal to integer `totalAvailableOfferCount`. Category subsets are not complete lists. Contradictory duplicate statuses become `CONFLICT`. No guessed pagination is used.

## Verification boundary

`node tests/chase/verify-har.cjs /absolute/path/to/capture.har` validates local read contracts and correlates captured CLICK parameters with same-card summary increases. It prints only aggregate counts, never private values. It does not replay traffic or claim exact per-offer readback where the HAR has only summaries.

Synthetic unit and browser tests exercise the published all-bank artifact, cross-origin GET clicks, exact per-offer readback, both available statuses, same IDs on different cards, token rotation, storage-before-write, session changes, no retries, pacing, search-independent scope and restored uncertainty.

The user reported on 2026-09-21 that Chase activation works. This confirms their observed result, not every edge case. The 1.6.2 UX change was tested offline only. Pending live verification: the combined load/refresh and restored-continuation experience; full-list readback propagation timing; tokens across all selected cards; `SERVED` clicks and ALL context. This UX implementation session did not execute real account clicks.

### Local verification for 1.6.0

- `npm run build`: PASS; regenerated the single all-bank artifact.
- `npm run check`: PASS; syntax, manifest registration and generated output synchronized.
- `npm test`: PASS, 401 tests.
- `npm run test:browser`: PASS, all 16 browser scripts plus 12 Gherkin scenarios / 121 steps. All bank traffic was synthetic and intercepted.
- `node tests/chase/verify-har.cjs /Users/zichaoyang/Downloads/secure.chase.com.har`: PASS; 4 successful list reads, 1 complete list, 4 cards, 129 of 131 non-activated rows with consistent click metadata, 3 matched clicks and 3 subsequent same-card count increases. No traffic replayed.
- `git diff --check`: PASS. The 1.6.0 source and generated artifact were subsequently pushed in commit `5582610`. Installed-version updates were not performed by the agent; the user later reported successful Chase activation.

### Saved continuation UX in 1.6.2

The public panel now uses Load cards & offers, Add saved offers, and Refresh & add offers, matching Citi's action layout. Stop and a prior request failure do not permanently disable saved continuation. The saved action checks the current login and reads only selected cards, then adds only previously saved eligible IDs. Fresh ACTIVATED rows resolve pending uncertainty; still-unconfirmed rows are retained and skipped. Both desktop and narrow layouts are covered by synthetic browser tests.

Local verification for 1.6.2:

- `npm run build`: PASS; regenerated unified 1.6.2.
- `npm run check`: PASS; syntax and published output synchronized.
- `npm test`: PASS, 414 tests.
- `npm run test:browser`: PASS, all 16 browser scripts plus 15 Gherkin scenarios / 155 steps; synthetic traffic only.
- Desktop and 390px Chase screenshots inspected; action labels, selections and results fit the panel.
- `git diff --check`: PASS.
