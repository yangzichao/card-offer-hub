# BankAmeriDeals Lite

手动扫描当前登录的 Bank of America Deals profile，并批量激活普通 card-linked 优惠。

1. 用 Tampermonkey 安装构建产物 `dist/bofa-offer-lite.user.js`。
2. 从 Bank of America 登录并进入 `deals.merchant-rewards.com`。
3. 点 **Scan**，查看 eligible / skipped 列表；阅读网站优惠条款。
4. 勾选当前 profile 确认框，点 **Activate all**。

每次请求完成后等待至少 0.5 秒。每项优惠会先读取详情、空 body PUT 激活，再读取详情确认 `is_activated === true`。每项通常需要三个请求，间隔等待约 1.5 秒，另加服务器响应时间。停止按钮会等待当前请求结束，不中断正在提交的激活。

只处理 `CARD_LINKED` + `activation_required: true` + `activation_type: CLICK` + 单一 `OFFER_DETAILS_CLICK` trigger 的未激活优惠。跳过购物跳转 LINK、affiliate、merchant-fulfilled、未知类型、已激活项目。Upside 是独立领取流程，不会请求或处理。部分优惠的有效期从激活开始计算。

此平台以当前会话限定 profile，抓包没有 Citi 式逐卡参数；脚本不会宣称替所有银行卡添加。切换登录状态必须重扫。网络错误、429、结构变化和不明确结果都会停止，不自动重试。429 冷却持久化；多标签页通过 Web Locks 互斥。

仅在内存中读取当前页面 query token / `LS_TOKEN`，不保存、不输出、不上传 HAR、token 或位置。持久化仅包含带 schema 版本的请求间隔与冷却时间。加载脚本不会发请求。

验证范围及待现场验证见 [实现记录](../../../docs/bofa-implementation.md)。
