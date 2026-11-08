# 单个优惠失败后继续

问题：BankAmeriDeals 实测时，「Checking offer N/M」阶段有一个优惠出错，整轮添加随之停止，还要求重新扫描。US Bank、Wells Fargo 有同样的问题；Kroger 遇到单张券的 HTTP 错误也会停。

现在的规则：**一个优惠的问题只影响这个优惠**。它会被核验，必要时重试一次，然后记下结果，接着处理下一个。共享实现在 `shared/runtime/offer-attempt.js`（`hubAttemptOffer`、`createHubOfferRunTally`）。

## BankAmeriDeals 扫描本身也会失败（2026-11-08 实测）

在真实账户上（v1.7.0）点 Scan，第二页就报 `Offer list changed during pagination. Scan again.`。网站自己翻页的请求显示，Deals 每一页返回的 `total` 都不一样：连续 5 页依次是 841、843、840、831、843（页面自己的筛选，按相关度排序，每页 24 条，5 页里没有重复 ID）。旧代码要求每页 `total` 相同，所以这个账户的扫描每次都失败。

现在：`total` 只作参考，一直翻到不足一页为止；列表挪位造成的重复 ID 去掉；报告有优惠却返回空列表、页数超过上限时才中止。列表在翻页时挪动可能漏掉个别优惠，下次扫描会补上。

## 每个优惠怎么处理

BankAmeriDeals、US Bank、Wells Fargo：

1. 用最新读取的状态判断：已添加就记为已添加；不再 eligible 就跳过，不发写请求。
2. 发送一次写请求。只有响应本身明确成功（Wells Fargo 的 `status === "SUCCESS"`）才直接算成功。BankAmeriDeals 的 `ok` 和 US Bank 的 `requestId` 只算收到，不算成功。
3. 其他情况一律重新读取这个优惠的状态：显示已激活就算成功；显示仍可添加（明确未激活）就**再发一次**；再次读取仍未激活就记为 Not added，继续下一个。
4. 读取本身失败（单个优惠的 HTTP 4xx/5xx）时，隔一个正常间隔再读一次；仍失败就记下并继续。

「再发一次」只在读取明确显示该优惠仍可添加、尚未激活时才会发生，不是盲目重发。每个优惠每次点击最多发两次写请求。

写入后读取发现优惠消失或变为不可添加，不算明确的回答，记为未核验（Needs review / `UNCONFIRMED`），下次点击不会重发，需要重新扫描核对。

Kroger：每张券每次点击仍只发一次。单张券的 HTTP 错误、超时或断网记为未确认，继续下一张；下次点击 **Clip all coupons** 会重新读取列表，仍未领取的券会再试一次。

## 仍会停止整轮的情况

- 401/403（登录失效）、非 JSON（通常是登录页）、会话或账户变化。
- 429：按 `Retry-After` 冷却。
- Stop、存储故障、另一个标签页在运行。
- 写请求断网或超时后，用来核验的读取也断网（说明网络已断）。
- 连续 3 个优惠都没加上且还有剩余：暂停，状态写明还剩多少没试。这通常说明是银行那边出了问题，不是单个优惠的问题。再点 Add 会继续。

## 用户能看到什么

- 进度：`Checking offer 5/40: Merchant… 2 could not be added so far; continuing with the rest.`，进度条按已处理数前进。
- 结束：`Finished: 37 of 40 added. 1 no longer eligible. 2 not added after a retry; Add tries them again. Not added: A, B.`
- BankAmeriDeals 的行状态显示 **Not added**，并附上原因。
- 跑完或暂停后不需要重新扫描，直接再点 Add 就会重试没加上的优惠。每个优惠写入前都会重新读取最新状态。

## 验证

- `tests/bank-of-america/activation.test.cjs`：中间一个失败其余照常、重试一次、详情读取失败跳过、连续三个暂停、写入断网但读回成功、读回断网停止、401 停止、资格变化跳过。
- `tests/usbank/workflows.test.cjs`、`tests/wellsfargo/workflows.test.cjs`、`tests/kroger/clip-all.test.cjs`：对应场景。
- 三家的浏览器回归：未确认模式下跑完全部并给出汇总，Add 按钮可再次点击。

以上都是合成数据。

## 待现场验证

- 新的翻页逻辑在真实账户上完整扫一遍：用 v1.8.1 扫描，看是否成功、数量是否接近网站显示的总数。
- BankAmeriDeals 当时具体是哪个错误（资格变化、HTTP 错误还是回读未确认）没有看到原文；新流程覆盖了这三种情况。
- 各银行激活后读回是否有延迟。如果有，第一次读回可能显示未激活，导致第二次发送；这次重发在三家的真实接口上是否无害还没验证。
- US Bank 单个优惠的 GraphQL 错误是否真的只跟这个优惠有关。
- Kroger 单张券的 HTTP 4xx（比如达到领取上限）的真实响应。
