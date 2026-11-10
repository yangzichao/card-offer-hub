# 优惠金额与小额筛选

目标：每个优惠显示「比例」和「总额」，面板里可以按这两个数藏掉小羊毛，添加时跳过它们。适用 Amex、Chase、Citi、BankAmeriDeals、US Bank、Wells Fargo；Kroger 不做。

## 金额从哪里来

金额尽量读银行 API 的结构化字段，不解析文案。下表依据本机 HAR（2026-09 抓取，未提交），字段名和取值方式已对照，真实网站当前是否仍是这样没有重新核对。

| 银行 | 类型 | 数值 | 上限 / 最低消费 |
| --- | --- | --- | --- |
| Chase | `offerDetails.offerOptions[0].offerRewardTypeCode`：`PERCENTAGE` / `DOLLAR` | `offerAmount` | `maximumRewardOfferAmount`、`minimumSpendingAmount`，0 表示没有。170 个优惠都只有一个 option；多于一个时记为未知 |
| US Bank | `ad.reward.rewardType`：`PERCENT_AMOUNT_PURCHASE` / `FIXED_AMOUNT_PURCHASE` | `rewardAmount` | `maxRewardAmount`、`purchaseRequirement.minSpendAmount`。大多数优惠的最低消费是 0.2（任意消费），低于 $1 的最低消费视为没有 |
| BankAmeriDeals | `reward_type`：`FIXED` / `PERCENTAGE` | `reward_value`（美元）/ `reward_rate`（%） | `minimum_spend`；`maximum_reward_per_transaction` 只在 `maximum_redemptions === 1` 时算总额；否则从文案读。headline 不可靠（如 "Shop and Earn Today"），不用来算金额 |
| Wells Fargo | `amountType`：`%` / `$` | `dealAmount`（数字字符串） | 只在 `longDescription` 文案里 |
| Citi | `offerDiscountType`：`ABSOLUTE` / `PERCENTAGE` | 没有数值字段，从 `offerTitle` 读（695 个优惠只有 `"$30 Back"`、`"5% Back"` 两种格式）。title 与类型不一致记为未知 | 列表里没有 |
| Amex | 没有 | 没有，只能读 `shortDescription` | 同左 |

文案只认明确的句式：
- Wells Fargo / BankAmeriDeals（`shared/offers/reward-text.js`）："with a $7.00 cash back maximum"、"until a $10.00 cash back maximum is reached"、"when you spend $75"。
- Amex（`issuers/amex/amex-offer-lite/src/core/offer-reward.js`）："Spend $100 or more, earn $20 back[, up to 3 times (total of $60)]"、"Earn 10% back …, up to [a total of] $250"、"Earn 10% back …"。积分类和其他写法记为未知。HAR 里只有 3 条 Amex 描述，句式是否覆盖大多数 Amex 优惠还没核对。

## 比例和总额怎么算

每个优惠归一成 `{ kind: 'percent' | 'fixed', amount, maxReward, minSpend }`（`shared/offers/reward-value.js`），没写的项为 `null`，不猜。

- 比例：百分比优惠直接用比例；固定金额优惠 = 返现 ÷ 最低消费，没有最低消费就是未知。
- 总额：固定金额优惠是返现金额（多次可用时是写明的总额）；百分比优惠是上限，没有上限就是未知。

行上的显示：`10% back · up to $7`、`5% back · no cap listed`、`$20 back on $100 (20%)`、`$5 back each on $15 (33.33%) · up to $25 total`。

## 筛选

搜索框下面的 **Hide under [ ] % back / $[ ] total**：
- 比例已知且低于门槛、或总额已知且低于门槛的优惠被隐藏。比例或总额未知的不因为这个门槛被隐藏（例如没有上限的百分比优惠不会被总额门槛隐藏），宁可多显示，不能漏掉。
- **被藏的优惠添加时跳过。** 规则在 `createHubWorkflow` 的 `keepInPlan`（`shared/workflows/controller.js`）里，按钮计数（`preview()`）和添加队列（`plan()`）都经过它，所以六家所有添加入口一致：Add all、Chase / Citi 的 Add saved offers 和 Refresh & add offers、Amex 的 Add all、US Bank 的 Select all 与 Add selected offers（之前勾选、后来被藏的也跳过）。隐藏时提示 "N small offers hidden and skipped by Add. Clear the filter to add them."
- 想加小的：清空门槛再点一次添加。效果就是先加大的、再加小的。
- `keepInPlan` 只能从模板计划里去掉优惠，不能加进别的。Amex 先按卡片优先级分配，再过滤：被藏的组整组跳过，不会改投到优先级更低的卡（同一组的描述相同，金额也相同）。
- 已开始的任务不受门槛变化影响：`assertAction` 对照的是过滤前的计划，跑到一半改门槛不会中断，也不会改变本轮队列，和搜索一样。
- 跨银行搜索和导出不受影响。筛选本身不发任何请求。

## 存储

- Amex 以外五家的 workspace 优惠记录新增可选字段 `reward`。schema 版本不变：1.9.0 之前的存档没有这个字段，读取时视为 `null`（未知），下一次扫描后才有金额；字段值不合法时按损坏存档处理，原值保留并提示错误。旧版本读取新存档时忽略这个字段。
- Amex 不改存储，显示时从已保存的描述现算。
- 筛选门槛每家一个 key：`${script-id}:reward-filter`，`{ schemaVersion: 1, minRate, minTotal }`。读不懂的旧值原样保留，本次访问内筛选仍可用，面板上提示无法保存。

## 验证

- `tests/build/offer-reward-model.test.cjs`：金额校验、比例/总额、显示文案、文案中的上限和最低消费、筛选规则、筛选存储（含未知版本保留、保存失败）、可选 `reward` 字段与旧存档。
- `tests/build/offer-reward-banks.test.cjs`：六家从各自原始字段取金额，含 Citi title 与类型冲突、US Bank 0.2 最低消费、BankAmeriDeals 多次可用的单笔上限、Amex 积分优惠。
- `tests/build/workflow-templates.test.cjs`：`keepInPlan` 缩小计数和队列、不扩大模板计划、已开始的任务仍能通过 `assertAction`；Amex 组合型里被藏的组不改投别的卡。
- `tests/usbank/workflows.test.cjs`：Select all 不选被藏的优惠；之前勾选、后来被藏的优惠 Add selected 跳过；未知金额保留；清空门槛后 Add all 加上剩下的。
- `tests/amex/enrollment-plan.test.cjs`：按比例、按总额跳过；积分类（未知）保留；共享优惠不改投。
- `tests/build/browser-reward-filter.cjs`：Chromium 合成 Deals 页面上显示金额、按比例和总额隐藏、未知值保留、Add all 计数和实际 PUT 只含显示的优惠、清空门槛后计数恢复、重载后筛选和金额恢复、筛选不发请求、320px 宽度。

以上都是合成数据。

## 待现场验证

- 各银行当前接口是否仍返回上表字段（尤其 Chase 换网关后、BankAmeriDeals `offers-search` 列表是否带 `reward_type` / `reward_rate`）。
- Amex 真实描述的句式覆盖率。
- US Bank 0.2 最低消费是否确实表示「任意消费」。
- 真实网站上设了门槛后 Add all 只加显示的优惠（各家添加流程本身没改，只是队列变短）。
