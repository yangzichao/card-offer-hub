# Citi Offer Lite

本银行功能随 [Card Offer Hub 统一安装包](../../../bundles/all/README.md) 发布。

Citi Merchant Offers 的 Tampermonkey 脚本。使用统一安装包的浮动面板与自动更新方式，直接请求 Citi 当前登录会话的 API。

## 安装与使用

构建产物为 [`dist/card-offer-hub-all.user.js`](../../../dist/card-offer-hub-all.user.js)。首次发布前，在 Tampermonkey Dashboard → Utilities → Import from file 中导入本地文件；发布到 `main` 后可使用 [安装 / 更新链接](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/card-offer-hub-all.user.js)，以后由 Tampermonkey 检查版本更新。

1. 登录 Citi，打开 [Merchant Offers](https://online.citi.com/US/nga/products-offers/merchantoffers)。
2. 首次使用点击 **Load cards & offers**，读取全部卡片和优惠，所有卡片默认勾选；可主动取消不想处理的卡片，选择会保存。新发现的卡片也默认勾选。
3. 之后只需在两个操作中选一个：**Add saved offers** 直接尝试缓存中仍标为 `AVAILABLE` 的优惠，不重新扫描优惠；**Refresh & add offers** 刷新所有当前卡片及优惠后，自动添加已选卡上的可用优惠，无需再点添加。两条路径都会先核对所选卡片属于当前登录。缓存数量为零时仍可刷新并添加新优惠。
4. 可以随时点击 **Stop**。已发出的请求会等到结果返回并记录，然后停止后续请求。

每次响应完成后自动等待：首次为 1 秒，根据 Citi 的有效响应逐渐调整，最低 0.5 秒；发生 429 时减速并保存冷却。实际完成时间取决于已学习的间隔、服务器耗时与冷却。Citi 会话过期后流程会停止，重新登录后点击刷新即可。脚本不会自动续期登录。

同一张卡重复出现的 Offer ID 会去重；不同卡片相同 Offer 会分别登记。搜索只筛选面板显示，不改变添加范围。面板最多显示 200 条匹配项目，扫描和队列没有此上限。

## 状态与隐私

- 只请求同源 Citi 的列表和登记路径，使用当前浏览器会话。不会向第三方发送账户数据。
- 不复制 HAR 中的 Cookie、client ID、账户标识；每次请求重新读取 Citi 登录后写入的配置 Cookie。
- 429 按 `Retry-After` 冷却；HTTP 错误、网络故障、非 JSON 响应和超时仍停止。HTTP 200 的单条登记结果未确认时，保存为未确认并跳过，继续其他可用优惠；不会重试该条。
- 非空 `EnrolledOfferInfo.enrollmentId` 和非空 `MerchantOfferDetails` 是确认要求；若返回的卡片、Offer 或状态相互矛盾，也不会算成功。
- 同一浏览器同源标签页通过 Web Locks 互斥。其他浏览器、浏览器配置文件或手动网站操作不受这个锁控制。
- 带 schema 版本的快照保存卡片、勾选、列表和登记结果。恢复后先显示缓存；继续添加会核对当前登录的卡片，若已选卡片不再属于当前登录则停止。刷新保留仍有效的选择，新卡默认勾选；任一已选卡片消失时，先停止并要求检查选择。存储错误会显示并阻止新请求。
- Citi 自带页面可能保留旧徽标，完成后刷新即可。脚本面板展示 API 确认结果。

## 验证边界

列表结构来自用户提供的 2026-09-19 HAR。第二份抓包补齐了 4 次成功登记，涉及 2 张卡、3 个不同 Offer：登记路径、字符串 `oneClickEnroll: "true"`、响应 Offer ID、`ENROLLED` 状态及非空登记 ID 均与当前实现匹配。相同响应结构已用合成值纳入单元和浏览器回归。

这证明脚本的请求格式和响应判断与实际网站登记一致；尚未验证 Tampermonkey 脚本在真实会话中发起请求的完整流程。本次没有重放抓包或新增真实登记。

构建、合成单元测试及浏览器回归不访问真实账户。完整接口依据和待现场验证项见 [Citi 接口记录](../../../docs/citi-api-contract.md)。

## 本地保存与恢复

扫描结果、已有选择、搜索条件和面板折叠状态保存在 Tampermonkey 本地存储，刷新或重新打开后恢复。页面显示最后完整扫描时间；恢复本身不发网络请求、不自动添加。取消勾选也会保存，不因刷新重新选中。

保存失败会显示错误；未知或损坏的快照保留原数据，不静默覆盖。快照只保存展示字段和选择，Cookie、登录 token、请求头、原始响应和地理位置不写入快照。正在添加时刷新，未确认的项目保留为未确认，后续添加跳过未确认项目，继续其他可用优惠；需要核验被跳过的项目时点击 Refresh & add offers。直接使用缓存可能遇到已在网站添加或已失效的优惠；只有明确成功才计入已添加，单条未确认不会锁住整批。详见[持久化说明](../../../docs/local-persistence.md)和[继续操作与全量刷新](../../../docs/citi-refresh-continuation.md)。

自动调速的样本、间隔与冷却按银行保存，刷新页面不丢失，也不自动启动任务。速度详情默认折叠，无需用户调参。算法、缓存迁移与现场验证边界见[自动调速](../../../docs/adaptive-pacing.md)。
