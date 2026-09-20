# 单一安装包发布

2026-09-20：从 Card Offer Hub — All Banks 1.3.1 起，只维护一个版本、一个安装入口、一个 Tampermonkey 脚本。此版本包含 Chase 首页默认卡识别修复。

## 发布与源码

- 唯一身份和版本在 `bundles/all/userscript.json`；保持现有名称、namespace、更新地址和下载地址，已有 All Banks 安装可正常升级。
- 银行清单继续保留稳定的模块 ID、名称、站点匹配、权限与源码顺序，不含独立版本。模块 ID 和存储前缀保持不变，已有统一版快照无需迁移。
- 各银行源码保持按功能拆分，各自 IIFE 隔离。构建常量 `__USERSCRIPT_VERSION__` 全部来自统一发布版本；银行模块不再生成自己的 metadata 或安装文件。
- `dist/` 只包含 `card-offer-hub-all.user.js` 和 `index.json`。构建与检查不允许存在其他发布文件。
- `dist/index.json` 的 schemaVersion 为 2，`scripts` 仅一个发布记录，其 `includes` 描述银行模块。
- 发版命令为 `npm run bump -- patch`，也可选 `minor` / `major`。所有改动通过这一个版本发布。

## 单用户维护范围

只维护统一插件，不保留银行独立安装包、独立版本记录、更新桥接或迁移入口。Amex 已移除从网站 localStorage 导入早期白名单的兼容代码；无统一插件快照时，卡片检测和选择都从手动操作开始。

统一插件内部的正常快照保存、恢复、schema 校验和前向迁移继续使用。加载和升级不会触发账户请求；Chase 仍为只读扫描。

## 回归与验证边界

各银行 vm、HAR 和浏览器回归由 `tests/helpers/published-issuer-source.cjs` 提取最终发布包中对应的精确模块。没有测试专用独立构建或读取源码的后备路径。完整包浏览器回归继续验证六家银行的路由、启动时机、存储隔离、跨银行搜索和刷新恢复。

构建回归覆盖：统一版本注入、唯一 metadata、单一目录记录、旧产物清理、拒绝银行版本号、拒绝旧升版与定向构建方式。合成浏览器回归不代表真实 Tampermonkey 更新界面或当前银行会话已经现场验证。

1.3.1 本地验证：`npm run build` PASS；`npm run check` PASS；`npm test` PASS（266 项）；`PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright npm run test:browser` PASS（12 组）。回归确认旧网站白名单即使非空或损坏，也不会导入选择、自动检测或覆盖插件快照。
