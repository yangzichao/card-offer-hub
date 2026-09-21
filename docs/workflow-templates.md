# 三种优惠工作流模板

优惠属于谁，决定如何展示、去重和添加。银行是否支持添加是独立能力，不能用它选择工作流。

## 当前接入

| 模板 | 银行 | 计划中的身份 | 页面重点 |
| --- | --- | --- | --- |
| `per-card` | Citi、Chase | `cardId + offerId` | 选卡、按卡查看优惠；同一优惠在两张卡上可分别添加 |
| `account` | BankAmeriDeals、US Bank、Wells Fargo | `accountId + offerId` | 当前账户的优惠与账户确认；不分配卡片 |
| `amex-combination` | Amex | 每卡记录保留 `cardId + offerId + groupId`；按 `groupId` 分配目标 | 选卡、卡片优先级、聚合优惠及目标卡 |

Chase 使用每卡模板并声明 `activation: true`。仅将未添加且点击参数一致的记录列入计划；串行发送 CLICK 后逐条回读 `ACTIVATED`，未知结果停止且不自动重试。见 [Chase 接口说明](chase-api-contract.md)。

## 代码与边界

```text
shared/workflows/
  catalog.json                    模板名、scope、工厂、源码清单
  contract.js                     严格的记录与选择验证
  controller.js                   预览、写入计划、执行前再核对
  snapshot.js                     保存结果的 workflow 标记与迁移
  per-card/{model,planner,view}.js
  account/{model,planner,view}.js
  amex-combination/{model,planner,view}.js

issuers/<issuer>/<tool>/src/
  core/workflow.js                适配器：银行状态 → 模板记录与选择
  workflows/                     刷新、会话核验、执行计划、确认结果
```

每个模板工厂返回 `scope`、`validateRecord(record)`、`plan(records, context)` 和不可变的 `view` 定义。模板不读银行全局状态、不访问存储、不发请求。`view` 提供范围标题、优惠标题、范围说明、缺失选择提示和搜索范围说明；公共面板负责渲染。银行专属控件（如 Amex 排序、US Bank 优惠勾选）由显式的面板扩展传入。

`createHubWorkflow` 接受明确的 `type`、`capabilities`、`readRecords` 和 `readContext`。预览和写入使用同一个 planner，搜索条件不进入操作计划。`.plan()` 检查添加能力；`.assertAction(source)` 在提交前重新读取当前状态，拒绝失效的选择或目标。正常、忙碌、停止、失败和冷却的生命周期继续由已有运行器和银行会话检查负责；模板不另造一套请求运行器。

规范化记录至少包含 `offerId`、`status` 和 `source`。`source` 仅在内存中引用银行记录，供既有接口构造器使用，不会存到 GM storage。状态限定为 `available`、`added`、`unconfirmed`、`unavailable`。银行适配器决定接口中的哪些明确字段可转换为这些状态，模板不能把 HTTP 成功推断为添加成功。

三种记录的所有权字段互斥：每卡型必须有 `cardId`，不接受 `accountId` 或 `groupId`；账户型必须有 `accountId`，不接受卡片/分组字段；Amex 必须有 `cardId` 和 `groupId`，不接受账户字段。

### 每卡型

上下文为 `selectedCardIds`。仅对所选卡生成操作，同卡同优惠去重，不跨卡去重。相同身份出现互相冲突的状态时停止生成计划，要求刷新。

Citi 提供使用缓存添加和刷新后直接添加两个入口，均先核对当前登录卡片；缓存入口不重新扫描优惠，刷新入口读取所有卡后只添加已选卡，新卡默认不选。Chase 保留当前网页请求的被动观察与卡片检测。

### 账户型

上下文为 `accountId` 与 `consent`。所有优惠必须属于这个账户；`accountId` 使用当前适配器已保存的会话/客户指纹，不把原始认证信息加入记录。勾选多张卡或传入卡片优先级都不能增加操作数。

BoA 与 Wells Fargo 保留账户确认复选框。US Bank 的明确手动添加操作承担账户确认，优惠勾选仅缩小优惠集合。各家仍保留自己的重新读取、会话变化处理和添加确认协议。

### Amex 组合型

上下文为 `selectedCardIds` 与完整的 `priorityCardIds`。每组优惠选择优先级最高的可用卡；卡片独有的优惠保留。已添加或未确认的组选中卡记录会阻止该组改投另一张卡。资格、完整扫描与可添加性由 Amex 适配器转换，分组规则继续使用当前银行的 `groupKey`；本次没有改变分组算法。

规划不会修改各张卡的实际状态。修改优先级仅影响尚未处理的目标。失败后的新操作仍需要用户明确发起，不自动尝试其他卡。

## 新增银行或模板

1. 先确定优惠身份、去重和目标分配规则；相同规则沿用现有模板。请求地址、显示字段或确认协议不同，由银行适配器处理。
2. 银行清单必须声明 `workflow` 和 `capabilities`。例如 Citi 使用 `"workflow": "per-card"`，搭配 `{"activation": true, "scope": "card"}`。缺失、未知类型或 scope 不匹配均构建失败。
3. 银行的 `core/workflow.js` 注入记录和上下文。添加队列必须来自 `.plan()`，实际写入前调用 `.assertAction()`；按钮数量来自 `.preview()`，不能另写一套去重规则。
4. 新的归属/分配规则才创建新模板目录，在 `catalog.json` 登记工厂和模块。构建器从银行声明自动带入模板依赖并在公共运行域中只输出一次，无需编辑每个银行的 `sharedModules`。
5. 模板的新模型配套反例测试：相同 ID 在不同所有者下的行为、非法字段、重复/冲突数据、未确认记录、选择变化、只读能力。银行测试继续覆盖接口转换与确认协议。

当前三个模板共用两段面板：范围/选择、优惠/操作。模板决定各段含义。停止仅在任务运行时出现，清除搜索和搜索范围说明仅在有查询时出现。今后若新模板需要不同布局，应新增明确的视图组合接口，不在公共布局中加入银行名称判断。

## 保存与升级

五家 workspace 写入 `schemaVersion: 3` 与 `workflowType`；Amex 优惠结果仍使用 schema 2，保留现有存储键。Workspace schema 3 保存选卡初始化标记和 Citi 的全局继续阻塞标记，以区分旧版空选择与新版主动取消全部，并让网络/登录失败跨重载仍要求刷新。已发布的 schema 1/2 从各银行既有命名空间读取，在内存中前向迁移，保留所有展示字段、选择和扫描时间；读取本身不写盘、不请求网络。下一次明确保存才写入新格式。

schema 2 的模板标记缺失或不匹配、未知 schema、损坏数据都会保留原值并提示错误。Amex 还会阻止后续保存覆盖无法恢复的优惠快照。独立的 pacing、Amex 卡片优先级和视图偏好仍使用各自原有 schema。跨银行搜索通过各银行的显式 workflow 声明兼容各银行上述版本的优惠结果，不启动银行模块。

## 验证与待现场验证

测试从唯一的发布产物读取模板实现。单元测试覆盖模板边界、执行前重新核对、完整的旧数据迁移与错配保留；合成 Chromium 回归覆盖六家页面、不同模板标题与控件、窄屏、继续添加、请求范围和无自动请求。

验证命令：

```sh
npm run build
npm run check
npm test
PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright npm run test:browser
```

待现场验证：真实 Tampermonkey 升级、六家银行当前登录会话与接口、真实账户保存结果的迁移。离线通过不代表已经执行或验证真实银行添加。本次统一发布版本为 1.4.0。

1.4.0 发布前验证：`npm run build` PASS；`npm run check` PASS；`npm test` PASS（310 项）；以上完整 Playwright 命令 PASS（13 组）；`git diff --check` PASS。
