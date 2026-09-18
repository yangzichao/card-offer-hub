# Amex Offer Lite 5.0

American Express 网页中的 Tampermonkey 工具。卡片检测、扫描和添加都由按钮触发，没有任何定时器会自己发请求。

v5.0 改变了添加 Offer 的方式：**一个 Offer 只加到一张卡**。多张卡都能加的 Offer 归你排在最前面、且当前 eligible 的那张；只有某一张卡才有的 Offer 就加到那张卡。
同时取消了同 Offer 跨卡并发，改成严格一个请求一个请求地发。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [amex-offer-lite.user.js](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/amex-offer-lite.user.js)，Tampermonkey 会弹出安装页，确认即可。脚本需要其中的 `GM_getValue`、`GM_setValue` 和 `unsafeWindow` grants。
3. 删掉以前手动贴进去的旧副本，否则两份会同时匹配 Amex 站点。保存后刷新已登录的 [Amex Offers 页面](https://global.americanexpress.com/offers)。

之后不用再手动更新。发布文件里带 `@updateURL`，Tampermonkey 会按自己的周期检查版本号并静默升级；要立刻更新就在 Tampermonkey 面板点 **Check for userscript updates**。

不要复制 `src/` 里的单个模块，也不要手工拼贴 `dist/` 的内容——手贴的副本和更新地址没有绑定，不会自动更新。

## 四步操作

1. **Detect card list**：首次只检测一次卡片列表。优先读取页面已经载入的卡片数据，缺失时仅尝试一次账户列表请求；不会逐卡扫描 Offer。卡列表会保存，普通刷新和下次访问直接恢复，不用再次检测。失败后可等待至少 15 秒再手动尝试。
2. **Choose your whitelist and offer priority**：逐张勾选需要的卡片，并用拖动或 ↑ / ↓ 把它们排成你想要的优先级。勾选和排序都立即保存，本身都不发请求。取消勾选同样持久保存，该卡退出扫描和添加范围，但保留已有 Offer；重新勾选即可显示已有结果。
3. **Scan whitelist**：手动扫描或刷新 whitelist 内卡片的 Offer，分别读取 Offers Hub 的可添加列表和已添加列表，保留返回的所有页及非登记类信息 Offer。结果会保存；下次打开先显示已有数据，需要更新时再点击这个按钮。筛选框只过滤显示和后续添加，不限制扫描范围。
4. **Add all offers**：一次点击，把计划里的每个 Offer 按顺序加完，中途不用管。每个 Offer 只发一个请求，两个请求之间至少 15 秒。

扫描和添加时锁定卡片选择和排序，防止执行范围在中途变化。每张卡显示 Pending、Scanning、Complete 或 Incomplete。失败和部分结果不会伪装成扫描成功，未完整扫描的卡片不能发起添加。

卡片发生变化时，点击独立的 **Force refresh card list**：只重新请求一次账户列表，遵守同一请求间隔。保留已有卡片的 whitelist、排序和 Offer，新卡默认不勾选、排在最后，不会插到你已经排好的卡前面；暂时缺失的卡片保留选择、名次及结果但不扫描，重新出现后回到原位。刷新失败保留旧列表和选择。普通网页刷新不会触发此操作。

升级时会迁移 v4.0/v4.1 尚存的 whitelist，并尝试从已加载的页面数据补全卡列表，全程不自动请求。若当时没有页面卡数据，只需手动检测一次，已有选择仍会保留。旧版已经删除的选择无法凭空恢复。

v4.1 修正已添加完整列表的字段：`ADDEDTOCARD_LANDING` 读取 `addedToCardViewAll.offersList`。首页摘要和登记响应的 `addedToCard.offersList` 用途不同，不作为完整列表的替代。

## 卡片优先级

- 排序一次就够了，和 whitelist 存在同一份 Tampermonkey 快照里，刷新和下次访问直接恢复。拖动手柄或按 ↑ / ↓ 都是同一个操作，触摸屏和键盘用按钮。
- 多张卡都 eligible 的同一个 Offer，只加到排得最靠前的那张；其他卡在 Offer 卡片上显示为 skipped，它们自己的记录不动。
- 只有一张卡有的 Offer 永远加到那张卡，和名次无关。
- 某个 Offer 已经在任意一张 whitelist 卡上是 added，或者上次发出后还是 UNCONFIRMED，就不会再加到别的卡上；要重新判断先重新扫描。
- 最靠前的卡如果扫描不完整、或者这个 Offer 明确被拒绝（FAILED），顺位交给下一张卡。
- 扫描顺序也跟着优先级走，最靠前的卡先扫。
- 升级到 v5.0 时，已保存的卡按当时的检测顺序作为初始名次，不会打乱，也不会因此发请求。

## 保存 Offer 与手动刷新

- v4.4 保存每张卡的 Offer 列表、eligible/added 等登记状态、扫描完整性和扫描时间。刷新页面直接恢复，跨卡分组和统计同时恢复；没有自动扫描、后台更新或缓存到期清空。
- 已完整扫描的保存结果可以直接手动登记，无需先重新扫描。每张卡及结果区显示 Last scan，方便自行决定何时更新。
- 手动刷新保留屏幕上的旧结果，逐卡成功后替换。网络错误或列表解析不完整时保留该卡旧数据和旧时间，并标记 Incomplete；首次扫描的部分结果也会保存，不能冒充完整扫描参与登记。
- 每次添加前先保存待确认状态，响应回来后立即保存结果。中途刷新页面不会把已发送但尚未确认的添加恢复成可重复添加的 eligible，而是显示 UNCONFIRMED，待手动扫描核实；UNCONFIRMED 同时会挡住这个 Offer 落到别的卡上。无法保存待确认状态时不会发送任何请求。
- v4.3 及更早版本没有保存 Offer，无法恢复已经丢失的结果。更新后首次扫描建立快照，此后可一直复用，直到手动刷新。

## 数量与重复 Offer

- 卡片下方显示 **eligible / added / total**，按这张卡的全部扫描结果统计，不随搜索框变化。
- 条件相同的 Offer 跨卡合并；不同卡上的不同 Offer ID 保留用于各自登记，奖励或条款不同的活动不会仅因同名就被合并。
- 每个合并 Offer 显示 **Eligible on N cards / Added on N / Seen on N**，按不同卡片计数。
- 搜索后的汇总给出独立 Offer 数、eligible 的 Offer 数、**这轮实际会添加的 Offer 数**和 eligible 卡片数。Add all offers 按钮上的数字就是最后一项会发出的请求数。
- 每个 Offer 卡片写明它会加到哪张卡（Goes to …），或者已经在哪张卡上（Already on …）。
- 不完整扫描显示 **Observed so far**，总览显示扫描覆盖率。尚未扫描的卡片不会显示为零 eligible。

## 请求节奏与停止

- 卡片检测和 Offer 扫描仍串行发送；前一个请求完成后至少间隔 **15 秒**。
- 添加也是串行：**一个 Offer 一个请求，一张卡**，用的是那张卡自己的 Offer ID。从上一个响应完成起至少等待 **15 秒** 再发下一个。单个 Add 和 Add all offers 使用相同规则。
- 读取每张卡片的两个列表通常需要两个请求，没有自动刷新。
- 遇到 HTTP 429 停止本轮，冷却至少 **120 秒**；如果 `Retry-After` 更长则遵循该时间。冷却会保存到本地，结束后仍须手动重启。
- 网络错误、接口错误或 30 秒超时都会停止，不自动重试。失败、未确认或 429 都会终止本轮，后面的 Offer 一个都不发。已经成功的结果保留，状态栏给出已添加的数量。
- 单张卡的某个响应结构异常会保留已解析结果，并按原有间隔继续其余列表和卡片；该卡标为 Incomplete。未知结构仍会报错，不会当成空列表或使用首页摘要替代。
- **Stop** 可打断等待并阻止后续请求。已经发出的那一个请求可以完成，结果照常记录；不会撤回已经成功的添加。
- 请求节奏针对本页脚本；Amex 网站自身请求和其他标签页不由这个队列调度。

## 添加 Offer

扫描完成后点 **Add all offers** 一次跑完，或者点单个 Offer 上的 **Add** 只加那一个。搜索框有内容时按钮变成 **Add filtered offers**，只处理筛选结果。只有 whitelist 卡片中已完整扫描、标为可添加的商户 Offer 会发起请求。

v4.5 恢复的原始 `CreateCardAccountOfferEnrollment.v1` 接口继续使用：每张卡自己的 `accountNumberProxy` 和 `identifier`，带请求时间及用户时区；全量读取继续使用 Offers Hub。只有响应的 `isEnrolled === true` 才显示成功。原始脚本的 `isEnrolled || true` 会误报成功，没有恢复这一错误行为。

v5.0 起没有并发：一个请求一张卡，间隔 15 秒。失败或未确认会停住本轮并要求重新扫描，不会盲目重发。Activity 记录这轮计划的 Offer 数、涉及的卡数、登记接口以及每次的 isEnrolled 结果。信息类 Offer 保留在列表中供查看，永远不会被添加。

登记协议依据旧脚本和 HAR 中实际成功的 Card 接口请求恢复。v4.x 里“同一个 Offer 只成功一张卡”是待查的故障；v5.0 起这是**设计行为**——一个 Offer 本来就只加一张卡，所以那个现象不再是判断依据。协议本身仍未在当前账户上现场验证。完整差异与证据见 [登记对照说明](../../../docs/amex-enrollment-comparison.md)。

## 数据与验证

卡片标识、显示名称、whitelist、优先级顺序和 Offer 快照保存于 Tampermonkey 自身的存储，网站清理 localStorage 不会删除这些数据。保存 API 依据 [Tampermonkey 官方文档](https://www.tampermonkey.net/documentation.php?q=GM_setValue)。卡设置（含优先级，schemaVersion 2）和 Offer 使用独立的版本化快照，保存或读取失败在对应区域明确显示，不会静默宣称成功。v1 快照按检测顺序补上初始优先级，不会被覆写。冷却时间仍使用网站本地存储；不加载旧版 v3 的 Offer 缓存和 blocklist，也不从 localStorage 搜寻会话 token。

已使用 2026-09-10 的本地 HAR 核对页面状态、Offers Hub 数据和登记响应，并在拦截网络的 Chromium 中验证操作流程，包括真实 document reload 后恢复卡片、选择、优先级及扫描能力，以及用真实鼠标拖动改变优先级。浏览器测试模拟 GM 存储 API，未把合成回归当作真实 Tampermonkey 安装或当前账户扫描证明。

源码按卡片检测、API、调度流程、UI 拆分。修改后在仓库根目录运行 `npm run build`、`npm run check`、`npm test`。详情见 [修复记录](../../../docs/amex-repair-plan.md) 和 [HAR 适配说明](../../../docs/amex-har-2026-09-10.md)。
