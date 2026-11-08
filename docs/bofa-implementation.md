# BankAmeriDeals adapter — 2026-09-19

## Evidence and boundaries

User-provided local HAR identifies Bank of America Deals at `deals.merchant-rewards.com`. Captured requests include `/geo`, `/api/offers-page`, `/api/offers-details`, and three successful `PUT /api/activate-offer/:id` calls. Two ordinary CLICK activations have **no request body**, return `{ok:true}`, and are followed by detail responses with `is_activated:true`. The third is a LINK shopping activation using `OUTBOUND_LINK_CLICK`; this script deliberately excludes that workflow.

The HAR's own official JavaScript reads query `token` or localStorage `LS_TOKEN`, sets `X-Cardholder-Token`, and uses modern `/api` when `featureFlags.dxlEnabled` is true. The script supports that observed configuration only. Token claims are used to reject unsupported/expired sessions, never as proof of authorization; the server remains authoritative.

Complete pagination is derived from the captured official frontend implementation of `/api/offers-search`: `apply_filter`, `proximity_target`, `sort_by: merchant_name_asc`, `page_size:24`, and numeric `page_offset`. This HAR contains homepage `/offers-page` traffic, **not a live `/offers-search` response**. The expected search response `{offers,total,user_information_available}` comes from that frontend code. Strict count, duplicate, type and identity checks prevent partial/inconsistent scans from enabling writes.

Location is fetched from observed same-origin `/geo` on a manual scan, not hardcoded from the HAR. It may differ from a custom ZIP/location selected in the site's UI; this version scans using the service's default location. No browser location permission is requested.

## Implementation safeguards

- No startup requests; scan and explicit profile consent precede activation.
- Ordinary card-linked CLICK/OFFER_DETAILS_CLICK offers only; LINK, Upside and all unknown workflows excluded.
- Everything else is hidden, not listed as Skipped: the scan keeps only offers that can be added or are already added, and reports how many it hid. Saves from 1.8.1 and earlier are filtered on restore; cross-bank search and export drop them too. See below.
- Preflight detail eligibility and post-write detail readback for every activation; only explicit `{ok:true}` plus exact-ID `is_activated:true` counts as confirmed.
- Pagination: Deals recomputes `total` on every page (live: 841, 843, 840, 831, 843), so the scan pages until a short page and de-duplicates shifted IDs instead of failing on a changed total.
- Requests serial and spaced 0.5 seconds after complete body consumption; 429 Retry-After and max cooldown persisted. One offer's failure never stops the run: it is read back, re-sent once only if still eligible and not activated, then recorded; see [单个优惠失败后继续](offer-failure-continuation.md).
- Current session compared before every request; Web Locks prevents concurrent runs of this userscript across tabs. Does not coordinate the bank site's own requests or other scripts.
- Failed/unknown storage preserved and blocks requests. Pacing reservation protects reloads during an in-flight request.
- No sensitive captures committed; tests use synthetic fixtures and browser routes intercept all network calls.

## Hidden shopping links (live, 2026-11-08)

Deals mixes real card-linked offers with shopping links. Read-only observation of the site's own `offers-search` responses (168 offers, the site's default list, activated offers not included):

| Count | `type` | `activation_type` | `activation_required` | `activation_triggers` | Shown |
| --- | --- | --- | --- | --- | --- |
| 36 | CARD_LINKED | CLICK | true | OFFER_DETAILS_CLICK | yes |
| 52 | AFFILIATE | null | false | null | hidden |
| 10 | MERCHANT_FULFILLED | null / CLICK | false / true | null / OFFER_DETAILS_CLICK | hidden |
| 4 | CARD_LINKED | LINK | true | OUTBOUND_LINK_CLICK | hidden |
| 64 | CARD_LINKED | null | false | null | hidden |
| 2 | CARD_LINKED | VIEW | false | OFFER_TILE_VIEW / OFFER_PAGE_VIEW | hidden |

Only 36 of 168 could be added by this script; the other 132 used to fill the panel as Skipped. The filter is `isBofaOfferShown` in `core/offer-visibility.js`: eligible, already activated, or a record still marked Unconfirmed / Not added. Eligibility itself is unchanged (`normalizeOffer`).

## Pending live verification

A 1.8.2 scan on the real account showing only addable and added offers, with the hidden count matching the site; actual current-site `/offers-search` pagination, Tampermonkey session access and a user-initiated real activation remain unverified. Offline tests and HAR contract inspection do not establish live success. No captured request has been replayed against the account.

## Local verification

- `npm run build` and `npm run check`: passed.
- `npm test`: passed, including 19 BankAmeriDeals regressions.
- `node tests/bank-of-america/verify-har.cjs <local-har-path>`: passed; 4 list responses / 34 offer records, 6 details, 2 ordinary activations and 1 excluded shopping-link activation. Output contains counts only.
- `node tests/bank-of-america/browser-activation.cjs` with `PLAYWRIGHT_MODULE_PATH` configured: passed in Chromium using intercepted synthetic traffic. Covers manual-only start, consent, success readback, ambiguity, 429, stop, pacing and panel controls. Screenshot reviewed.
- Captured credential comparison against all BoA source/test/doc files and the generated script: zero matches. The HAR remains outside the repository.
