# Card Offer Hub — All Banks

[一键安装全部银行](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/card-offer-hub-all.user.js)

先安装 Tampermonkey，再点上面的链接，在安装页确认一次。它是一个包含全部银行工具的合并脚本，不需要逐个安装六次。之后由 Tampermonkey 检查并更新整个合并版。

打开 Amex、Citi、Chase、BankAmeriDeals、US Bank 或 Wells Fargo 对应页面，只加载该网站的工具。扫描、添加仍需手动点击；Chase 目前仍只支持扫描。

## 已经安装过单独版

在 Tampermonkey 管理面板里先停用原来的单独版，再启用合并版并刷新银行页面，避免两份脚本同时运行。两种安装方式二选一。

**原有扫描结果和选择不会自动转入合并版。** Tampermonkey 的 GM 存储属于各自脚本，合并版是一个新的脚本身份。停用原脚本会保留其数据，不必删除；合并版首次使用需重新扫描和选择，之后会持续保存在本地。合并版内部按银行分别存储，不混用结果和选择。

参考：[Tampermonkey GM storage 文档](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_values)。

## 构建与更新

这里是发布组合，不是另一份银行实现。`userscript.json` 定义唯一安装身份和版本，`dispatch.js` 负责本地路由和存储隔离。构建器从每个银行的现有清单生成原始 IIFE，原样嵌入合并版。站点、权限和目录自动合并。

合并版在 document-start 注入，Chase 立即安装原生请求观察器，其余工具等 DOM 解析完成后挂载。路由本身没有请求和定时器，不自动扫描或续期。新增银行的匹配语法、权限不受支持时构建失败，要求显式适配。

- `npm run bump -- <issuer-script-id> patch`：同时自动提升合并版 patch。
- 修改合并包装、路由或加入新的银行后：`npm run bump -- card-offer-hub-all patch`。
- `npm run build`、`npm run check`、`npm test`、`npm run test:browser`：重新生成并检查所有产物。
- 单脚本构建也更新合并版、目录和 README；发布前仍须执行完整构建和检查。

## 验证边界

离线回归检查完整组件嵌入、站点隔离、启动时机、独立存储、版本联动和更新地址；Chromium 合成页面检查六家银行的面板启动、无自动请求、刷新后保存与恢复。安装确认界面、真实 Tampermonkey 沙箱和真实银行行为仍待现场验证。
