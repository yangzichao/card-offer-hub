# 统一界面与跨银行搜索

## 界面

全部六家银行共用 `shared/ui/design-system.js` 的色彩、字号、间距、按钮、输入框、状态和响应式布局，使用浅色背景与绿色主操作。品牌标题由 `shared/ui/panel-branding.js` 统一处理，Amex 保留卡片排序的专用样式；原有操作名称和银行工作流保持兼容。

## 搜索范围

合并版在当前银行面板增加 Search all banks 入口，打开原生 modal dialog，提供键盘焦点管理、Escape 关闭和焦点返回。搜索读取六家银行现有 GM 快照，按银行/卡片保留独立结果，不产生第二份 Offer 索引，不发送任何请求。

搜索覆盖商户、描述、类别、银行和卡片显示名称，支持多词、大小写和常见重音归一化。银行和状态筛选与文字查询取交集；默认每页 60 条，可追加展示。结果包括扫描时的状态、卡片名称、扫描时间、已有有效期，以及清单中声明的银行页面链接。链接必须满足对应银行的 match 范围，不能由保存的优惠内容指定。

合并版原有 `issuer:<id>:` 快照原样沿用，包括 Amex 的 offer schema 1、cards schema 1/2，以及其余五家的 workspace schema 1。未确认、冲突、失败状态归为 Needs review；Amex 不可登记的资讯类优惠不归为可用。尚未扫描、无法读取与零结果分别呈现。读取失败只排除该银行，保留原值并显示提示。

搜索条件使用独立的 `hub:search-preferences` schema 1，包含文字查询、银行和状态。未知版本保留原值，界面明确说明本次修改仅在当前访问有效；保存失败可见。搜索只读银行快照，不改变选择、许可、冷却或激活队列。

## 使用边界

跨银行搜索只适用于合并版保存的数据。Tampermonkey 单独脚本之间存储隔离，旧单独版的结果不会自动迁移。每家银行首次使用需主动扫描；仅安装或打开搜索不会抓取任何账户。Reload saved results 会重新读取本地数据，可获取其他标签页保存的新结果；不会重新扫描银行。

Available when scanned 是历史扫描状态，并非当前资格承诺。部分扫描、缺失时间会单独标注；多卡同商户分别呈现。银行链接打开该银行页面，不会自动添加。

## 验证

- `npm run build`、`npm run check`：PASS，全部脚本与合并版源码、发布产物和安装表同步。
- `npm test`：PASS，284 项。包含六家银行格式归一化、关键词/银行/状态筛选、卡片名称、无标识泄露、未知格式保留、未确认状态与搜索偏好恢复。
- `PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright npm run test:browser`：PASS，11 组。保留既有银行回归；新增六银行共享样式验证，跨银行搜索、真实 document reload、过滤条件保存、焦点/Escape、分页、空结果、损坏数据、文本注入处理、无网络请求和窄屏布局检查。

以上使用合成数据和模拟 GM API。真实 Tampermonkey 沙箱、跨银行真实账户、银行当前接口及扩展自动更新仍待现场验证。
