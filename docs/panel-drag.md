# 拖动面板（1.11.0）

面板默认停在右下角，可能挡住银行页面上的按钮或聊天窗口。现在可以拖到任何位置，每家银行记住自己的位置。

## 怎么用

- 按住表头空白处或标题拖动。表头左侧的点阵是 **Move panel** 按钮，也可以从它开始拖。表头里的按钮和链接（收起、Update）照常点击，不会触发拖动。
- 键盘：焦点放在 Move panel 上，方向键每次移动 16px，按住 Shift 移动 64px，Home 回到默认右下角。
- 双击表头空白处也回到默认位置。
- 银行入口页（例如 americanexpress.com 首页）和该银行的 offers 面板共用一个位置。

## 行为

- 松手时按面板中心落在哪半边，记成离它最近的窗口角和到这个角的距离。所以停在左上角时，展开会向右下长；停在右下角时，展开向左上长。
- 窗口变小、面板展开时，显示位置会被拉回窗口内（离边 8px），但保存的位置不变；窗口变大或面板收起后回到原处。
- 拖动只改面板位置，不发任何请求，也不影响扫描、添加和其他设置。

实现：`shared/ui/panel-drag.js`（指针拖动、键盘、限制在窗口内），三种面板都用它：五家银行和 Kroger 的共享面板（`shared/ui/workflow-panel.js`）、Amex 面板、银行入口页（`bundles/all/src/entry/bank-entry.js`）。

## 存储

`${script-id}:panel-position`，存在该银行自己带前缀的存储里（`issuer:<id>:`），`{ schemaVersion: 1, position: null | { horizontal: 'left'|'right', x, vertical: 'top'|'bottom', y } }`，`null` 表示默认位置（`shared/persistence/panel-position-storage.js`）。只在用户拖动、按键或重置时写入，打开页面不写。读不懂的值原样保留，本次访问内仍可拖动但不保存，面板表头下方显示提示；保存失败也在同一位置显示。

## 验证

- `tests/build/panel-position.test.cjs`：最近角计算、贴边限制、存储 schema、未知值保留、保存失败。
- `tests/build/browser-panel-drag.cjs`：Chromium 加载发布包，在合成页面上用真实鼠标拖动 BankAmeriDeals 面板（收起状态拖到左上角、展开保持左上角、方向键、重载恢复、320px 窗口、拖出边界、Home 和双击重置、表头按钮仍可点击、保存失败提示），再在 Amex 入口页拖动并确认 offers 面板沿用同一位置，各银行位置互不影响；全程没有网络请求。

以上都是合成页面。

## 待现场验证

- 真实银行页面上拖动是否顺畅（银行页面自己的脚本或样式是否干扰指针事件）。
- 触屏设备上拖动（表头设了 `touch-action: none`，未在真机上试过）。
