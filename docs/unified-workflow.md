# 统一操作流程与 Amex 批量添加修复

所有银行模块随 Card Offer Hub 一起发布，使用同一版本。

## 共同流程

所有银行共用 `shared/ui/workflow-layout.js`，页面分为范围选择、优惠与操作两部分；每卡、账户与 Amex 组合模板决定各部分的具体含义。读取与添加可以分开操作，也可以像 Citi 一样在一次明确点击中串联：

1. **Choose scope**：选择卡片，或确认当前账户／profile。
2. **Scan offers**：手动更新扫描结果；**Stop** 停止后续请求。
3. **Review & add**：搜索结果，添加所选范围内可添加的优惠。Citi 使用缓存添加或刷新并添加两个入口，详见下方说明。

搜索只影响列表显示，不改变添加范围。使用已有结果的添加按钮显示可添加数量；Citi 的刷新并添加会先取得新结果，缓存数量为零也能使用。界面说明未选范围、需要核验、存储错误或冷却等阻止操作的原因。运行中的按钮禁用，另行显示任务进度。状态文字统一为 Available、Added、Needs review 和 Skipped。原始银行状态与成功判定保留。

US Bank 增加独立的 Add all offers；手动选中部分优惠后使用次要操作 Add selected。Citi 和 Chase 的当前列表仅展示已选卡片，取消选择不会删除已保存数据。BOFA 增加与其他银行一致的本地搜索。

## 保留必要的银行差异

- Amex 的卡片白名单与优先级不变：同一优惠只添加到一张合适的卡；完整缓存可用于手动添加。
- Citi、US Bank 和 Wells Fargo 保留添加前的服务端核验。BOFA 保留详情读取、激活、详情回查。
- BOFA、Wells Fargo 和 US Bank 使用当前登录账户范围，不能把缺少逐卡参数的接口伪装成卡片选择。
- Chase 仍为只读，隐藏添加按钮并提示在银行网站添加；可扫描和搜索。
- Citi 首次加载并选卡后提供 **Add saved offers**（不重扫优惠）和 **Refresh & add offers**（刷新全部卡片后直接添加已选卡上的优惠）。两者均核对当前登录卡片；未确认项目只能选择刷新并添加，先核验再继续。详见[继续操作与全量刷新](citi-refresh-continuation.md)。
- 其他银行恢复缓存后的扫描要求按既有协议保留。所有扫描与添加必须由用户点击发起，不在页面加载后或后台定时运行，不自动重试或保活。

每次请求完成后至少间隔 500 毫秒，串行运行。存储、会话核验、429 冷却和明确成功信号的约束不变。

## Amex 的 Add all 范围

旧实现把用于显示的 `state.filter` 同时用于生成添加计划。只有一条搜索结果时，周期性的按钮刷新会显示 Add filtered offers (1)，执行范围也缩为一条。现在 `groupedOffers` 显式区分显示与操作用途；添加候选和已处理项排除集合都读取完整所选范围。

点击 Add all 时生成固定队列和任务总数。之后切换浏览器标签页、改搜索、周期刷新按钮或银行页面重建面板，都不会重新生成该任务。单个优惠的 Add 仍明确只处理该优惠。

## 验证

- 单元测试覆盖搜索与添加计划分离、单项添加和 US Bank 全部／所选两种操作。
- 六家银行的合并版浏览器回归检查相同的步骤、按钮和搜索不改变批量数量。
- `tests/amex/browser-bulk-tab-switch.cjs` 覆盖无搜索时切换标签页、搜索只剩一条后切换、请求在途时切换、修改搜索、面板重建、白名单范围和完成后不重发。
- 使用修复前构建产物执行同一回归，在单结果搜索与标签页往返后得到 Add filtered offers (1)，与预期 Add all offers (3) 不符；修复后通过。
- `HEADFUL_TAB_TEST=1` 用独立临时 Chromium 配置执行真实 visible / hidden 标签页切换，避免 Playwright 默认焦点模拟掩盖后台状态。

```sh
npm run build
npm run check
npm test
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright npm run test:browser
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright HEADFUL_TAB_TEST=1 node tests/amex/browser-bulk-tab-switch.cjs
```

本次结果：build、check 均 PASS；286 项单元回归 PASS；12 组浏览器回归 PASS；额外的真实 visible / hidden 标签页回归 PASS。Citi 取消操作测试将虚拟时间步长收小到 100 毫秒，确保 Stop 确实发生在 500 毫秒等待窗口内，避免测试自身一次前进 1 秒越过待测窗口。

浏览器回归全部拦截网络并使用合成账户／优惠，模拟 GM 存储。它证明本地产物在浏览器切换下的行为，不证明当前真实银行页面或 Tampermonkey 沙箱已现场验证。用户报告的无搜索现场状态尚未获取；已确认并修复的是搜索误缩小批量范围路径，并覆盖了无搜索、运行中和搜索后的标签页切换。

## 待现场验证

更新已安装脚本后，在真实 Tampermonkey 与 Amex 页面观察标签页切换后的按钮、批量数量和进度；核对其他银行的会话、扫描和添加结果。银行服务器控制登录有效期，本次没有新增自动保活或自动恢复请求。
