# BankAmeriDeals Lite

手动扫描当前登录的 Bank of America Deals profile，并批量激活普通 card-linked 优惠。

1. 用 Tampermonkey 安装构建产物 `dist/bofa-offer-lite.user.js`。
2. 从 Bank of America 登录并进入 `deals.merchant-rewards.com`。
3. 点 **Scan**，查看 eligible / skipped 列表；阅读网站优惠条款。
4. 勾选当前 profile 确认框，点 **Activate all**。

每次请求完成后等待至少 0.5 秒。每项优惠会先读取详情、空 body PUT 激活，再读取详情确认 `is_activated === true`。每项通常需要三个请求，间隔等待约 1.5 秒，另加服务器响应时间。停止按钮会等待当前请求结束，不中断正在提交的激活。

只处理 `CARD_LINKED` + `activation_required: true` + `activation_type: CLICK` + 单一 `OFFER_DETAILS_CLICK` trigger 的未激活优惠。跳过购物跳转 LINK、affiliate、merchant-fulfilled、未知类型、已激活项目。Upside 是独立领取流程，不会请求或处理。部分优惠的有效期从激活开始计算。

此平台以当前会话限定 profile，抓包没有 Citi 式逐卡参数；脚本不会宣称替所有银行卡添加。切换登录状态必须重扫。网络错误、429、结构变化和不明确结果都会停止，不自动重试。429 冷却持久化；多标签页通过 Web Locks 互斥。

仅在内存中读取当前页面 query token / `LS_TOKEN`，不保存、不输出、不上传 HAR、token 或位置。本地保存优惠展示结果、账户确认和面板状态，限速时间继续独立保存。恢复后必须手动扫描；会话变化会清除旧账户确认。仅存 SHA-256 会话指纹用于比较，不存原始凭证。加载脚本不会发请求。

验证范围及待现场验证见 [实现记录](../../../docs/bofa-implementation.md)。

## 本地保存与恢复

扫描结果、已有选择、搜索条件和面板折叠状态保存在 Tampermonkey 本地存储，刷新或重新打开后恢复。页面显示最后完整扫描时间；恢复本身不发网络请求、不自动添加。取消勾选也会保存，不因刷新重新选中。

保存失败会显示错误；未知或损坏的快照保留原数据，不静默覆盖。快照只保存展示字段和选择，Cookie、登录 token、请求头、原始响应和地理位置不写入快照。正在添加时刷新，未确认的项目保留为未确认，后续先扫描核验。详见[持久化说明](../../../docs/local-persistence.md)。
