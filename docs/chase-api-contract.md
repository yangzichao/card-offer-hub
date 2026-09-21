# Chase Offers scan and click activation contract

Current implementation: unified release 1.6.0. Evidence comes from local user-provided HAR files. No HAR, account identifiers, cookies, tokens or real-account fixtures are committed. Captured traffic is never replayed.

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

Parameters are retained only in the active page's normalized records. Workspace serialization continues to allow only existing display fields; no schema change or persisted token is introduced. Reloaded workspaces require a fresh scan before adding.

The capture's clicks include extra carousel display-position/category telemetry. The implementation sends the ten server-supplied event parameters, without inventing carousel positions for its own UI. This omission, `OFFERS_HUB_ALL` click context, and adding `SERVED` rows require live verification. The captured successful clicks are all `NEW`; `SERVED` is included only when it has the same validated CLICK contract and is not already activated.

Of 131 non-activated rows in the updated full list, 129 have internally consistent click credentials. Two `SERVED` rows have different impression tokens in the destination and the adjacent field. Those rows remain visible with an explanation to add on Chase and are excluded from the batch; they do not block other offers. Their tokens are not guessed or substituted.

## Manual activation and confirmation

The per-card workflow owns selection, deduplication and the immutable initial queue. Search affects display only. Both `NEW` and `SERVED` with verified click metadata are candidates; `ACTIVATED`, conflicting, unknown and unconfirmed records are not.

Each request uses the existing shared serial scheduler, response-to-next-request pacing, durable cooldown and Web Lock. Immediately before sending a click, the adapter rechecks selection, current customer identity and template authorization, then durably marks that offer `UNCONFIRMED`. Storage failure prevents the request.

An acknowledgement never counts as added. After each click, the script reads a complete same-card list and requires that exact offer ID to have `offerStatusName === ACTIVATED`. Only then does it replace the card's records and persist confirmation. Fresh list responses supply the next offer's current tokens. A summary count increase alone cannot settle an individual offer.

A missing target, unchanged status, malformed/partial response, changed login, network error, HTTP error, or stop halts the batch and requires an explicit scan. There is no automatic retry or click replay. A stop during the click leaves it unconfirmed; a stop during verification can retain a result already confirmed by that in-flight read. A reload retains pending records as unconfirmed.

## Session discovery and complete scans

At document start, passive fetch/XHR observers watch exact-origin `https://secure.chase.com` requests to:

```text
/svc/wr/profile/secure/gateway/ccb/marketing/offer-management/digital-customer-targeted-offers/v3/customer-offers
```

Installing the observer and clicking Detect cards send no requests. Native page traffic establishes the current customer, cards and allowlisted runtime request headers. Account/profile identifiers remain strings, including leading zeros. `shoppingEligibilityIndicator` does not determine Offers eligibility. On detection, new cards are selected by default and saved opt-outs are preserved.

Dashboard discovery accepts an empty `primaryDigitalAccountIdentifierList` only for the observed `OVERVIEW_DASHBOARD`, `CHASE_WEB`, `offer-count=12`, `NEW,ACTIVATED,SERVED` query without a category filter. Dashboard previews do not become scan results, even when `partial=false`.

Manual scans request exactly one selected card with the current enterprise identity in `path-params`, empty `offer-count`, `offerStatusNameList=NEW,ACTIVATED,SERVED`, `source-application-system-name=CHASE_WEB`, and `source-request-component-name=OFFERS_HUB_ALL`.

The response must match the current customer, contain exactly one group for the requested card, have `partial === false`, and return a row count equal to integer `totalAvailableOfferCount`. Category subsets are not complete lists. Contradictory duplicate statuses become `CONFLICT`. No guessed pagination is used.

## Verification boundary

`node tests/chase/verify-har.cjs /absolute/path/to/capture.har` validates local read contracts and correlates captured CLICK parameters with same-card summary increases. It prints only aggregate counts, never private values. It does not replay traffic or claim exact per-offer readback where the HAR has only summaries.

Synthetic unit and browser tests exercise the published all-bank artifact, cross-origin GET clicks, exact per-offer readback, both available statuses, same IDs on different cards, token rotation, storage-before-write, session changes, no retries, pacing, search-independent scope and restored uncertainty.

Pending live verification: installed Tampermonkey execution of 1.6.0; CORS and omitted carousel telemetry on current Chase; full-list readback propagation timing; current tokens across all selected cards; `SERVED` clicks and ALL context. The local implementation has not executed real account clicks. Earlier live evidence only established v1.3.1 discovery of four cards and the shopping-flag correction; offline tests do not establish current website operation.

### Local verification for 1.6.0

- `npm run build`: PASS; regenerated the single all-bank artifact.
- `npm run check`: PASS; syntax, manifest registration and generated output synchronized.
- `npm test`: PASS, 401 tests.
- `npm run test:browser`: PASS, all 16 browser scripts plus 12 Gherkin scenarios / 121 steps. All bank traffic was synthetic and intercepted.
- `node tests/chase/verify-har.cjs /Users/zichaoyang/Downloads/secure.chase.com.har`: PASS; 4 successful list reads, 1 complete list, 4 cards, 129 of 131 non-activated rows with consistent click metadata, 3 matched clicks and 3 subsequent same-card count increases. No traffic replayed.
- `git diff --check`: PASS. Source and generated artifact remain local until explicitly committed/pushed; installed Tampermonkey and real-site execution have not been verified.
