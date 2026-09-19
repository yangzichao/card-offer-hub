const PANEL_STYLES = `
:host{all:initial;position:fixed;bottom:18px;right:18px;z-index:2147483646;font:13px/1.5 system-ui,sans-serif;color:#253247}
*{box-sizing:border-box} .panel{width:min(440px,calc(100vw - 24px));max-height:85vh;overflow:auto;background:white;border:1px solid #d7dfe8;border-radius:12px;box-shadow:0 10px 36px #19304926}
header,section,footer{padding:12px 16px} header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e5eaf0} h2{font-size:16px;margin:0}p{margin:6px 0}
button,input{font:inherit}button{padding:7px 10px;border:1px solid #c7d2df;border-radius:6px;background:#f7f9fc;color:#253247;cursor:pointer}button.primary{background:#1763a6;color:white;border-color:#1763a6}button:disabled{opacity:.45;cursor:not-allowed}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.muted{color:#637185;font-size:12px}.cards{max-height:160px;overflow:auto}.card{display:flex;gap:8px;padding:6px 0}.card input{flex:none}
input[type=search]{width:100%;padding:8px;border:1px solid #c7d2df;border-radius:6px}.offers{max-height:190px;overflow:auto}.offer{display:block;padding:8px 0;border-bottom:1px solid #e5eaf0;overflow-wrap:anywhere}.offer small{display:block;color:#637185}
footer{background:#f6f8fb;overflow-wrap:anywhere}.error{color:#a13030}[hidden]{display:none!important}
`;
