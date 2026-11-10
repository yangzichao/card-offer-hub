// Cap and minimum spend written only in an offer's text, in the Cardlytics
// phrasing Wells Fargo and Deals use: "with a $7.00 cash back maximum",
// "until a $10.00 cash back maximum is reached", "when you spend $75".
// Only these explicit phrases count; anything else stays unknown.
function hubRewardLimitsFromText(...texts) {
    const text = texts.filter(value => typeof value === 'string').join(' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const dollars = match => match ? Number(match[1].replace(/,/g, '')) : null;
    return {
        maxReward: dollars(/\$(\d[\d,]*(?:\.\d{1,2})?) cash back maximum/i.exec(text)),
        minSpend: dollars(/\bspend (?:a minimum of )?\$(\d[\d,]*(?:\.\d{1,2})?)/i.exec(text))
    };
}
