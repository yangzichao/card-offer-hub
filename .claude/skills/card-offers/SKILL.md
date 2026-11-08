---
name: card-offers
description: Look up the user's saved credit card offers and Kroger coupons (Amex, Chase, Citi, BankAmeriDeals, US Bank, Wells Fargo, Kroger) from the local Card Offer Hub export, including full details and terms. Use when the user asks which card has an offer for a merchant, what an offer's terms are, what is available or already added, or anything about their saved card offers or coupons.
---

# Card offers from the local export

The Card Offer Hub userscript keeps saved offers in the browser. The user exports them with **Search all banks → Export all**, which downloads `card-offer-hub-offers-<timestamp>.json` (usually to `~/Downloads`). You read that file; you cannot scan banks or export yourself.

## How to look things up

Run from the card-offer-hub repository root (the folder that contains `scripts/offers/read-offer-export.cjs`):

```sh
node scripts/offers/read-offer-export.cjs --query "whole foods"           # newest export, markdown
node scripts/offers/read-offer-export.cjs --bank chase --status available  # one bank, one status
node scripts/offers/read-offer-export.cjs --query costco --format json     # structured output
node scripts/offers/read-offer-export.cjs --file /path/to/export.json       # a specific export
```

Options: `--dir`, `--query` (every word must match bank, card, merchant, summary, details, terms or category), `--bank` (id such as `amex-offer-lite`, or a name such as `Chase`), `--status` (`available`, `added`, `review`, `other`), `--format markdown|json`, `--no-details`, `--limit`.

## How to answer

- Lead with the answer: which card or account has the offer, the merchant, the reward, the key terms (minimum spend, cap, dates) and the status.
- Always state when the data is from: the export time and each offer's `scannedAt`. Status reflects that scan, not today. If the export is more than a few days old, or a bank shows `missing` / `error` coverage, say so and suggest scanning that bank and exporting again.
- `available` means "available when scanned", not "active now". `review` means the userscript could not confirm the result. Never claim an offer is added unless its status is `added`.
- `details` and `terms` are empty when that bank's list does not include them (for example, Citi), or when the bank has not been scanned since full text started being saved. Say they are unavailable rather than guessing terms.
- If no export is found, tell the user to open any bank page with the userscript, click **Search all banks**, then **Export all**.
- The export has card names and last four digits, merchant offers and terms. It has no account numbers, tokens or credentials. Keep it local; do not upload it or paste it to external services.
