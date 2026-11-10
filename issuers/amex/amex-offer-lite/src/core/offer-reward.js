// Amex sends no numeric reward, only shortDescription text. Three phrasings are
// read; anything else (points offers, bundles, wording changes) stays unknown:
//   "Spend $100 or more, earn $20 back[, up to 3 times (total of $60)]"
//   "Earn 10% back on ..., up to [a total of] $250 ..."
//   "Earn 10% back on ..."
// Add skips an offer the small-offer filter hides; a parsed reward never adds one.
function amexRewardDollars(text) {
    return Number(text.replace(/,/g, ''));
}
function amexOfferReward(description) {
    const text = typeof description === 'string' ? description.replace(/\s+/g, ' ').trim() : '';
    const money = '\\$(\\d[\\d,]*(?:\\.\\d{1,2})?)';
    const spend = new RegExp(`^Spend ${money} or more[^,]*, earn ${money} back(?:, up to (\\d+) times(?: \\(total of ${money}\\))?)?`, 'i').exec(text);
    if (spend) {
        const amount = amexRewardDollars(spend[2]);
        return hubRewardValue('fixed', amount, {
            minSpend: amexRewardDollars(spend[1]),
            maxReward: spend[4] ? amexRewardDollars(spend[4]) : spend[3] ? amount * Number(spend[3]) : null
        });
    }
    const capped = new RegExp(`^Earn (\\d+(?:\\.\\d+)?)% back\\b[^.]*?\\bup to (?:a total of )?${money}`, 'i').exec(text);
    if (capped) return hubRewardValue('percent', Number(capped[1]), { maxReward: amexRewardDollars(capped[2]) });
    const percent = /^Earn (\d+(?:\.\d+)?)% back\b/i.exec(text);
    return percent ? hubRewardValue('percent', Number(percent[1])) : null;
}
