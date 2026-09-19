# Chase Offers read-only contract

This implementation was derived from the user's local HAR, inspected as data. No HAR, account identifiers, session headers, tokens, or real account fixtures are included in this repository. All tests use synthetic accounts and offers. Offline checks do not establish current logged-in Chase behavior.

## Evidence and scope

The capture contains ten `GET` requests to:

```text
/svc/wr/profile/secure/gateway/ccb/marketing/offer-management/digital-customer-targeted-offers/v3/customer-offers
```

It does **not** contain an activation/enrollment request or its response. Some requests carry `source-request-component-name=OFFERS_ACTIVATION`; they are category-filtered **GET** recommendations, not evidence of an activation write contract. The captured list states change across requests, but this cannot establish how the write was performed or what confirms success. This release therefore provides read-only discovery and selected-card scanning. It does not construct, guess, or issue any enrollment request.

## Native session observation

The userscript installs passive fetch/XHR observers at document start. Installing them sends no request and schedules no timer. The user opens Chase Offers or switches cards in the native site, allowing the observer to see a normal Chase request and its successful JSON response. If that has not happened, Detect cards explains how to prepare the page; it does not issue an account-discovery request.

Only exact-origin `https://secure.chase.com`, exact-path, GET requests are eligible. The request's `path-params` header contains:

```json
{
  "enterprisePartyIdentifier": "900001",
  "primaryDigitalAccountIdentifierList": ["100001"]
}
```

These are synthetic examples. The capture uses both numeric and string account identifiers. Code converts positive safe integers to strings and preserves digit-only string identifiers exactly, including leading zeros in enterprise identity. It rejects empty, all-zero, non-decimal, and unsafe numeric identifiers.

Observed request headers include `channel-identifier`, `channel-type`, `x-jpmc-channel`, `path-params`, and `x-jpmc-csrf-token`. Their runtime values come from the current page's own request, never constants copied from the HAR. The HAR does not establish a cookie or DOM source for the CSRF value, so the code does not guess one. Browser-managed cookies accompany subsequent same-origin GETs. The observer retains only a header allowlist in memory, drops tracing and all unrelated headers, and does not persist session material.

A captured response is accepted only if it supplies recognizable account records, a customerOffers group for the request account, and `primaryIndividualEnterprisePartyIdentifier` matching the request's enterprise identifier. Account discovery retains only identifier, nickname, classification, last four, and explicit shopping eligibility. Offer impression tokens, customer offer session tokens, and full response bodies are not retained by the observer.

## Account discovery

`digitalProfileAccounts` provides the cards exposed by the native response. Relevant fields are:

- `digitalAccountIdentifier`: request identity, normalized to a string.
- `accountNickname` and `accountProductClassificationName`: display label.
- `maskedAccountNumber`: only its final four digits are retained.
- `shoppingEligibilityIndicator`: required boolean, used to determine eligible cards.

Discovery does not opt cards in. Card selection is a separate explicit user action.

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

- Tampermonkey document-start access to the page's fetch/XHR in the currently deployed Chase dashboard.
- Native request headers and responses still following this observed contract.
- Session refresh, sign-out/sign-in, and native card switching behavior.
- Full-list completeness and eligibility for accounts beyond the supplied capture.
- Activation endpoint, request body, required current-session fields, and explicit success/identity confirmation: all unverified and intentionally unavailable in this release.

## Local contract verification

After building the bundle, run `node tests/chase/verify-har.cjs /absolute/path/to/capture.har`. This reads an external capture in memory through the built-script test harness and prints only aggregate counts. It performs no account requests and suppresses private values in failure output. Category subsets and explicit partial lists are distinguished from complete scans.
