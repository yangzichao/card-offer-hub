const PANEL_STYLES = HUB_DESIGN_STYLES + `
.card.drop-target{background:var(--hub-tint);outline:2px dashed var(--hub-accent);outline-offset:-2px}
.drag-handle{cursor:grab;color:var(--hub-muted);line-height:1;margin-top:2px;user-select:none}
.card-rank{color:var(--hub-muted);font-size:11px;min-width:13px;margin-top:2px;text-align:right}
.card-move{display:flex;flex-direction:column;gap:3px}.card-move button.move{min-height:22px;padding:0 6px;font-size:11px;line-height:1.6}
.offer-target{font-weight:500;margin:4px 0 0}
`;
