// Amex sends no numeric reward, only shortDescription text. These phrasings are
// read; anything else (points offers, bundles, wording changes) stays unknown:
//   "Spend $100 or more, earn $20 back[, up to 3 times (total of $60)]"
//   "Spend $1,000 or more, earn $200"  /  "Spend $98 on Example, earn $49 back"
//   "Spend $150 or more, earn 20% back[, up to a total of $50]"
//   "Earn 10% back on ..., up to [a total of] $250 ..."
//   "Earn 10% back on ..."
// A capture of 279 real descriptions (2025) had 261 in these forms; the rest were
// points, travel benefits and promotions. Add skips an offer the small-offer
// filter hides; a parsed reward never adds one.
function amexRewardDollars(text) {
    return Number(text.replace(/,/g, ''));
}
function amexOfferReward(description) {
    const text = typeof description === 'string' ? description.replace(/\s+/g, ' ').trim() : '';
    const money = '\\$(\\d[\\d,]*(?:\\.\\d{1,2})?)';
    const spend = new RegExp(`^Spend ${money}[^,]*, earn ${money}(?: back\\b|(?=$|[.,]))(?:,? up to (\\d+) times(?: \\(total of ${money}\\))?)?`, 'i').exec(text);
    if (spend) {
        const amount = amexRewardDollars(spend[2]);
        return hubRewardValue('fixed', amount, {
            minSpend: amexRewardDollars(spend[1]),
            maxReward: spend[4] ? amexRewardDollars(spend[4]) : spend[3] ? amount * Number(spend[3]) : null
        });
    }
    const spendPercent = new RegExp(`^Spend ${money}[^,]*, earn (\\d+(?:\\.\\d+)?)% back\\b(?:[^.]*?\\bup to (?:a total of )?${money})?`, 'i').exec(text);
    if (spendPercent) {
        return hubRewardValue('percent', Number(spendPercent[2]), { minSpend: amexRewardDollars(spendPercent[1]),
            maxReward: spendPercent[3] ? amexRewardDollars(spendPercent[3]) : null });
    }
    const capped = new RegExp(`^Earn (\\d+(?:\\.\\d+)?)% back\\b[^.]*?\\bup to (?:a total of )?${money}`, 'i').exec(text);
    if (capped) return hubRewardValue('percent', Number(capped[1]), { maxReward: amexRewardDollars(capped[2]) });
    const percent = /^Earn (\d+(?:\.\d+)?)% back\b/i.exec(text);
    return percent ? hubRewardValue('percent', Number(percent[1])) : null;
}
