# Amex Offer Lite 修复记录

## 1.6.4：Add all 不再被单条结果卡住，已注销的卡不再列出

- 根因一：旧版把登记的每个非成功回答都当成整批失败。`isEnrolled: false` 抛出「Enrollment was not confirmed」，后面的 Offer 一个都不发；这个 Offer 被标为 FAILED 交给下一张卡，下一次点击很可能又得到同样的回答。结果是每次点击都停在下一个非成功回答上；Offer 多、这类回答又常见时，要反复点很多次。
- 证据：2026-09-10 的本地复现抓包里有 21 个登记 POST，16 个返回 `isEnrolled: false` 加 `explanationCode: "PZN4107"`（Card member Already added the offer on another card），5 个返回 `isEnrolled: true`。这份抓包来自旧的跨卡并发登记（同一 Offer 在同一秒发给 5–7 张卡），所以这个比例不代表当前版本；它证实的是这个回答的结构和含义。
- 修复：`PZN4107` 记为新状态 `ON_OTHER_CARD`。它不算这张卡添加成功，但这个 Offer 视为已处理，planner 不再分配给别的卡。其他 `isEnrolled: false` 仍记为 FAILED，要等下一次手动点击才换卡。
- Add all 对单条 HTTP 200 回答（ENROLLED、ON_OTHER_CARD、FAILED、UNCONFIRMED）都记录后继续下一个，每个 Offer 只发一次。连续 3 个未确认且还有剩余时暂停，剩下的保持可添加。HTTP 错误、网络故障、超时、非 JSON、429、Stop 和存储故障仍停止本轮。
- 结束统计分开列出已添加、已在另一张卡、被拒和未确认的数量，进度按已处理数计。Activity 附带简短的 explanationCode，只记录形如 `PZN4107` 的代码，不记录服务器返回的自由文本。
- Offer 快照 schemaVersion 保持 2：`ON_OTHER_CARD` 是新增的枚举值，旧快照全部照常读取，不需要迁移。
- 根因二：卡片检测不看卡片状态。9 月页面数据的 92 张卡里有 84 张 `account_status` 为 `Canceled`，全部出现在卡片列表中。现在按 Amex 自己卡片切换器的规则过滤：`status.account_status` 或 `status.card_status` 含 CANCELED 就不列出；已注销主卡下仍有效的附属卡照常列出。已保存的旧卡列表不带状态，需要手动点一次 **Refresh cards**。
- 验证：`npm run build`、`npm run check`、`npm test`（438 项）、`npm run test:browser`（17 组浏览器回归及 17 个 Gherkin 场景、187 个步骤）全部 PASS。新增 `tests/amex/enrollment-continuation.test.cjs` 和 `tests/amex/browser-enrollment-continuation.cjs`；后者在 1.6.3 的产物上先因列出已注销卡失败，去掉这条断言后停在「Enrollment was not confirmed. Scan again before trying it again. 0 offers added.」，在 1.6.4 上通过。`node tests/amex/verify-har.cjs` 对 9 月 HAR 识别 8 张卡。以上都是离线回归，真实账户上的结果见下方「待现场验证」。

## v5.0：一个 Offer 只加一张卡，按可拖动的卡片优先级分配，取消并发

- 取消同 Offer 跨卡并发。登记改为严格串行：一个请求一张卡，从上一个响应完成起至少 15 秒。请求槽的语义因此简化为「一个槽一个请求」。
- 新增卡片优先级：一次性设置，拖动手柄或 ↑ / ↓ 按钮都改同一份顺序，和 whitelist 存在同一份快照里（`schemaVersion` 1 → 2，新增 `priorityOrder`）。v1 快照按当时的检测顺序补初始名次，升级不重排也不发请求。新卡一律排在末尾；暂时消失的卡保留名次，回来后回到原位。
- 分配规则：同一个 Offer 只加到优先级最高且当前 eligible 的那张卡；只有一张卡有的 Offer 必然加到那张卡。任意 whitelist 卡上已 ENROLLED 或 UNCONFIRMED 的 Offer 不再分配给其他卡；扫描不完整或明确 FAILED 的卡把顺位让给下一张。
- **Add all offers** 一次跑完整个计划，中途无人值守；失败、未确认或 429 终止本轮，已成功的结果保留。Stop 仍然立即阻止后续请求。
- 扫描顺序也跟随优先级，最靠前的卡先扫。Offer 卡片写明 Goes to / Already on / Unconfirmed on 哪张卡，汇总给出本轮实际会添加的 Offer 数。
- 源码拆分：新增 `core/card-priority.js`、`ui/card-priority.js`、`workflows/enrollment-plan.js`、`workflows/enrollment-requests.js`，删除 `workflows/enrollment-batches.js`。
- 构建、源码一致性、124 项单元测试、4 个 Chromium 场景通过；浏览器回归包含真实鼠标拖动改变优先级并在 document reload 后保持。实际现场添加结果仍未验证。

## v4.5：恢复旧版 Card 登记协议，区别并发调度与服务端接受

- 用户报告 v4.4 实际仅一张卡登记成功。对照本地来源 v3.4（90322cb），确认迁移时除扫描 API 外，也将旧 `CreateCardAccountOfferEnrollment.v1` 登记换成了 Hub 登记。并发测试通过不能证明两个服务端接口的多卡语义等价。
- 新 HAR 同时捕获了 Card 接口成功登记及随后 Hub 已添加列表的对应 Offer，证实旧登记协议在该样本中仍有效。两次登记对应不同 Offer，相隔约 45.7 秒，不是必须依次双写的证据。
- 恢复 Card endpoint、identifier、requestDateTimeWithOffset、userOffset，保留 cookies、ce-source 和每请求独立 correlation UUID。捕获的成功请求没有 Bearer Authorization/x-requested-with，不恢复扫描本地存储猜会话 token。
- 成功判断改为严格 `isEnrolled === true`；false 为 FAILED，未知为 UNCONFIRMED，不恢复旧版 `isEnrolled || true` 或 HTTP 200 假定成功错误。
- Activity 增加每组并发卡数及逐卡返回证据。保持全量 Hub 读取、whitelist/Offer 持久化、同 Offer 并发、不同 Offer 15 秒间隔与无自动重试，没有双接口 fallback。
- 构建、源码一致性、92 项单元测试、4 个 Chromium 场景、HAR 契约核对与 diff 检查通过；实际多卡接受结果仍未验证，不能宣称现场问题已彻底解决。详见 [对照说明](amex-enrollment-comparison.md)。

## v4.4：Offer 先持久保存，需要时再手动刷新

- 补齐之前遗漏的 Offer 持久化：每卡完整列表、登记状态、扫描完整性和扫描时间保存至独立 GM 快照。刷新自动恢复显示、跨卡统计和手动登记能力，不发出业务请求，也不设置自动刷新或缓存过期。
- 手动 Scan whitelist 更新 Offer。扫描启动不再清空全部结果；有保存结果时，只有两个视图完整成功才替换该卡数据，失败保留旧结果并标为 Incomplete。首次扫描的部分进度也会保存。
- 取消 whitelist 或强制刷新卡目录不再删除 Offer；展示/请求范围始终取当前卡目录和 whitelist 的交集，重新勾选可复用保存结果。
- 并发登记前一次保存所有待确认项，每张卡结束后独立保存状态。页面重载期间尚未确认的登记恢复为 UNCONFIRMED；保存待确认状态失败时整组不发送，防止重载后把已发送请求当作可重复添加的旧 eligible。
- UI 显示 Last scan 和保存失败信息；保存结果可直接用于手动登记，实际不完整扫描或不确定登记仍要求手动扫描核实。
- `npm run build`、`npm run check`、`npm test` 全部通过，80 项单元测试。四个 Chromium 场景通过，包括实际 document reload 后恢复 Offer、从缓存登记、登记结果再次恢复、失败刷新保留结果、手动刷新替换、登记中重载恢复为未确认。
- 浏览器回归仍使用合成 Amex 响应与模拟 GM 存储；没有操作真实账户或替换用户已安装脚本。v4.3 未写入存储的旧结果无法恢复，需在 v4.4 首次扫描建立快照。

## v4.3：同 Offer 跨卡并发，不同 Offer 限速

- 登记由逐卡串行改为按已有 Offer 分组执行：同组所有 eligible whitelist 卡一次并发发出；不同卡的 Offer ID 仍各自用于请求和确认。
- 速率调度锁由一个请求扩展为一个完整 Offer 组。等全部响应结束，再等待至少 15 秒启动下一组；卡片检测和扫描继续逐请求串行限速。
- 使用 Promise.allSettled 保证单卡错误不会提前释放锁或丢失其余结果。失败、未确认、429 或 Stop 会阻止下一组；已经发出的同组请求继续记录各自结果，没有自动重试。
- 并发 429 取最长冷却时间，较晚的短 Retry-After 不得缩短已有冷却。每张卡、每个 Offer 最多一个登记请求，重复展示条目的状态同步更新。
- 点击 Add 或批量 Add eligible 时确定执行范围，执行中搜索过滤不会改变队列。扫描完整性、whitelist 和严格成功确认继续在请求边界校验。
- 69 项单元测试通过，覆盖响应尚未返回时组内请求全部发出、不同组从最慢响应后等待 15 秒、混合成功/失败、429、Stop、重复条目和筛选变化。
- 三个 Chromium 场景通过；七卡场景新增真实 DOM Add 操作，拦住全部响应后确认五张 eligible 卡的请求已并发发出，再验证下一 Offer 的 15 秒间隔及七张卡最终 added 数量。
- 以上仍为合成页面和拦截网络回归，没有向真实账户发送登记请求。

## v4.2：whitelist 选一次，普通刷新直接恢复

- 根因：旧版只保存 token 集合，卡片列表和 detected 状态仅在本页内存；刷新后又要求检测，并在检测时通过取交集把暂时缺失的已选卡片永久移除。
- 卡列表、检测状态和 whitelist 作为一个版本化快照保存至 Tampermonkey 的 GM 存储。普通刷新不检测、不请求、不扫描，直接恢复已保存列表和勾选状态。
- 新增独立的 Force refresh card list，绕过旧页面快照，只发一次账户列表请求，仍遵守 15 秒串行间隔、冷却、Stop 和无自动重试规则。
- 强制刷新保留已知卡的选择，新卡默认不勾选；缺失卡仅暂停参与扫描而不删除持久选择。刷新失败保留旧快照，成功后清除本页旧扫描结果。
- 旧版 localStorage whitelist 只迁移一次；尽可能读取已载入的页面数据补全旧版未保存的卡目录，没有网络副作用。取消勾选后的空 whitelist 不会被旧数据重新填入。
- 增加明确的保存失败提示；异常存储不静默覆盖。GM grants 改变运行环境后，通过 unsafeWindow 读取 Amex 页面状态。
- 59 个单元测试及三个 Chromium 场景通过。新增场景真正重载 document，覆盖恢复后直接扫描、强制刷新、新卡不勾选、刷新失败、保存失败、网站 storage 清空和取消勾选持久化；GM API 在测试中模拟。
- HAR 离线检查仍识别 92 张卡并通过 Offer/登记解析，没有发出真实请求。安装文件需在原有脚本中完整替换，包括新增 grants；本轮没有操作用户已安装的 Tampermonkey 脚本。

## v4.1：修正完整列表解析和跨卡统计

- 根因：`ADDEDTOCARD_LANDING` 应读取 `addedToCardViewAll.offersList`；v4.0 错读首页/登记摘要的 `addedToCard.offersList`，首张卡的第二次请求因而失败。
- 修正以 HAR 捕获的官方 `useAddedToCardViewAll()` 和其消费者为依据；不把字段缺失当作空列表，不以摘要替代全部结果。
- 每张卡显示 eligible、added、total；同一 Offer 跨卡合并后显示不同 eligible/added 卡片数。卡片统计不受搜索过滤影响，部分结果明确标注。
- 单视图结构错误只影响该卡完整性，继续其他视图和卡片；HTTP 错误、429、账户不匹配、网络问题和取消仍按既定规则停止。
- 保持 whitelist 校验、15 秒串行间隔、严格登记确认。
- 构建、源码一致性检查、43 个单元测试、两个 Chromium 场景及 HAR selector 核对全部通过。7 卡浏览器场景验证完成 14 个请求，并将同一 Offer 显示为 5 张 eligible 卡、2 张已添加卡。
- 本轮连接用户现有 Chrome 页面超时，没有替换用户已安装脚本，也没有对真实账户执行新扫描；导出的 v4.1 userscript 需替换旧版后刷新。

## v4.0：手动检测与 whitelist 扫描

- 启动、计时器、页面重建均不自动检测卡片或调用业务 API。
- 独立的一次性卡片检测：优先读取页面初始状态，缺失时只有一个兼容账户列表请求。
- 默认空 whitelist；只允许用户逐卡选择。保存选择后，在下次手动检测时与当前卡片集合取交集。
- 扫描和登记均在 API 调用边界校验 whitelist，未选中卡片和旧缓存不能进入请求队列。
- 使用当前 Offers Hub 数据结构，分别读取推荐和已添加视图，保留全部返回页与信息条目。
- 全局串行队列：每次完成后至少间隔 15 秒；429 停止并保存至少两分钟冷却，尊重更长的 Retry-After；不自动重试或恢复。
- Stop 可中止等待并阻止下一次请求；已发送的请求保留结果。错误以未完成显示，不再用空结果掩盖。
- 登记不并发；仅完整扫描卡片的商户 Offer 可登记。响应必须明确成功并包含对应 ENROLLED Offer，未知结果要求重新扫描。
- 状态独立于 DOM；筛选、最小化和 SPA 面板重建保留本页数据。whitelist 移除立即清除该卡结果。
- 源码拆为 16 个小模块，零依赖构建脚本生成一个可安装 userscript。

## 验证

- `npm run build`：生成并检查所有源码及最终 userscript 的 JavaScript 语法。
- `npm run check`：验证生成文件与源码一致。
- `npm test`：卡片检测、whitelist、全部页、串行调度、429、取消、异常恢复、登记结果等回归验证。
- `npm run test:browser`：使用 Playwright/Chromium 的合成页面，拦截全部请求；验证真实 DOM 按钮、无自动请求、白名单请求范围、两类列表、间隔、筛选、页面重建、停止、429、窄屏及 document reload 后持久设置恢复。GM 存储使用页面外的合成存储夹具。
- `node tests/amex/verify-har.cjs global.americanexpress.com.har`：用实际 HAR 的结构检查页面解析、卡片识别、Offer 列表和登记确认，不联网、不打印账户数据。

本地 HAR 适配证据见 [HAR 说明](amex-har-2026-09-10.md)。这些结果不等于新版脚本已经在真实账户完成现场扫描或登记。

## 待现场验证

1. 在已登录的 Amex Offers 页面更新至 v5.0，包括 metadata/grants；v4.x 的 whitelist、卡目录和 Offer 快照仍可恢复，并按检测顺序得到初始优先级。此前 FAILED/UNCONFIRMED 状态先手动扫描核实，不能直接当作 eligible 重试。
2. 手动选择少量卡片，验证 Offers Hub 两个视图的实时响应结构及全部页覆盖。新列表请求来自捕获前端代码；本次 HAR 的首屏数据是服务端渲染，不是该接口的直接网络响应。
3. 拖动排序后确认 Offer 卡片上的 Goes to 指向预期的卡，再用 Add all offers 实际跑一轮，核对 Activity 的逐次 isEnrolled 结果。v4.x 里「同一个 Offer 只成功一张卡」现在是设计行为，不再是判断接口是否接受多卡的线索；本地回归只能证明请求调度与确认处理。
4. 用户切换 Amex 登录账户后，使用 Force refresh card list 更新当前会话的卡目录；当前版本不主动监听登录变化。whitelist 和优先级都按精确卡片 token 匹配，未实测 Amex 是否在某些会话变化后更换 token，不按同名卡片猜测匹配。调度范围是本页脚本，不控制 Amex 网站自身请求或其他标签页。
5. 更新到 1.6.4 后点一次 Refresh cards，确认已注销的卡从列表消失、仍有效的附属卡保留。
6. 用 Add all 实跑一轮，核对 Activity 里 ON_OTHER_CARD 和 FAILED 的 explanationCode，以及面板统计是否和 Amex 页面一致。HTTP 200 里除 `PZN4107` 外的拒绝代码目前没有样本；2025-11 抓包里的 `PZN2001` 是 HTTP 400，仍按 HTTP 错误停止。
7. 当前版本每个 Offer 只发一张卡，PZN4107 在这种情况下的实际频率未知。它只说明这个 Offer 已在某张卡上，脚本不知道是哪张，可能是不在 whitelist 或没扫描到的卡。

## 迁移历史

最初从 `zichao-utils` v3.4 提取 userscript，并以独立 Git 提交保存基线。v3.4.1 修复了 `isEnrolled: false` 被误判为成功，以及 badge 不存在时登记状态不更新的问题；v4.0 保留严格确认和数据独立于 DOM 的行为，同时采用新的 Hub 接口。
