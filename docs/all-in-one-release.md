# 合并安装版 1.0.0

新增 `dist/card-offer-hub-all.user.js`，一次安装包含全部六家银行工具。单独版安装地址和版本保持不变，根 README 提供合并版优先入口，`dist/index.json` 新增 `allInOne` 发布信息。

合并版直接嵌入已验证的银行脚本 IIFE，按原有站点匹配路由；Chase 保持 document-start 观察，其余等待 DOM 可用。本地存储使用银行前缀隔离。扫描、添加、冷却和未确认状态规则沿用原组件，没有自动网络请求。

`npm run bump -- <银行脚本 ID> patch` 自动提升合并版 patch。只修改组合本身或新增银行时，使用 `npm run bump -- card-offer-hub-all patch`。定向构建也刷新合并版、发布目录和安装表，完整发布仍执行全部检查。

合并版与单独版具有独立的 Tampermonkey 存储。切换前停用单独版并保留它们；原有结果与选择不会自动迁移到合并版。首次使用合并版需重新扫描和选择。安装说明见 [合并版 README](../bundles/all/README.md)。

## 已完成验证

- `npm run build`：PASS，生成六个单独版与一个合并版。
- `npm run check`：PASS，发布产物、语法和安装表同步。
- `npm test`：PASS，279 项，包含合并路由、启动时机、存储隔离和版本联动。
- `PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright npm run test:browser`：PASS，10 组。合并版覆盖全部六家模拟银行页面、早期 Chase 观察器、缓存恢复、真实 document reload、重复注入与无启动请求。

## 待现场验证

Tampermonkey 实际安装确认页、真实扩展沙箱和自动更新流程，以及真实银行会话与接口行为。所有回归使用合成数据，GM API 由测试模拟，不能视为真实账户验证。
