const PANEL_STYLES = `
:host { all: initial; position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; color: #253247; font: 13px/1.45 -apple-system, BlinkMacSystemFont, sans-serif; }
* { box-sizing: border-box; }
.panel { width: min(480px, calc(100vw - 24px)); max-height: 90vh; overflow: auto; background: #fff; border: 1px solid #d7dfe8; border-radius: 12px; box-shadow: 0 10px 36px #19304926; }
header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid #e5eaf0; }
h2 { font-size: 16px; margin: 0; } h3 { font-size: 13px; margin: 0 0 8px; }
section { padding: 12px 16px; border-bottom: 1px solid #e5eaf0; }
p { margin: 6px 0; } .muted { color: #637185; font-size: 12px; }
.storage-error { color: #a13030; font-size: 12px; }
button { font: inherit; padding: 7px 10px; border: 1px solid #c7d2df; border-radius: 6px; background: #f7f9fc; color: #253247; cursor: pointer; }
button.primary { background: #1763a6; color: white; border-color: #1763a6; }
button:disabled { opacity: .45; cursor: not-allowed; }
button.stop { border-color: #b24545; color: #a13030; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
input[type=search] { width: 100%; padding: 8px; border: 1px solid #c7d2df; border-radius: 6px; font: inherit; }
.cards { max-height: 180px; overflow-y: auto; }
.card { display: flex; gap: 9px; padding: 8px 0; border-bottom: 1px solid #eef1f5; align-items: flex-start; overflow-wrap: anywhere; }
.card input { margin-top: 3px; } .card-info { flex: 1; min-width: 0; } .card-report { color: #637185; font-size: 11px; }
.card.drop-target { background: #eef5fc; outline: 2px dashed #1763a6; outline-offset: -2px; }
.drag-handle { cursor: grab; color: #8b97a8; line-height: 1; margin-top: 2px; user-select: none; }
.card-rank { color: #637185; font-size: 11px; min-width: 13px; margin-top: 2px; text-align: right; }
.card-move { display: flex; flex-direction: column; gap: 3px; }
.card-move button.move { padding: 0 6px; font-size: 11px; line-height: 1.6; }
.offer-target { color: #24643c; font-size: 12px; font-weight: 500; margin: 4px 0 0; }
.card-counts, .offer-counts { color: #2e5c88; font-size: 12px; font-weight: 500; }
.offers { max-height: 290px; overflow-y: auto; }
.offer { padding: 12px 0; border-bottom: 1px solid #e5eaf0; }
.offer-title { display: flex; gap: 10px; justify-content: space-between; align-items: flex-start; }
.offer-title strong { overflow-wrap: anywhere; } .offer-title button { flex-shrink: 0; }
.badges { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 7px; }
.badge { background: #eff2f6; padding: 3px 6px; border-radius: 4px; font-size: 11px; }
.badge.enrolled { background: #e3f2e8; color: #24643c; }
.badge.unconfirmed, .badge.failed { background: #fff0df; color: #88530d; }
.status { padding: 12px 16px; background: #f6f8fb; overflow-wrap: anywhere; }
.logs { max-height: 90px; overflow-y: auto; color: #637185; font-size: 11px; }
[hidden] { display: none !important; }
`;
