// The cash value of one offer, normalized from each bank's own fields.
// kind 'percent': amount is the percent back. kind 'fixed': amount is dollars back.
// maxReward is the most the offer pays in total; minSpend is the purchase it
// needs. Anything the bank does not state stays null; nothing is guessed.
// A reward value can only make Add skip an offer (the small-offer filter); it never adds one.
function hubRewardNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
function hubRewardValue(kind, amount, { maxReward = null, minSpend = null } = {}) {
    amount = hubRewardNumber(amount);
    if (!['percent', 'fixed'].includes(kind) || amount === null || (kind === 'percent' && amount > 100)) return null;
    maxReward = hubRewardNumber(maxReward);
    minSpend = hubRewardNumber(minSpend);
    // A total below one fixed reward contradicts itself; keep the reward, drop the total.
    if (kind === 'fixed' && maxReward !== null && maxReward < amount) maxReward = null;
    return { kind, amount, maxReward, minSpend };
}
// Saved records were written by this code, but storage can be edited or damaged.
function hubSavedRewardValue(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved reward');
    const reward = hubRewardValue(value.kind, value.amount, value);
    if (!reward) throw new Error('Invalid saved reward');
    return reward;
}
// Percent back: stated for percent offers, reward ÷ minimum spend for fixed ones.
function hubRewardRate(reward) {
    if (!reward) return null;
    if (reward.kind === 'percent') return reward.amount;
    return reward.minSpend ? reward.amount / reward.minSpend * 100 : null;
}
// Most cash back in total: a fixed reward (or its stated total), or a percent offer's cap.
function hubRewardTotal(reward) {
    if (!reward) return null;
    return reward.kind === 'fixed' ? reward.maxReward ?? reward.amount : reward.maxReward;
}
function hubFormatRewardDollars(value) {
    return '$' + (Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(2));
}
function hubFormatRewardPercent(value) {
    return `${Math.round(value * 100) / 100}%`;
}
function hubFormatReward(reward) {
    if (!reward) return '';
    const parts = [];
    if (reward.kind === 'percent') {
        parts.push(`${hubFormatRewardPercent(reward.amount)} back`,
            reward.maxReward ? `up to ${hubFormatRewardDollars(reward.maxReward)}` : 'no cap listed');
        if (reward.minSpend) parts.push(`min spend ${hubFormatRewardDollars(reward.minSpend)}`);
    } else {
        const each = reward.maxReward !== null && reward.maxReward > reward.amount;
        parts.push(`${hubFormatRewardDollars(reward.amount)} back${each ? ' each' : ''}`
            + (reward.minSpend ? ` on ${hubFormatRewardDollars(reward.minSpend)} (${hubFormatRewardPercent(hubRewardRate(reward))})` : ''));
        if (each) parts.push(`up to ${hubFormatRewardDollars(reward.maxReward)} total`);
    }
    return parts.join(' · ');
}
