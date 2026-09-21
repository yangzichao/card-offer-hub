# 按银行自动调速

> 更新：Chase 从 1.6.0 起支持点击添加及逐条状态回读，见 [当前接口说明](chase-api-contract.md)。下文关于 Chase 只读的描述为该次历史发布状态。
实现 [issue #1](https://github.com/yangzichao/card-offer-hub/issues/1)：一个公共算法，六家银行各自学习、各自缓存。用户照常选择操作范围并点击开始，无需选择速度。扫描、添加、添加后核验共用该银行的串行请求槽；Chase 保持只读。

## 调整规则

以下数字是客户端保守策略，不是银行公布或已验证的限额。

| 条件 | 行为 |
| --- | --- |
| 无学习记录 | 上一个响应处理完成后等待 1000ms |
| 至少 30 个有效成功样本，并积累至少 60 秒有效运行时间 | 间隔减少 50ms，重新开始观察窗口，最低 500ms |
| HTTP 429 | 间隔翻倍，最高 15000ms；立即保存负反馈和冷却，结束本轮 |
| 重复 429 | 客户端冷却按连续次数翻倍，最多 1 小时 |
| 最近发生过 429 | 至少 10 分钟内不提速；之后仍须完成一个稳定窗口才提速并清除连续限流计数 |
| HTTP 错误、网络错误、超时、未确认结果、无效响应 | 清除提速证据，保持当前间隔，不推断成银行限流 |
| 超过 7 天未使用的缓存 | 清除样本和稳定记录；曾学到更快速度的回到 1000ms，更慢的保留；冷却保留 |

冷却取已有期限、服务器 `Retry-After` 和客户端期限中的最大值。支持秒数和 HTTP 日期；服务器要求的长冷却不受 1 小时客户端上限限制。Amex 的首次客户端冷却为 2 分钟，其余银行为 5 分钟。首版只将明确 HTTP 429 作为限流信号，未推测任何银行业务错误码。

有效时间只来自成功请求的耗时，以及同一轮请求之间最多一个当前间隔的等待。跨任务闲置、冷却和长时间后台延迟不会直接累加成稳定运行时间；单次请求耗时最多计入该银行请求超时值。成功样本数在 30 封顶，时间在 60 秒封顶，两个条件都满足才调速。

适配器负责验证响应，不把任意 HTTP 200 当作成功。Citi、Wells Fargo、Amex 添加需要各自明确成功信号。BoA 和 US Bank 的写入 acknowledgement 是中性结果，不增加样本；核验成功才计入样本，核验未确认清除证据。读取也必须通过银行响应结构与归属检查。失败不自动重试，冷却结束不自动恢复。

## 代码职责

- `shared/pacing/policy.js`：版本化策略和上下界；银行可注入已有冷却默认值与请求超时。
- `shared/pacing/learning.js`：纯状态转换，不发请求、不读写存储、不操作界面。
- `shared/pacing/controller.js`：计算有效运行时间、接收结构化结果、保存到银行内存状态。
- `shared/pacing/profile.js`：校验、schema 1 迁移与陈旧记录处理。
- `shared/runtime/request-scheduler.js`：执行动态等待、持有请求槽直到完整响应及验证完成、预留请求期限。
- `shared/persistence/pacing-storage.js`：读取最新记录、校验 revision、保存 schema 2、报告存储错误。
- 银行传输层：报告 `success`、`failure`、`neutral`、`limited`；workflow 继续负责卡片或账户范围、优惠分配和恢复。

正常请求结束时保存样本和下一次请求期限。请求前先保存超时占位，页面中断不能跳过等待。429 在读取响应头后立即保存，再消费响应正文；正文错误也不会丢掉负反馈。界面只增加默认折叠的 **Automatic request speed**，显示当前间隔、窗口样本数及最后限流时间。

1.5.1 增加 **Save debug log**，从上述详情下载最近 200 条经过字段白名单处理的调速事件；日志本地保存并可跨页面刷新恢复。操作方法与记录范围见[调试日志](debug-logs.md)。

## 本地持久化

每家使用自己的 `<issuer-script-id>:pacing` GM storage 键。schema 2 保存 `policyVersion`、`revision`、`currentGapMs`、`lastStableGapMs`、`successCount`、`observedActiveMs`、`lastRateLimitAt`、`consecutiveLimits`、`updatedAt`、`nextRequestAt`、`cooldownUntil`，不保存响应、账户或认证信息。

- 旧 schema 1 的两个截止时间保留；新记录从保守默认值开始，不伪造历史成功。
- Amex 首次读取旧网站 localStorage 冷却；用户操作第一次成功保存后由 GM storage 接管。页面加载只读，不写迁移记录，也不发请求。
- 未知 schema、未知策略版本、损坏记录保留原样并阻止网络请求。当前策略为 v1；未来变更参数语义须升级版本并编写明确迁移，不能套用新规则解释旧经验。
- 同源页面在银行 Web Lock 内读取最新策略后运行；Amex 也使用同一规则。revision 额外拒绝旧页面覆盖新记录；它不是跨域原子锁。
- 保存失败在界面显示并阻止后续请求，修复存储后重新加载页面。

缓存仅代表本浏览器的观察。不同设备、浏览器、银行 App、跨域页面和网站自身的请求不受本脚本同源锁统一控制；每次仍需处理新的限流反馈。

## 验证与边界

合成测试覆盖调速窗口、有效时间、上下界、反复限流、冷却恢复、两类 Retry-After、schema 迁移、过期、未知版本、写入失败、旧页面覆盖保护，以及六家银行响应反馈。浏览器回归从正常点击开始完成一批 Citi 添加，验证提速、本地保存、页面重载、429 后减速和无自动恢复。所有网络被拦截，等待使用虚拟时间。

1.5.0 发布前本地验证：`npm run build` PASS；`npm run check` PASS；`npm test` PASS（375 项）；`npm run test:browser` PASS（15 组浏览器回归，另含 11 个 Gherkin 场景、106 个步骤）。发布复验使用项目锁定依赖直接执行 `npm run test:browser`；也支持以下外部运行时命令：

```sh
PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright npm run test:browser
```

待现场验证：六家银行真实会话对不同间隔的响应、实际 429 频率、Tampermonkey 多标签页与存储行为。离线回归不能证明真实银行限额，也不保证完全避免限流。
