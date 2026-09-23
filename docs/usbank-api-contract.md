# US Bank Cash Back Deals 接口与实现

## 来源与范围

依据用户提供的本地 HAR 及其中第一方静态前端源码分析，未调用真实银行接口。HAR、客户标识、会话凭证和原始响应不进入仓库。只保留字段结构和合成测试。

所有业务请求都是当前站点的 `POST /digital/api/customer-management/graphql/v2`。优惠查询为 `getCashbackOffersAds`，激活使用名为 `getActivateOffer` 的 GraphQL query；尽管声明为 query，它发送 `AdInteraction / ActivateOffer` 事件，有写入副作用。

该捕获包含一份 149 条优惠列表以及四次真正的 ActivateOffer 请求。其余大量 getActivateOffer 请求只是曝光／展开事件，不能误当成激活。

## 会话与列表

第一方前端从 `sessionStorage.offerhubobject` 读取 `platformKeyVal`、`sourceCustomerId`、`securityToken`，映射到列表请求的 `sourceApplication`、`sourceCustomerId`、`sessionTokenId`；`userId` 从独立的同名 storage 项读取。

响应含 `requestId`、`sessionTokenId`、`ads[]`。每条含 `offerId` 和 `ad.adServeToken`、`activationState`、`visibilityState`、`reward.activationModel`、起止日期等。捕获没有账号／卡片选择变量或分页变量；本实现不猜测额外账户接口或分页接口。

请求头使用捕获中固定的 `application-id: web`、`service-version: 2`、`refreshcache: false`、空 `routingkey`，每次新建 correlation ID；浏览器携带同源 Cookie。

请求还必须带 `authorization: Bearer <sessionStorage.AccessToken>`。HAR 看不出这一点：Chrome 导出时去掉了 Authorization 和 Cookie，整份捕获没有任何请求带这两个头。依据是前端源码：读取 `offerhubobject` 的那个 GraphQL 客户端，把 `sessionStorage.AccessToken` 作为 `authorization: "Bearer " + token` 发出。1.6.4 之前的脚本漏了这个头，这是 US Bank 扫描失败最可能的原因；真实服务器对缺失 Bearer 的具体响应没有现场验证。

脚本在每个请求发出前从当前页面读 `AccessToken`，读不到就不发请求并提示重新加载页面。token 只放进同源请求头，不保存、不进快照、不参与「会话是否变化」的比较，因为页面可能刷新它。脚本不读取或复制 HAR 中的 Cookie、Authorization 或用户标识。

## 激活与确认

每次只发送一个 `clientEvents` 事件，使用最新列表的 `sessionTokenId`、`requestId`（映射到 `clientEventId`）、对应优惠的 `offerId` 和 `adServeToken`。事件的 `curationId: Featured`、`section: Summary`、`channel: OLB` 与捕获一致。`displayPosition` 使用脚本最新列表里的位置；它是展示元数据，实际银行页面当时的筛选位置不能由列表 rank 推导。时间戳新生成，不重放历史时间。

激活响应只有 `data.getActivateOffer.requestId`，**没有明确的激活状态**。因此本实现把它当作接收确认；随后发起一次新的完整列表查询，要求同一 offerId 明确变为 `ACTIVATED`。服务端不确认、优惠消失、重复冲突或回查报错时，标记 `UNCONFIRMED` 并停止整个队列。不会把 DOM 中的绿勾当成服务器证据。

列表中 `NEW`、`SERVED` 可作为候选；空状态、AUTO_ACTIVATED 等保持跳过。前端静态源码确实识别 `ACTIVATED`，但用户提供的 HAR 没有激活后的列表，因此真实回查时序尚未验证。

## 安全与运行

手动扫描后显式选择优惠；执行前再刷新，只处理原先选择的 ID。串行间隔依照工作区统一配置为响应完成后 500 毫秒。429、存储失败、会话变化、Stop、GraphQL 部分错误均阻止后续请求。GM storage 保留 schemaVersion 1 的 pacing，并增加独立的 schemaVersion 1 workspace 快照，保存展示字段和用户选择；不保存会话或 serving token。详见 [本地持久化](local-persistence.md)。

初始版本没有历史快照需要迁移。将来改变 schema 必须增加前向迁移；未知版本当前保留原值并阻止请求，禁止静默覆盖。

## 1.6.4 修复记录

- 根因：请求漏了 `authorization: Bearer <AccessToken>`，见上文「会话与列表」。现在每个 GraphQL 请求发出前从当前页面读取 token；读不到就不发请求，状态栏显示「US Bank sign-in token is unavailable」。
- 验证：`npm run build`、`npm run check`、`npm test`（438 项）、`npm run test:browser` 全部 PASS。单元测试覆盖 Bearer 头、token 缺失时零请求、运行中 token 刷新后照常继续、token 不进 GM storage；浏览器回归的合成服务器对不带 Bearer 的请求返回 401。
- 另用用户本地 HAR 做了一次离线回放（脚本不入库，全部请求在本机拦截，token 为合成值，服务器要求 Bearer）：扫描读出 149 条、107 条可激活；扫描、激活前刷新、三次激活和其中两次回查（第三次激活后按了 Stop）共 7 个请求都带上了 Bearer。这只证明请求形状，不证明真实服务器接受。

## 待现场验证

- Tampermonkey 在实际登录页面读取 sessionStorage 和同源请求的兼容性。
- 带 Bearer 头后真实列表和激活能否成功；不带时服务器返回什么（推测 401，未验证）。
- `AccessToken` 在页面停留期间是否会刷新或过期，过期后脚本看到的是「sign-in token is unavailable」还是 HTTP 401。
- 客户级优惠在银行侧覆盖哪些卡片；本脚本不提供未证明的逐卡能力。
- 激活后列表何时返回 `ACTIVATED`，是否存在银行侧缓存或最终一致性延迟。即使延迟也保持一次回查后停止，不自动重试。
- 500 毫秒请求间隔下的实际限流、Cookie 过期行为、会话切换和停止操作。
- 发布仍需用户明确要求 commit / push；生成本地产物不代表 GitHub 安装链接已上线。
