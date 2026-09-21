# 统一运行架构

本文记录 1.3.3 的公共运行核心重构。后续的模型、计划、模板视图和结果 schema 迁移见 [工作流模板](workflow-templates.md)。

## 改动目的

唯一安装包原先把公共模块复制进每个银行 IIFE。运行锁、请求节奏、存储和面板绑定存在重复；跨银行搜索直接识别各银行格式。本次把公共实现集中定义，并通过显式参数为当前银行创建实例。

## 代码边界

| 层 | 入口 | 职责 |
| --- | --- | --- |
| 应用 | `bundles/all/src/dispatch.js` | 匹配站点、保留 Chase document-start、隔离 GM 存储、启动当前银行 |
| 运行核心 | `shared/runtime/` | 任务开始/结束、请求串行与间隔、超时、错误和冷却处理 |
| 数据 | `shared/persistence/` | 注入状态、字段与存储接口；保存快照和未确认请求 |
| 展示 | `shared/offers/`、`shared/ui/` | 公共显示模型、面板结构和通用控件绑定 |
| 银行 | `issuers/<issuer>/<tool>/src/` | 会话、端点白名单、请求构造、范围、扫描与确认协议 |

六家共用请求调度和任务生命周期。Citi、Chase、BoA、US Bank、Wells Fargo 共用 Web Locks 运行器、JSON 传输、pacing/workspace 工厂和工作流面板。Amex 的卡片优先级、分卡扫描结果、持久化格式、界面扩展和确认协议保留在适配器中；其原有跨标签限制没有因提取公共调度器而自动改变。

## 构建与银行能力

`sharedModules` 的并集在外层只输出一次，银行正文只包含自己的源码。共享源码不能使用 `__USERSCRIPT_*__`，否则构建失败。银行源码继续使用构建常量，新增 `__USERSCRIPT_CAPABILITIES__`，来自清单的 `capabilities.activation` 与 `capabilities.scope`。银行清单仍不带版本。

公共面板和运行器都检查 activation 能力，默认不开放添加。Chase 继续只读。原有 URL 路由、权限白名单、无自动请求和单一发布身份保持不变。

每个银行新增 `snapshots/saved-results.js`，在 `sources` 中登记一次，并通过 `savedResultsSource` 标记。构建器把它包装成独立的只读函数，放进银行目录；不放进需要激活页面才能使用的银行正文。定义读取器不会调用它，也不会访问页面或发送请求。搜索发生时只把带银行前缀的 GM 读取函数传进去。

因此搜索可以在任一银行页面读取所有银行的旧快照，不启动其他银行适配器。转换结果只包含展示字段；不复制成第二个数据库。未知 schema、损坏数据只影响对应银行的搜索结果，并保留原存储。

## 状态与恢复

工厂只共享实现，不共享实例。请求占用、pacing 和未确认集合属于各银行自己的实例；GM 前缀、已有键和 schema 均保持兼容，本次不重置用户数据。账户级 consent 与 BoA 的未确认字段转换通过适配器回调提供，公共存储不猜银行字段。

现有银行状态字段保持兼容，工作流继续负责冻结本次卡片/优惠范围。运行核心负责生命周期，展示字段不会变成写操作的依据。停止只阻止后续请求，已发送请求仍等待结果；页面恢复不自动重放任务。

Citi 的缓存添加在新点击后只核对当前登录卡片，不重读优惠；刷新并添加在一次点击中读取全部卡片与优惠，再添加已选卡上的可用项目。US Bank、BoA 保留提交后的明确读取确认。搜索过滤不会缩小 Add all 的范围。

公共调度器在整个响应读取期间持有请求槽，并在完成后计算间隔；五家使用持久化请求预留的银行继续在请求前保存预留时段。新增统一的并发请求保护和数值溢出校验；存储失败时不发送，收尾失败也释放本页运行标记。不同银行的实例不会相互阻塞。

## 验证

测试继续读取 `dist/card-offer-hub-all.user.js`。银行 harness 取发布包内原样的公共定义与银行正文；不重新编译源码、不生成测试专用脚本。完整浏览器用例仍注入统一包验证路由与隔离。

公共回归检查单次打包、无初始化副作用、请求完成边界、并发拒绝、停止、冷却、存储预留失败、收尾失败、实例隔离、未确认字段和只读能力；银行原有回归检查各自契约。

验证命令：`npm run build`、`npm run check`、`npm test`、配置可用 Playwright 路径后的 `npm run test:browser`。

1.3.3 本地验证：`npm run build` PASS；`npm run check` PASS；`npm test` PASS（291 项）；`PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright npm run test:browser` PASS（13 组）；`git diff --check` PASS。安装包从本次重构前的 314,406 字节降至 219,108 字节，减少 30.3%。

## 待现场验证

真实 Tampermonkey 沙箱中的升级、跨银行缓存读取、页面生命周期，以及六家银行当前接口与登录会话。合成 Chromium 回归不代表真实账户操作已验证。
