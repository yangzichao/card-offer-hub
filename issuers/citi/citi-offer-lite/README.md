# Citi Offer Lite

Citi Merchant Offers 的 Tampermonkey 脚本。沿用 Amex Offer Lite 的独立构建、浮动面板与自动更新方式，直接请求 Citi 当前登录会话的 API。

## 安装与使用

构建产物为 [`dist/citi-offer-lite.user.js`](../../../dist/citi-offer-lite.user.js)。首次发布前，在 Tampermonkey Dashboard → Utilities → Import from file 中导入本地文件；发布到 `main` 后可使用 [安装 / 更新链接](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/citi-offer-lite.user.js)，以后由 Tampermonkey 检查版本更新。

1. 登录 Citi，打开 [Merchant Offers](https://online.citi.com/US/nga/products-offers/merchantoffers)。
2. 点击 **Detect cards**，然后手动勾选要处理的卡片；没有默认勾选。
3. 点击 **Scan & add all**：重新扫描所有勾选卡片，然后逐个添加状态为 `AVAILABLE` 的 Offer。也可先点 **Scan selected** 只查看清单。
4. 可以随时点击 **Stop**。已发出的请求会等到结果返回并记录，然后停止后续请求。

每次响应完成后至少等待 0.5 秒，另加服务器响应时间；300 个 Offer 的间隔等待约 2.5 分钟，实际完成时间还取决于请求耗时。Citi 会话过期后流程会停止，重新登录、检测和扫描即可。脚本不会自动续期登录。

同一张卡重复出现的 Offer ID 会去重；不同卡片相同 Offer 会分别登记。搜索只筛选面板显示，不改变添加范围。面板最多显示 200 条匹配项目，扫描和队列没有此上限。

## 状态与隐私

- 只请求同源 Citi 的列表和登记路径，使用当前浏览器会话。不会向第三方发送账户数据。
- 不复制 HAR 中的 Cookie、client ID、账户标识；每次请求重新读取 Citi 登录后写入的配置 Cookie。
- 429 按 `Retry-After` 冷却；HTTP 错误、未知响应、超时均停止，先重新扫描再继续。没有自动重试。
- 非空 `EnrolledOfferInfo.enrollmentId` 和非空 `MerchantOfferDetails` 是确认要求；若返回的卡片、Offer 或状态相互矛盾，也不会算成功。
- 同一浏览器同源标签页通过 Web Locks 互斥。其他浏览器、浏览器配置文件或手动网站操作不受这个锁控制。
- 带 schema 版本的快照保存卡片、勾选、列表和登记结果。刷新后先显示缓存；手动扫描会先核对当前登录的卡片，保留仍属于此账户的选择，再扫描服务端状态。存储错误会显示并阻止新请求。
- Citi 自带页面可能保留旧徽标，完成后刷新即可。脚本面板展示 API 确认结果。

## 验证边界

列表结构来自用户提供的 2026-09-19 HAR。第二份抓包补齐了 4 次成功登记，涉及 2 张卡、3 个不同 Offer：登记路径、字符串 `oneClickEnroll: "true"`、响应 Offer ID、`ENROLLED` 状态及非空登记 ID 均与当前实现匹配。相同响应结构已用合成值纳入单元和浏览器回归。

这证明脚本的请求格式和响应判断与实际网站登记一致；尚未验证 Tampermonkey 脚本在真实会话中发起请求的完整流程。本次没有重放抓包或新增真实登记。

构建、合成单元测试及浏览器回归不访问真实账户。完整接口依据和待现场验证项见 [Citi 接口记录](../../../docs/citi-api-contract.md)。

## 本地保存与恢复

扫描结果、已有选择、搜索条件和面板折叠状态保存在 Tampermonkey 本地存储，刷新或重新打开后恢复。页面显示最后完整扫描时间；恢复本身不发网络请求、不自动添加。取消勾选也会保存，不因刷新重新选中。

保存失败会显示错误；未知或损坏的快照保留原数据，不静默覆盖。快照只保存展示字段和选择，Cookie、登录 token、请求头、原始响应和地理位置不写入快照。正在添加时刷新，未确认的项目保留为未确认，后续先扫描核验。详见[持久化说明](../../../docs/local-persistence.md)。
