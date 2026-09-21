# Chase Offers read-only contract

This implementation was derived from the user's local HAR, inspected as data. No HAR, account identifiers, session headers, tokens, or real account fixtures are included in this repository. All tests use synthetic accounts and offers. Offline checks do not establish current logged-in Chase behavior.

## Evidence and scope

The capture contains ten `GET` requests to:

```text
/svc/wr/profile/secure/gateway/ccb/marketing/offer-management/digital-customer-targeted-offers/v3/customer-offers
```

It does **not** contain an activation/enrollment request or its response. Some requests carry `source-request-component-name=OFFERS_ACTIVATION`; they are category-filtered **GET** recommendations, not evidence of an activation write contract. The captured list states change across requests, but this cannot establish how the write was performed or what confirms success. This release therefore provides read-only discovery and selected-card scanning. It does not construct, guess, or issue any enrollment request.

## Native session observation

The userscript installs passive fetch/XHR observers at document start. Installing them sends no request and schedules no timer. Loading the native dashboard Offers preview, opening Chase Offers, or switching cards allows the observer to see a normal Chase request and its successful JSON response. If that has not happened, Detect cards explains how to prepare the page; it does not issue an account-discovery request.

Only exact-origin `https://secure.chase.com`, exact-path, GET requests are eligible. The request's `path-params` header contains:

```json
{
  "enterprisePartyIdentifier": "900001",
  "primaryDigitalAccountIdentifierList": ["100001"]
}
```

These are synthetic examples. The capture uses both numeric and string account identifiers. Code converts positive safe integers to strings and preserves digit-only string identifiers exactly, including leading zeros in enterprise identity. It rejects empty, all-zero, non-decimal, and unsafe numeric identifiers.

Observed request headers include `channel-identifier`, `channel-type`, `x-jpmc-channel`, `path-params`, and `x-jpmc-csrf-token`. Their runtime values come from the current page's own request, never constants copied from the HAR. The HAR does not establish a cookie or DOM source for the CSRF value, so the code does not guess one. Browser-managed cookies accompany subsequent same-origin GETs. The observer retains only a header allowlist in memory, drops tracing and all unrelated headers, and does not persist session material.

A captured response is accepted only if it supplies recognizable account records, a customerOffers group for the request account, and `primaryIndividualEnterprisePartyIdentifier` matching the request's enterprise identifier. Account discovery retains only identifier, nickname, classification, and last four. Offer impression tokens, customer offer session tokens, and full response bodies are not retained by the observer.

### Dashboard discovery correction (2026-09-19)

A newer local capture contains five successful reads: one dashboard preview, two complete carousel lists, and two category subsets. The dashboard request uses `primaryDigitalAccountIdentifierList: []`, with `source-request-component-name=OVERVIEW_DASHBOARD`, `source-application-system-name=CHASE_WEB`, `offer-count=12`, and `offerStatusNameList=NEW,ACTIVATED,SERVED`. Earlier code required exactly one requested card, discarding this valid discovery response before reading its card list.

Empty account lists are now accepted only for that observed dashboard query without a category filter. The response must match the requested enterprise identity, contain valid unique card records, and supply exactly one default-card group with an offers array and an identifier belonging to those records. That response establishes the default card and current session. It never selects cards, populates scan results, or sends another request. Unknown or ambiguous groups remain rejected; newer requests still supersede stale responses.

The dashboard preview reports `partial=false` even though its returned row count is below the total. This is discovery evidence only, not a complete scan. A manual scan continues to construct the explicit selected-card, unfiltered `OFFERS_HUB_ALL` request and enforce complete-list counts. The HAR verifier reports dashboard previews separately from full lists.

Synthetic regression coverage includes default-card discovery through fetch/XHR, manual selection and subsequent full scans, rejected foreign profiles/cards and ambiguous groups, stale responses, and no preview persistence. Real Tampermonkey execution on the current Chase site remains pending live verification.

Verification for Chase 1.3.1 / All Banks 1.2.1: `npm run build` PASS; `npm run check` PASS; `npm test` PASS (290 tests); `npm run test:browser` PASS (12 scripts, using the bundled Playwright runtime). `node tests/chase/verify-har.cjs /absolute/path/to/capture.har` PASS for the newer external capture (5 successful reads, 4 discovered cards). No captured traffic was replayed and no real account requests were sent.

## Account discovery

`digitalProfileAccounts` provides the cards exposed by the native response. Relevant fields are:

- `digitalAccountIdentifier`: request identity, normalized to a string.
- `accountNickname` and `accountProductClassificationName`: display label.
- `maskedAccountNumber`: only its final four digits are retained.
- `shoppingEligibilityIndicator`: not a card-linked Offers eligibility signal; neither false nor its absence blocks read-only scanning of a returned profile card.

Discovery does not opt cards in. Card selection is a separate explicit user action.

### Live discovery and shopping-flag correction (2026-09-20)

The logged-in dashboard still ran v1.3.0 until a reload loaded the published v1.3.1. Clicking Detect cards then discovered all four profile cards, verifying the document-start observer and dashboard discovery on this session. The published v1.3.1 artifact matched the local build byte for byte.

Three cards were incorrectly disabled by mapping `shoppingEligibilityIndicator` directly to card-linked Offers eligibility. The native Offers account selector exposed all four cards, and a card disabled by the script displayed a populated native Offers list. This directly disproves the old eligibility interpretation; the exact meaning of the shopping flag remains unverified.

Profile cards are now selectable for explicit read-only scans independently of that flag. The existing snapshot `eligible` field represents scan availability and is refreshed on Detect cards; existing selections remain opt-in. Older false values show a refresh instruction instead of an unsupported ineligibility claim. Identity validation, complete-list checks, no automatic requests/retries, and unavailable activation remain unchanged. Synthetic tests cover false/absent flags, legacy disabled cards, manual selection and browser scans. Live execution of this new correction is pending until the updated artifact is installed.

Local v1.3.2 validation: `npm run build` PASS; `npm run check` PASS; `npm test` PASS (268 tests). With `PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`, the initial `npm run test:browser` passed all 12 scripts. A later rebuild incorporating concurrent Citi/shared-UI edits passed build/check/unit tests, but the full browser suite failed in `tests/citi/browser-enrollment.cjs` waiting for its old `Detect cards` control. A focused rerun of `node tests/chase/browser-scanning.cjs` passed. Those unrelated edits were preserved. The browser security policy blocked extension-management access, so this session did not install the local correction or verify its full scan on Chase. No activation was performed and this change was not committed or pushed.

## Complete offer scan

Each explicitly selected card uses the observed full-list query:

```text
offer-count=
offerStatusNameList=NEW,ACTIVATED,SERVED
source-application-system-name=CHASE_WEB
source-request-component-name=OFFERS_HUB_ALL
```

The `path-params` header keeps the current session enterprise identity and substitutes only the selected card identifier. The script sends one request at a time with its conservative response-to-next-request delay. Failure requires a new manual scan; there is no automatic retry.

The response must contain exactly one `customerOffers` group for that card, an `offers` array, `partial === false`, and a nonnegative integer `totalAvailableOfferCount` equal to the returned full-list row count. In this capture, that total includes `ACTIVATED` rows; it is not the count of rows waiting to be added. No pagination cursor or follow-up page contract was observed. A partial or count-mismatched response is rejected rather than guessed complete.

Category requests using `offer-count=12` and `offerCategoryCodeList` return subsets even when `partial` is false. They must not be used as complete scans. The userscript constructs only the unfiltered ALL request for scans.

Each offer is identified by `offerIdentifier`. Raw statuses `NEW`, `SERVED`, and `ACTIVATED` remain distinct; only exactly `ACTIVATED` is displayed as already activated. Unknown statuses remain unknown. Contradictory duplicate statuses become `CONFLICT`, never a positive activation signal. Display text comes from `merchantDetails`, `offerDisplayDetails`, and `offerDetails`; category labels come from `offerCategories[].offerCategoryName`. Everything is rendered as text rather than inserted as HTML.

## Pending live verification

- The v1.3.2 shopping-flag correction in the installed Tampermonkey script (v1.3.1 dashboard discovery was verified on 2026-09-20).
- Native request headers and responses still following this observed contract.
- Session refresh, sign-out/sign-in, and native card switching behavior.
- Full-list completeness and eligibility for accounts beyond the supplied capture.
- Activation endpoint, request body, required current-session fields, and explicit success/identity confirmation: all unverified and intentionally unavailable in this release.

## Local contract verification

After building the bundle, run `node tests/chase/verify-har.cjs /absolute/path/to/capture.har`. This reads an external capture in memory through the built-script test harness and prints only aggregate counts. It performs no account requests and suppresses private values in failure output. Category subsets and explicit partial lists are distinguished from complete scans.
