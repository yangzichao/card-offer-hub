# Wells Fargo Deals 接口记录

依据：用户提供的 2026-09-19 `web.secure.wellsfargo.com.har`。抓包仅在本机读取；本文件只保存协议结构，测试均为合成数据。

## 已观察的协议

- 页面：`https://web.secure.wellsfargo.com/auth/deals-portal`。
- GET `/deals-portal/as/getDeals`：响应外层 `status.statusCode === 200`、`status.messages[0].code === "SUCCESS"`；`data` 是需要再次解析的 JSON 字符串。
- `data.availableDeals.cardlyticsEligibleDeals` 有 78 条记录；`activatedDeals` 为空。`availableDeals.count` 为 0，不能据此判断没有优惠。
- 每条外层包含 `vendorName: "CL"`、`multiCardFlag: false`、`isActivated: false`；内层 `merchantDealDetails` 包含 `merchantOfferId`、`status: "AVAILABLE"`、商户、描述、有效期和 `checkSum`。本次没有卡片列表。
- 页面 HTML 内嵌 `window.initialState = JSON.parse("...")`；`metadata.clDealsActivateAction` 给出同源激活路径与当前会话的 token。脚本只做 JSON 解析，不使用 eval，不持久化 token。
- POST `/deals-portal/as/activateCLDeal?token=<current-page-token>`；JSON 请求体形状如下，ID 为合成示例：

```json
{
  "offerIdCheckSumMap": { "1001": "" },
  "activityCode": "ENROLL",
  "displayType": "Offer",
  "sendEmailFlag": false
}
```

5 次激活均每次只带一个 ID，map 的值均为空字符串，**不是列表里的 checkSum**。5 次响应均为 `{"status":"SUCCESS"}`；无卡号、无 enrollment ID。因此实现只接受严格匹配的大写成功状态，不套用 Amex/Citi 的响应结构。

网站还发送 `trackEvent` 埋点；脚本不发送这些埋点。未发现此激活请求需要独立的自定义认证 header；Cookie 由浏览器同源请求携带。不会重放 HAR 的 headers、Cookie 或 token。

## 实现范围

- 账户级手动同意，默认关闭；首次必须扫描，批量操作前再次扫描。
- 只处理已观察的单账户 CL 结构，遇到需要选卡、其他供应商或未知标记跳过；同 ID 状态冲突标记为 CONFLICT，不参与激活。
- 列表按真实数组计数，优惠 ID 去重。已激活分组不进入队列。
- 0.5 秒响应完成后间隔、单任务队列、同源 Web Locks、请求超时 45 秒、429 持久冷却、不自动重试。
- Stop 不丢弃已经发出请求的结果；记录成功后停止下一项。
- 仅持久化 schema 1 限速信息。账户同意和优惠状态在内存中，刷新重新扫描；未来 schema 不覆盖。

## 离线验证

合成数据覆盖协议解析、误导性的 count、重复与冲突、选卡/未知优惠跳过、token 读取/变化/地址校验、严格成功判断、手动授权、队列串行、响应后限速、停止、失败、429、存储与锁；浏览器覆盖实际浮动面板、按钮/搜索、激活流程及小屏宽度。测试均读取构建产物，全部浏览器请求被拦截。

## 待现场验证

- Tampermonkey 隔离环境读取当前页面内嵌 bootstrap 和实际同源请求的完整链路。
- 真实登录过期、token 轮换和重新打开 Deals 的恢复流程。
- 非空 activatedDeals、多卡和其他 vendor 的真实响应；当前实现保守跳过未支持的激活结构。
- 网站未来字段变化，以及账户级激活在银行端对各卡的适用范围。脚本不承诺可逐卡控制。

本次开发没有操作真实账户，也没有新增真实激活。HAR 中的成功是网站原有操作的证据，不是脚本实测成功的证据。
