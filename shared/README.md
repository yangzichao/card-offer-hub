# 公共运行核心

银行清单用 `sharedModules` 声明依赖。构建器按注册顺序合并依赖，在唯一发布包的外层 IIFE 中只定义一次；每个银行仍有自己的私有 IIFE 和状态。公共模块不使用 `import` / `export`，不读取银行的 `state`、`SETTINGS` 或构建身份常量。

## 职责

- `runtime/`：任务生命周期、请求槽、响应完成后限速、超时、429 和错误清理。
- `pacing/`：各银行独立的自动调速、稳定样本、限流退让和策略校验。详见[自动调速](../docs/adaptive-pacing.md)。
- `persistence/`：注入存储接口和字段规则的快照与 pacing 工厂；保留原来的键，schema 变更显式迁移。
- `workflows/`：每卡、账户和 Amex 组合模板；严格的归属模型、操作计划与视图定义。详见 [工作流模板](../docs/workflow-templates.md)。
- `offers/`：用于显示与搜索的公共记录，不能用来授权写请求。
- `ui/`：样式、工作流面板、搜索/折叠绑定、操作状态；银行控件通过参数和扩展节点接入。

每个工厂通过参数获取状态、配置、存储及必要回调。银行的 `core/workspace.js`、`api/request-runtime.js`、`workflows/runner.js` 负责连接这些依赖。实例之间不共享可变状态。

所有网络操作仍由用户点击触发。请求路径、会话检查、资格与成功确认规则归银行适配器所有；公共传输不会把 HTTP 200 或请求 acknowledgement 当作添加成功。Amex 的目标卡分配由组合模板负责，排序控件、存储适配和确认协议留在银行模块。

新增公共模块必须通过银行的 `sharedModules` 或其 `workflow` 对应的模板目录清单登记。不要添加只有设想、尚无实际消费者的抽象。完整设计与验证边界见 [统一运行架构](../docs/unified-runtime.md)。
