const PANEL_STYLES = HUB_DESIGN_STYLES + `
.card.drop-target{background:var(--hub-tint);outline:2px dashed var(--hub-accent);outline-offset:-2px}
.drag-handle{cursor:grab;color:var(--hub-muted);line-height:1.5;padding:0 2px;border-radius:4px;user-select:none}.drag-handle:hover{color:var(--hub-ink);background:var(--hub-line)}
.card-rank{flex:none;min-width:14px;color:var(--hub-muted);font-size:11px;line-height:1.8;font-variant-numeric:tabular-nums;text-align:right}
.card-info>div:first-child{font-weight:550}.card-info>div+div{font-size:11.5px}
.card-move{display:flex;gap:2px}.card-move button.move{width:26px;height:26px;min-height:26px;padding:0;font-size:12px;border-color:transparent;background:transparent;color:var(--hub-muted)}.card-move button.move:not(:disabled):hover{border-color:var(--hub-line-strong);background:var(--hub-surface);color:var(--hub-ink)}.card-move button.move:disabled{opacity:.35;background:transparent;border-color:transparent}
.offer-target{font-weight:550}
`;
