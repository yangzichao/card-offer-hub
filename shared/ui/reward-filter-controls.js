// "Hide under N% back / $N total" controls beside the offer search.
function hubRewardFilterMarkup() {
    return `<div class="hub-reward-filter" role="group" aria-label="Hide small offers"><span>Hide under</span>
        <label class="hub-reward-input"><input id="hub-min-rate" type="number" min="0" max="100" step="any" inputmode="decimal" placeholder="0" aria-label="Hide offers under this percent back"><span>% back</span></label>
        <label class="hub-reward-input"><span>$</span><input id="hub-min-total" type="number" min="0" step="any" inputmode="decimal" placeholder="0" aria-label="Hide offers under this total cash back in dollars"><span>total</span></label></div>
      <p id="hub-reward-note" class="muted hub-reward-note" aria-live="polite" hidden></p>`;
}
function hubBindRewardFilter(root, { state, store, render }) {
    const loaded = store.load();
    state.rewardFilter = loaded.filter;
    state.rewardFilterError = loaded.error;
    const rate = root.getElementById('hub-min-rate');
    const total = root.getElementById('hub-min-total');
    rate.value = state.rewardFilter.minRate || '';
    total.value = state.rewardFilter.minTotal || '';
    const update = () => {
        state.rewardFilter = hubNormalizeRewardFilter({ minRate: Number(rate.value), minTotal: Number(total.value) });
        state.rewardFilterError = store.save(state.rewardFilter);
        render();
    };
    rate.addEventListener('input', update);
    total.addEventListener('input', update);
}
// Returns the offers to show and reports how many the filter hid.
function hubApplyRewardFilter(root, offers, state, readReward = offer => offer.reward) {
    const shown = offers.filter(offer => hubRewardPassesFilter(readReward(offer), state.rewardFilter));
    const note = root?.getElementById('hub-reward-note');
    if (note) {
        const hidden = offers.length - shown.length;
        note.textContent = [hidden ? `${hidden} small ${hidden === 1 ? 'offer' : 'offers'} hidden and skipped by Add. Clear the filter to add them.` : '',
            state.rewardFilterError || ''].filter(Boolean).join(' ');
        note.hidden = !note.textContent;
    }
    return shown;
}
