# 可执行 Gherkin 行为测试

使用 Cucumber.js 将 `.feature` 中的 Given / When / Then 直接绑定到 Playwright 操作及断言。场景读取 `dist/card-offer-hub-all.user.js` 中实际发布的 Citi 模块，通过已有合成页面驱动真实 Chromium。不是仅有文字的测试清单。

## 运行

```sh
npm ci
npx playwright install chromium
npm run build
npm run test:gherkin
npm run test:gherkin -- --tags @recovery
```

`pretest:gherkin` 先检查构建产物与源码一致；过期产物会使测试失败。`npm run test:browser` 最后也会运行这些场景。GitHub Actions 的独立任务安装锁定的依赖和 Chromium，再运行 `npm run test:gherkin`。

## 目前覆盖 Citi

- `tests/citi/features/saved-offers.feature`：无点击不请求、恢复缓存后立即可添加、搜索不缩小添加范围、仅选中卡登记、登录变更阻止登记、空缓存刷新发现新优惠。
- `tests/citi/features/stop-and-continue.feature`：请求发出前停止、已发出请求明确成功后停止、已发出请求未确认时停止；前两者允许继续，后一种保持禁用。
- `tests/citi/features/blocked-offers.feature`：275 条可用优惠被一条未确认记录阻止时解释原因、未确认原因在重载后可见、刷新核验后跳过已完成优惠、429 冷却跨重载保留且不自动重试。

每个场景都有独立浏览器上下文、GM 存储和合成银行状态；所有网络请求被拦截，用虚拟时间推进等待。场景后检查页面错误和请求串行性，失败时附截图。Cucumber 不重试失败场景，未定义或待实现步骤会让命令失败。

步骤按操作、银行响应和结果断言拆在 `tests/citi/gherkin/steps/`，浏览器生命周期位于 `support/`。新增业务场景先写 `.feature`，复用有业务意义的步骤；底层协议边界仍由原有单元测试覆盖。

当前 Gherkin 覆盖范围是 Citi，其他银行仍使用现有单元与浏览器回归。这些合成测试不证明真实 Citi 登录、接口或登记已验证。

## 本次验证

- 1.5.0 发布前在完整工作区验证：`npm run build`、`npm run check`、`npm test`（375 项）、`npm run test:browser`（15 组浏览器回归及 11 个 Gherkin 场景、106 个步骤）均 PASS。浏览器命令末尾实际执行 `npm run test:gherkin`。
- 先前也在发布版本 `ab92788` 上仅叠加 Gherkin 测试改动的隔离目录验证通过，确认测试不依赖自动调速功能。
- 负向验证：仅在另一份临时产物中关闭 Citi 的 clean-stop 恢复，`Stop before the next request leaves the browser` 场景按预期在按钮应启用的断言处失败。
