# Card Offer Hub — All Banks

[一键安装全部银行](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/card-offer-hub-all.user.js)

先安装 Tampermonkey，再点上面的链接，在安装页确认一次。这是唯一发布的安装包，包含全部银行工具。之后由 Tampermonkey 检查并更新整个插件。

打开 Amex、Citi、Chase、BankAmeriDeals、US Bank 或 Wells Fargo 对应页面，只加载该网站的工具。扫描、添加仍需手动点击；Chase 目前仍只支持扫描。

## 跨银行搜索

在任一银行面板点击 **Search all banks**，即可搜索插件保存的六家银行结果。

- 支持商户、优惠内容、类别、银行或卡片名，多词搜索不区分大小写，兼容常见重音字符。
- 可按银行、状态筛选，显示所属卡片、扫描时间、有效期和银行入口。同商户出现在不同卡片时保留各自结果。
- 搜索、银行和状态筛选会保存在本地；一次显示 60 条，点击 Show more 可继续查看。
- **Reload saved results** 只重新读取本地缓存，可读取其他银行页面刚保存的结果；不会访问银行接口，也不会替用户扫描或添加。
- Available when scanned 表示扫描时可用，当前资格和优惠条款需到银行核验；Needs review 不会当成已添加。
- Saved bank coverage 可查看哪些银行尚未扫描，或存储存在读取问题。未知或损坏的数据保留原样，其他银行仍可搜索。

六家银行使用同一套界面和 **Choose scope → Scan offers → Review & add** 三步流程。搜索只过滤显示，Add all offers 的范围不随搜索改变；跨银行搜索读取统一版中保存的数据。详见[统一操作流程](../../docs/unified-workflow.md)。首次使用，需要在每家银行手动扫描一次；仅安装插件不会自动获取其他银行数据。

## 构建与更新

`userscript.json` 定义唯一安装身份、版本和源码顺序，`src/dispatch.js` 负责本地路由和存储隔离，`src/search/` 读取已有快照并呈现搜索结果。银行清单仅描述模块，不包含版本号。构建器将各银行 IIFE 嵌入唯一安装包，所有银行面板显示同一个发布版本。站点、权限和目录自动合并；`src/` 中遗漏登记的文件会使构建失败。

插件在 document-start 注入，Chase 立即安装原生请求观察器，其余工具等 DOM 解析完成后挂载。路由本身没有请求和定时器，不自动扫描或续期。新增银行的匹配语法、权限不受支持时构建失败，要求显式适配。

- `npm run bump -- patch`（或 `minor` / `major`）：只提升统一版本。
- `npm run build`：只生成 `dist/card-offer-hub-all.user.js` 和 `dist/index.json`。
- `npm run check`、`npm test`、`npm run test:browser`：验证发布包、银行模块和完整路由。
- 银行测试直接提取唯一发布包中的模块。

详见[统一发布记录](../../docs/single-release.md)。

## 验证边界

离线回归检查完整组件嵌入、站点隔离、启动时机、独立存储、统一版本和更新地址；Chromium 合成页面检查六家银行的面板启动、无自动请求、刷新后保存与恢复。安装确认界面、真实 Tampermonkey 沙箱和真实银行行为仍待现场验证。
