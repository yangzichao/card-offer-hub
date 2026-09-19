# Wells Fargo Offer Lite

手动扫描并批量激活 My Wells Fargo Deals 的 Tampermonkey 脚本。

## 安装与使用

构建产物：[`dist/wellsfargo-offer-lite.user.js`](../../../dist/wellsfargo-offer-lite.user.js)。尚未发布时，在 Tampermonkey Dashboard → Utilities → Import from file 中导入本地文件。发布到 main 后才可使用 [安装 / 更新链接](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/wellsfargo-offer-lite.user.js)。

1. 登录 Wells Fargo，从银行导航打开 **My Wells Fargo Deals**。脚本在 `web.secure.wellsfargo.com/auth/deals-portal` 或 `/deals-portal/` 显示浮动面板。
2. 点击 **Scan offers**，查看当前账户的优惠。
3. 勾选 **Activate eligible offers for this signed-in account**，明确选择当前账户范围。刷新后需要重新勾选。
4. 点击 **Scan & add all**，脚本重新扫描，然后串行激活符合条件的优惠。
5. 点击 **Stop** 可停止后续请求。已发出的请求会等待返回，并按实际响应记录。

这套抓包中的激活 API 不带卡号，不能提供逐卡白名单。脚本仅处理 `CL`、`multiCardFlag === false`、无选卡列表、明确未激活且状态为 `AVAILABLE` 的优惠。需要额外选卡、其他供应商、未知状态或冲突数据会跳过；这些请在网站手动处理。

每次响应完成后至少间隔 **0.5 秒**，实际完成时间还需加上服务器响应时间。相同 ID 去重。搜索只筛选显示，不改变批量激活范围；面板最多显示 200 条，队列无此限制。

## 会话、限速与隐私

- 所有请求由点击触发；加载脚本只显示 UI，不发请求、不轮询、不自动保活或重试。
- 同源请求使用浏览器当前登录状态。激活 token 从当前页面内嵌的 `window.initialState` JSON 读取，不执行页面脚本，不复制抓包凭证。
- 严格限制激活地址的域名、路径和 token 参数，禁用重定向。
- 只有响应 `status === "SUCCESS"` 才计为成功。HTTP 错误、超时、未知响应立即停止，重新扫描后才能继续。
- 429 按 `Retry-After` 冷却，冷却时间不会缩短；冷却期间手动扫描也被阻止。
- Web Locks 防止同一浏览器同源标签页的本脚本并行运行；不控制银行自己的请求或其他浏览器。
- GM storage 只保存带 `schemaVersion: 1` 的请求间隔和冷却时间。会话 token、优惠和账户选择不写入存储；存储失败显示错误并阻止新请求。未知 schema 保留原数据并停止。
- 完成后刷新 Wells Fargo 页面更新原生徽标；面板展示的是 API 确认结果。

## 验证边界

依据用户提供的 2026-09-19 HAR：1 次列表请求、78 条未激活优惠及 5 次成功激活。开发未重放 HAR、未访问真实账户、未新增真实激活。合成单元测试和 Chromium 浏览器回归验证本地产物，不代表真实 Tampermonkey 会话已验证。

完整协议依据和待现场验证见 [接口记录](../../../docs/wellsfargo-api-contract.md)。
