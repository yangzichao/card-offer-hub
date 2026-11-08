# Kroger Coupon Lite

本工具随 [Card Offer Hub 统一安装包](../../../bundles/all/README.md) 发布。

一键把 Kroger 全部可领取的数字优惠券（digital coupons）加到当前登录账户的会员卡。逐个串行发送，只有 Kroger 的响应里明确返回该优惠券的 `krogerCouponNumber` 才算成功。

## 使用

1. 登录 kroger.com，打开 **Coupons**（`https://www.kroger.com/savings/cl/coupons/`），等页面加载完。脚本显示浮动面板，不会自动请求。
2. 点击 **Clip all coupons**。不需要先加载：这次点击会先重新读取全部未领取的优惠券，然后逐个领取。
3. 只想看列表不领取，点 **Load coupons**。
4. **Stop** 在当前请求结束后停止，剩下的不发送。之后再点一次 **Clip all coupons** 会重新读取列表，只领取仍未领取的。

## 边界

- 列表读取和 Kroger 页面用同一个筛选（`filter.status=unclipped` + `active`），每页 72 条，按实际返回条数推进 offset，直到 `hasMore === false`。页数超过上限或空页但 `hasMore` 仍为 true 都会停止，不领取。
- 只领取 `canBeAddedToCard === true`、`addedToCard === false` 且带 `krogerCouponNumber` 的优惠券。重复出现但状态不同的记录标为冲突，不领取。
- 每个优惠券每次点击最多发送一次。HTTP 200 但响应没有该券号记为未确认，继续下一个；连续三个未确认且还有剩余时暂停。HTTP 错误、超时、断网、非 JSON、429 和存储故障停止本轮，不自动重试。
- 请求串行，间隔从上一个响应完成开始算，使用共享的自动调速；429 按 `Retry-After` 冷却，缺失时 5 分钟。
- Kroger 页面请求里带门店与配送方式上下文头（`x-laf-object`、`x-modality` 等），页面存储里读不到。脚本在 document-start 被动观察页面自己发往 `/atlas/v1/` 的同源请求，只复制白名单里的这几个头，放在内存里，不写入存储。页面还没发出过这类请求时，按钮会提示等页面加载完。
- 账户区分用 `localStorage['msal.2.account.keys']` 的 SHA-256 指纹，原值不保存；运行中账户变化会停止。
- GM storage 只保存带 `schemaVersion` 的展示字段（ID、品牌、描述、类别、到期日、状态）、搜索和面板状态。券号、请求头、Cookie 和原始响应不保存。

## 验证

```sh
npm run build
npm run check
npm test
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright npm run test:browser
```

单测和浏览器回归都使用合成数据并拦截全部网络请求。真实网站上的批量领取结果见 [接口记录](../../../docs/kroger-api-contract.md) 的「待现场验证」。
