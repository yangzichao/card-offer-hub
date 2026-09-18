# 旧版多卡登记与 v4.5 的对照

> v5.0 起，一个 Offer 只会被添加到一张卡（见 [修复记录](amex-repair-plan.md)）。下面这份对照记录的是 v4.5 当时的调查：用户报告的「新版只成功一张卡」在 v4.5 是待查故障，在 v5.0 是设计行为，因此不能再拿这个现象判断 Card 接口是否接受多卡。登记 body、endpoint 和严格 `isEnrolled === true` 的结论在 v5.0 仍然有效。

## 对照来源与结论

用户提供的 [GitHub 脚本](https://github.com/yangzichao/zichao-utils/blob/main/tamper-monkey-scripts/amex-offer-lite/amex-offer-lite.user.js) 在本次工具访问中返回 404，GitHub CLI 也未登录。因此实际读取的是本地同仓库的 v3.4，提交 `90322cb557aceaeaf4ca6878ceb55846aae4bd5e`，即此项目最初的提取来源，不能声称已经核对 GitHub 当前 main。

v4.3/v4.4 的 JavaScript 调度确实已经让同 Offer 跨卡并发，但迁移时同时把登记接口从 `CreateCardAccountOfferEnrollment.v1` 改成了 `CreateOffersHubEnrollment.web.v1`。证明 fetch 同时发出，只能证明调度；不能证明两个登记接口对多卡的处理等价。当时用户报告新版实际仅一张卡成功，是这条调查的起点；v5.0 已主动改成一个 Offer 只加一张卡，这个现象不再是故障证据。

## 具体差异

| 项目 | 原始 v3.4 | v4.3/v4.4 | v4.5 |
| --- | --- | --- | --- |
| 同 Offer 调度 | 逐卡 map 立即发起，Promise.all 等待 | 逐卡 map 立即发起，Promise.allSettled 等待 | 保持 allSettled，保留所有已发出请求的结果 |
| 登记接口 | CreateCardAccountOfferEnrollment.v1 | CreateOffersHubEnrollment.web.v1 | 恢复原始 Card 接口 |
| Offer 字段 | identifier | offerId | identifier，使用各卡扫描得到的对应 ID |
| 额外 body 字段 | locale、requestDateTimeWithOffset、userOffset | locale、requestType、offerUnencrypted、synchronizeOnly、enrollmentTrigger | 恢复时间、时区，去除 Hub 专属登记字段 |
| accountNumberProxy | 每张卡自己的 token | 每张卡自己的 token | 保持 |
| correlation ID | 每请求独立 UUID | 每请求独立 UUID | 保持 |
| 认证和 headers | credentials: include；x-requested-with；若猜到 token 则带 Bearer | credentials: include；ce-source: WEB | 保留捕获成功请求的 cookie/ce-source，不扫描网站存储猜 token |
| 不同 Offer 间隔 | 通常 3 秒，失败时延长 | 上组最后响应后 15 秒 | 保持 15 秒 |
| 自动重试 | 429/网络错误最多 5 次 | 无自动重试 | 保持无自动重试，不向两个接口重复提交 |
| 成功判断 | isEnrolled \|\| true，false/缺失也会被误判；HTTP 200 非 JSON 也假定成功 | Hub SUCCESS 加匹配 ENROLLED Offer | 仅 literal isEnrolled === true；false 明确失败，缺失/无效类型/坏 JSON 未确认 |

旧脚本没有额外的多卡原子提交 API、统一屏障或浏览器级同时到达保证；Promise.all 与 allSettled 都在等待已经发出的 Promise，二者本身不会决定服务端是否接受多张卡。

## HAR 的真实证据

同一份 `global.americanexpress.com.har` 中确实存在网站发出的两个独立登记操作：

- 02:23:34.239 UTC：Card 登记，HTTP 200，响应 `{ "isEnrolled": true }`。
- 02:24:19.953 UTC：Hub 登记，HTTP 200，响应 SUCCESS。
- 两次操作属于同一张卡，但 Offer ID 不同、相隔约 45.7 秒；不能把它们解释为一次登记必须调用两个接口。
- Card 成功登记的 `identifier` 随后出现在 Hub 已添加列表中，`offerId` 完全相同，状态 ENROLLED。因此在这个实际样本中，旧登记 ID 与 Hub 读取 ID 可以对应。
- Card 请求 body 的五个字段与旧脚本一致：`accountNumberProxy`、`identifier`、`locale`、`requestDateTimeWithOffset`、`userOffset`。
- 捕获的成功 Card 请求含 `ce-source`、`one-data-correlation-id`；没有 Authorization，也没有 x-requested-with。该成功样本不依赖旧脚本猜测 Bearer token 的分支。

这些证据支持恢复原始登记协议，同时继续用 Hub 读取完整 Offer 列表。它们尚不能证明所有 Hub Offer ID 都能由旧接口登记，也不能证明新版现场仅成功一卡的唯一原因就是接口切换；目前没有那次失败的响应可供核对。

## 改动与验证

v4.5 保留 whitelist、Offer 持久化、全量读取、同 Offer 并发、不同 Offer 限速和无自动重试，恢复原始 Card 登记 body/endpoint。每组日志记录计划并发请求数及接口；每张卡记录成功/失败/未确认和 isEnrolled 的明确值，HTTP 失败也会单独记录。v5.0 去掉了其中的并发部分：登记严格串行，每个 Offer 只发一张卡；body/endpoint 和 isEnrolled 判定未变。

`npm run build`、`npm run check`、`npm test`、`npm run test:browser`、`node tests/amex/verify-har.cjs global.americanexpress.com.har`、`git diff --check` 通过。92 项单元测试、4 个 Chromium 场景；HAR 验证读取真实捕获的旧接口 body、isEnrolled 响应及 Hub ID 对应关系。浏览器测试是合成接口回归，不是实际多卡登记成功证明。

新增回归专门模拟“发出三张卡请求，服务端只确认一张”，检查 UI 只能记录一张成功、另两张 FAILED，并记录 isEnrolled=false。禁止恢复旧版的成功误报，也不通过自动重试掩盖第一次响应。

仍待现场确认：更新脚本后，先手动刷新先前 FAILED/UNCONFIRMED 的 Offer 状态，再按实际 eligible 卡数手动登记一个 Offer；查看各卡的返回证据。不要仅依据全绿 UI 或 Promise 数量宣称跨卡登记成功。
