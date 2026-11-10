// Display order only; Add keeps the workflow's own order.
// value: most total cash back first, then highest rate. rate: highest rate first,
// then most total. bank: the bank's order. Unknown values sort after known ones
// and ties keep the bank's order (Array.prototype.sort is stable).
function hubCompareOfferRewards(sort) {
    const descending = (left, right) => left === right ? 0 : left === null ? 1 : right === null ? -1 : right - left;
    const keys = { value: [hubRewardTotal, hubRewardRate], rate: [hubRewardRate, hubRewardTotal] }[sort];
    if (!keys) return () => 0;
    return (left, right) => {
        for (const key of keys) {
            const order = descending(key(left), key(right));
            if (order) return order;
        }
        return 0;
    };
}
