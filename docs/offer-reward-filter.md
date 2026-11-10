# 优惠金额与小额筛选

目标：每个优惠显示「比例」和「总额」，面板里可以按这两个数藏掉小羊毛，添加时跳过它们。适用 Amex、Chase、Citi、BankAmeriDeals、US Bank、Wells Fargo；Kroger 不做。

1.10.0 起列表改成 To add / Added / All 三个 tab，加最低金额、排序和「无标价优惠」开关，并修了 1.9.0 在 US Bank 上筛选完全不起作用的问题（见下方「1.9.0 的 US Bank 问题」）。

## 金额从哪里来

金额尽量读银行 API 的结构化字段，不解析文案。下表依据本机 HAR（2026-09 抓取，未提交），字段名和取值方式已对照，真实网站当前是否仍是这样没有重新核对。

| 银行 | 类型 | 数值 | 上限 / 最低消费 |
| --- | --- | --- | --- |
| Chase | `offerDetails.offerOptions[0].offerRewardTypeCode`：`PERCENTAGE` / `DOLLAR` | `offerAmount` | `maximumRewardOfferAmount`、`minimumSpendingAmount`，0 表示没有。170 个优惠都只有一个 option；多于一个时记为未知 |
| US Bank | `ad.reward.rewardType`：`PERCENT_AMOUNT_PURCHASE` / `FIXED_AMOUNT_PURCHASE` | `rewardAmount` | `maxRewardAmount`、`purchaseRequirement.minSpendAmount`。大多数优惠的最低消费是 0.2（任意消费），低于 $1 的最低消费视为没有。GraphQL 只返回查询里点名的字段，这几个字段必须写进 `api/queries.js` 的查询 |
| BankAmeriDeals | `reward_type`：`FIXED` / `PERCENTAGE` | `reward_value`（美元）/ `reward_rate`（%） | `minimum_spend`；`maximum_reward_per_transaction` 只在 `maximum_redemptions === 1` 时算总额；否则从文案读。headline 不可靠（如 "Shop and Earn Today"），不用来算金额 |
| Wells Fargo | `amountType`：`%` / `$` | `dealAmount`（数字字符串） | 只在 `longDescription` 文案里 |
| Citi | `offerDiscountType`：`ABSOLUTE` / `PERCENTAGE` | 没有数值字段，从 `offerTitle` 读（695 个优惠只有 `"$30 Back"`、`"5% Back"` 两种格式）。title 与类型不一致记为未知 | 列表里没有 |
| Amex | 没有 | 没有，只能读 `shortDescription` | 同左 |

文案只认明确的句式：
- Wells Fargo / BankAmeriDeals（`shared/offers/reward-text.js`）："with a $7.00 cash back maximum"、"until a $10.00 cash back maximum is reached"、"when you spend $75"。
- Amex（`issuers/amex/amex-offer-lite/src/core/offer-reward.js`）："Spend $100 or more, earn $20 back[, up to 3 times (total of $60)]"、"Spend $1,000 or more, earn $200"（没有 back）、"Spend $98 on Example, earn $49 back"、"Spend $150 or more, earn 20% back[, up to a total of $50]"、"Earn 10% back …, up to [a total of] $250"、"Earn 10% back …"。积分类和其他写法记为未知。对照本机 2025-11 的 Amex HAR（未提交）：279 条描述里读出 261 条，剩下的是积分、旅行权益和促销文案。

## 比例和总额怎么算

每个优惠归一成 `{ kind: 'percent' | 'fixed', amount, maxReward, minSpend }`（`shared/offers/reward-value.js`），没写的项为 `null`，不猜。

- 比例：百分比优惠直接用比例；固定金额优惠 = 返现 ÷ 最低消费，没有最低消费就是未知。
- 总额：固定金额优惠是返现金额（多次可用时是写明的总额）；百分比优惠是上限，没有上限就是未知。

行上的显示：`10% back · up to $7`、`5% back · no cap listed`、`$20 back on $100 (20%)`、`$5 back each on $15 (33.33%) · up to $25 total`。

## 列表

搜索框下面依次是：

- **To add / Added / All** 三个 tab，各带计数（计数已扣掉被最低金额藏起来的优惠）。默认 To add。
  - To add：还没在卡上、跟你有关的优惠——Add 能加的、Needs review / Unconfirmed、BankAmeriDeals 的 Not added、Chase 要去 Chase 页面加的。Amex 按过滤前的添加计划判断，再加上 UNCONFIRMED / FAILED。
  - Added：已添加（Amex 含 On another card）。
  - All：再加上 Skipped（不符合条件、过期、informational）。
  - tab 只影响列表显示，不影响添加队列。To add 空了时提示 "Nothing left to add. See All for the other N offers."
- **Minimum total cash back**：Any total / Total $5+ / $10+ / $20+ / $50+ / $100+。
- **Minimum percent back**：Any rate / Rate 3%+ / 5%+ / 10%+ / 15%+ / 20%+。存档里的值不在预设里时也会显示成一个选项。
- **Sort offers**：Best value first（默认，总额高的在前，再比比例）/ Highest rate first / Bank order。未知值排最后。
- **Keep offers with no listed value**：设了最低金额才出现，默认勾上。勾上时比例或总额未知的优惠留下（例如没有上限的百分比优惠不会被总额门槛藏掉）；取消后它们也被藏、Add 也跳过。
- 一行说明：例如 "2 offers below your minimum are hidden; Add skips them. 2 offers with no listed value are kept."

每行优惠都有一个金额标签：`9% back · no cap listed`、`$15 back on $75 (20%)`，读不出金额时显示 "No listed value"。

## 添加时跳过被藏的优惠

- 规则在 `createHubWorkflow` 的 `keepInPlan`（`shared/workflows/controller.js`）里，按钮计数（`preview()`）和添加队列（`plan()`）都经过它，所以六家所有添加入口一致：Add all、Chase / Citi 的 Add saved offers 和 Refresh & add offers、Amex 的 Add all、US Bank 的 Select all 与 Add selected offers（之前勾选、后来被藏的也跳过）。
- 最低金额把能加的全藏了时，按钮计数为 0，按钮下写明原因："Your minimum value hides all N offers you could add. Lower it below to add them."（`skippedCount()`）。
- 想加小的：把最低金额调回 Any 再点一次添加。效果就是先加大的、再加小的。
- `keepInPlan` 只能从模板计划里去掉优惠，不能加进别的。Amex 先按卡片优先级分配，再过滤：被藏的组整组跳过，不会改投到优先级更低的卡（同一组的描述相同，金额也相同）。
- 已开始的任务不受选项变化影响：`assertAction` 对照的是过滤前的计划，跑到一半改门槛不会中断，也不会改变本轮队列，和搜索一样。
- 跨银行搜索和导出不受影响。列表选项本身不发任何请求。

## 1.9.0 的 US Bank 问题

1.9.0 在 US Bank 上所有优惠都显示 "No listed value"，筛选什么都藏不掉。原因：US Bank 用 GraphQL，服务端只返回查询里点名的字段，而扫描查询只要了 `reward { rewardType activationModel … }`，没要 `rewardAmount`、`maxRewardAmount`、`purchaseRequirement.minSpendAmount`。离线测试直接往合成响应里塞了这些字段，不看查询内容，所以没发现。修法：按 HAR 里网站自己的查询补上字段；`tests/build/offer-reward-banks.test.cjs` 新增一条回归，检查实际发出的扫描请求里写了这些字段。

## 存储

- Amex 以外五家的 workspace 优惠记录新增可选字段 `reward`。schema 版本不变：1.9.0 之前的存档没有这个字段，读取时视为 `null`（未知），下一次扫描后才有金额；字段值不合法时按损坏存档处理，原值保留并提示错误。旧版本读取新存档时忽略这个字段。
- Amex 不改存储，显示时从已保存的描述现算。
- 列表选项每家一个 key：`${script-id}:reward-filter`，`{ schemaVersion: 2, minRate, minTotal, keepUnlisted, sort, show }`（`shared/persistence/offer-view-storage.js`）。1.9.0 的 `{ schemaVersion: 1, minRate, minTotal }` 读取时前向迁移，其余选项取默认值，下次改选项时写成 v2。读不懂的值（未知版本、格式错误）原样保留，本次访问内选项仍可用，面板上提示无法保存。

## 验证

- `tests/build/offer-reward-model.test.cjs`：金额校验、比例/总额、显示文案、文案中的上限和最低消费、最低金额规则与「无标价」开关、三种排序、tab 分组与计数、空列表提示、列表选项存储（v1 迁移、未知版本保留、保存失败）、可选 `reward` 字段与旧存档。
- `tests/build/offer-reward-banks.test.cjs`：六家从各自原始字段取金额，含 Citi title 与类型冲突、US Bank 0.2 最低消费、US Bank 扫描查询里写了金额字段、BankAmeriDeals 多次可用的单笔上限、Amex 积分优惠和新增的几种 Amex 句式。
- `tests/build/workflow-templates.test.cjs`：`keepInPlan` 缩小计数和队列、不扩大模板计划、已开始的任务仍能通过 `assertAction`；Amex 组合型里被藏的组不改投别的卡。
- `tests/usbank/workflows.test.cjs`：Select all 不选被藏的优惠；之前勾选、后来被藏的优惠 Add selected 跳过；未知金额保留；清空门槛后 Add all 加上剩下的。
- `tests/amex/enrollment-plan.test.cjs`：按比例、按总额跳过；积分类（未知）保留；共享优惠不改投。
- `tests/build/browser-reward-filter.cjs`：Chromium 合成 Deals 页面上 tab 计数、默认按价值排序、每行金额标签、最低金额与说明文字、无标价优惠留下或藏起、Add all 计数和实际 PUT 只含显示的优惠、计数为 0 时的原因、重载后选项恢复、选项不发请求、Bank order、320px 宽度。
- 其他银行的浏览器回归在 To add 默认 tab 下核对添加后的空列表提示，再切到 All 核对全部行。

以上都是合成数据。

## 待现场验证

- US Bank 补上字段后真实网站是否返回金额（查询字段照抄网站自己的查询，但改过的查询没在真实账户上跑过）。
- 各银行当前接口是否仍返回上表字段（尤其 Chase 换网关后、BankAmeriDeals `offers-search` 列表是否带 `reward_type` / `reward_rate`——HAR 里只有 `offers-page` 和 `offers-details`）。
- Amex 当前描述的句式覆盖率（2025-11 的 HAR 是 261/279）。
- US Bank 0.2 最低消费是否确实表示「任意消费」。
- 真实网站上设了最低金额后 Add all 只加显示的优惠（各家添加流程本身没改，只是队列变短）。
