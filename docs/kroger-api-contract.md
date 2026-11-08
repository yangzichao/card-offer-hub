# Kroger 数字优惠券接口记录

2026-11-07 在已登录的 www.kroger.com Coupons 页面观察。只记录字段名、形状和长度，不记录任何账户值。

## 列表

`GET /atlas/v1/savings-coupons/v2/coupons?filter.sort=relevance&filter.onlyNewCoupons=false&page.size=72&filter.status=unclipped&filter.status=active&page.offset=N`

- 响应：`{ data: { coupons: [...] }, meta: { coupons: { page: { offset, size, hasMore }, filterSummaryByType: {...}, userSavingsInfoByType: { standard: { clippedCount, unclippedCount, ... } } } } }`。
- 优惠券字段包括 `id`（7 位数字字符串）、`krogerCouponNumber`（12 位数字字符串）、`offerId`、`brand`、`displayDescription`、`shortDescription`、`categories`、`expirationDate`、`canBeAddedToCard`、`addedToCard`、`status` 等。
- `filterSummaryByType.totalCount` 与 `userSavingsInfoByType.standard.unclippedCount` 当时不相等（301 vs 297），所以脚本不用总数做完整性校验，只按 `hasMore` 翻页。
- 未领取列表里也可能出现刚领取、`addedToCard === true` 的记录；脚本把它们显示为已添加，不再发送。
- 只用 `filter.status=active` 返回已领取的；`filter.status=redeemed` 返回已使用的。

## 领取

`POST /atlas/v1/savings-coupons/v1/clip-unclip`，body `{"action":"CLIP","couponId":"<coupon.id>"}`。

- 响应：`{ data: { modifiedCoupons: [{ krogerCouponNumber, loyaltyCardNumber }] } }`。
- 已现场核对：`modifiedCoupons[].krogerCouponNumber` 等于列表里该优惠券的 `krogerCouponNumber`。脚本以此为唯一成功信号。

## 请求头

页面发出的列表和领取请求都带：`accept: application/json, text/plain, */*`、`x-kroger-channel: WEB`、`x-call-origin`（领取时为 `{"page":"coupon","component":"coupons"}`）、`x-modality`、`x-modality-type`、`x-facility-id`、`x-laf-object`（约 1.4 KB 的门店/地址上下文）、`x-ab-test`；列表请求另带 `user-time-zone`。`/atlas/v1/monetization/v2/ad-placements` 在每次打开 Coupons 页时也带同一组上下文头。

这些值不在 localStorage 中。脚本被动复制页面自己的 `/atlas/v1/` 请求头（白名单，要求 `x-kroger-channel === "WEB"` 且有 `x-modality` 与 `x-laf-object`），只放内存。站点使用 Akamai Bot Manager，请求形状尽量和页面一致。

登录走 MSAL / Azure B2C，`localStorage['msal.2.account.keys']` 是只含一个账户键的 JSON 数组，脚本只用它的 SHA-256 指纹区分账户。

## 待现场验证

以下只在合成数据的离线回归里验证过，还没有在真实账户上跑过：

- 用脚本批量领取全部优惠券（约 300 张）时，Kroger 是否限流、返回 429 或拦截（Akamai）。当前间隔从 500 毫秒起，按共享自动调速调整。
- 账户是否有领取数量上限，到上限时返回什么（HTTP 4xx 还是 HTTP 200 但 `modifiedCoupons` 为空）。当前处理：4xx 停止；200 未确认则计数，连续三个暂停。
- 脚本自己构造的列表请求（固定 `x-call-origin`、复制的上下文头）是否和页面请求一样被接受。
- 领取后未领取列表的排序变化是否会让翻页漏项。脚本先读完整列表再领取，领取过程中不再翻页。
