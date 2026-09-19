# 请求间隔调整（2026-09-19）

- 本次发布将 Amex 和 Citi 正常请求的等待间隔从 15 秒改为 500 毫秒，添加及扫描共用该间隔。工作区中尚未发布的新银行脚本也已同步调整，随各自功能单独提交。
- 间隔从前一个响应处理完成开始计算，始终串行。服务器耗时、响应核验所需的额外请求和 429 冷却都会增加每个 Offer 的实际耗时，不保证每秒完成两个 Offer。
- 保留手动启动、Stop、失败或未确认后停止、无自动重试，以及现有 Retry-After 冷却和持久化逻辑。已有保存的等待期限和冷却期限不清零。
- 同步当前 README 和面板说明；历史维护记录中的 15 秒描述保留为当时的行为记录。
- Amex 升级至 5.0.1，Citi 升级至 1.0.1。用户已授权将本次加速改动提交并推送至 main；session 保活仍为讨论方案，本次未实现。

## 待现场验证

- 各银行真实会话下 500 毫秒间隔的接受情况、429 频率及实际完成耗时。离线合成数据回归不代表真实网站已验证。

## 工作区验证（包含尚未发布的新银行脚本）

- `npm run build`：PASS，6 个脚本产物已重新生成。
- `npm run check`：PASS，源码语法、产物和安装目录一致。
- `npm test`：PASS，236 项合成数据测试。
- `PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright npm run test:browser`：PASS，全部 9 个 Chromium 场景。使用本机内置 Playwright，未修改依赖配置。
- Amex 浏览器回归验证 499 毫秒时不发下一请求，500 毫秒时继续；延迟响应单元测试验证等待从响应完成后开始。停止、错误、429 和不自动重试的既有回归均通过。

## 独立发布验证

仅包含已发布的 Amex/Citi 及本次改动，不包含其他任务的新银行脚本。

- `npm run build`：PASS，Amex 5.0.1 和 Citi 1.0.1。
- `npm run check`：PASS。
- `npm test`：PASS，145 项测试。
- 使用上述 `PLAYWRIGHT_MODULE_PATH` 执行 `npm run test:browser`：PASS，5 个 Chromium 场景。
