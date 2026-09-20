# Wells Fargo Offer Lite

本银行功能随 [Card Offer Hub 统一安装包](../../../bundles/all/README.md) 发布。

手动扫描并批量激活 My Wells Fargo Deals 的 Tampermonkey 脚本。

## 安装与使用

构建产物：[`dist/card-offer-hub-all.user.js`](../../../dist/card-offer-hub-all.user.js)。尚未发布时，在 Tampermonkey Dashboard → Utilities → Import from file 中导入本地文件。发布到 main 后才可使用 [安装 / 更新链接](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/card-offer-hub-all.user.js)。

1. 登录 Wells Fargo，从银行导航打开 **My Wells Fargo Deals**。脚本在 `web.secure.wellsfargo.com/auth/deals-portal` 或 `/deals-portal/` 显示浮动面板。
2. 在 **Choose scope** 勾选 **Allow adding offers to this account**，确认当前账户范围。刷新后保留勾选；会话变化后需要重新确认。
3. 点击 **Scan offers**，查看当前账户的优惠。
4. 在 **Review & add** 点击 **Add all offers**，脚本重新核验，然后串行激活符合条件的优惠。
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
- GM storage 用独立的版本化快照保存优惠展示结果、账户确认、搜索和面板状态，继续保留限速快照。仅存页面会话的 SHA-256 指纹用于比较，不存 token；会话变化清除旧确认。存储失败可见并阻止请求，未知 schema 保留原数据。
- 完成后刷新 Wells Fargo 页面更新原生徽标；面板展示的是 API 确认结果。

## 验证边界

依据用户提供的 2026-09-19 HAR：1 次列表请求、78 条未激活优惠及 5 次成功激活。开发未重放 HAR、未访问真实账户、未新增真实激活。合成单元测试和 Chromium 浏览器回归验证本地产物，不代表真实 Tampermonkey 会话已验证。

完整协议依据和待现场验证见 [接口记录](../../../docs/wellsfargo-api-contract.md)。

## 本地保存与恢复

扫描结果、已有选择、搜索条件和面板折叠状态保存在 Tampermonkey 本地存储，刷新或重新打开后恢复。页面显示最后完整扫描时间；恢复本身不发网络请求、不自动添加。取消勾选也会保存，不因刷新重新选中。

保存失败会显示错误；未知或损坏的快照保留原数据，不静默覆盖。快照只保存展示字段和选择，Cookie、登录 token、请求头、原始响应和地理位置不写入快照。正在添加时刷新，未确认的项目保留为未确认，后续先扫描核验。详见[持久化说明](../../../docs/local-persistence.md)。
