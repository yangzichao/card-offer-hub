# Card Offer Hub

一个 Tampermonkey 脚本管理六家银行的信用卡 Offer。只维护一个版本、一个安装入口，装一次后由 Tampermonkey 更新。

## 安装入口

<!-- published-scripts:start -->

**[安装 / 更新 Card Offer Hub 1.3.3](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/card-offer-hub-all.user.js)** — 唯一安装包，包含下列 6 家银行。

安装一次，按当前银行页面加载对应功能，所有银行共用一个发布版本。[使用说明](bundles/all/README.md)

| 银行 | 生效站点 |
| --- | --- |
| [Amex](issuers/amex/amex-offer-lite/README.md) | https://global.americanexpress.com/* |
| [BankAmeriDeals](issuers/bank-of-america/bofa-offer-lite/README.md) | https://deals.merchant-rewards.com/* |
| [Chase](issuers/chase/chase-offer-lite/README.md) | https://secure.chase.com/web/auth/* |
| [Citi](issuers/citi/citi-offer-lite/README.md) | https://online.citi.com/US/* |
| [US Bank](issuers/usbank/usbank-offer-lite/README.md) | https://onlinebanking.usbank.com/* |
| [Wells Fargo](issuers/wellsfargo/wellsfargo-offer-lite/README.md) | https://web.secure.wellsfargo.com/auth/deals-portal*<br>https://web.secure.wellsfargo.com/deals-portal/* |

<!-- published-scripts:end -->

机器可读的目录在 [dist/index.json](dist/index.json)。

## 跨银行搜索

面板中的 **Search all banks** 可同时搜索六家银行已保存的 Offer，按银行或状态筛选，查看卡片、扫描时间和有效期，再打开对应银行页面。搜索条件会保留；**Reload saved results** 只读取本地缓存。各家银行需要先手动扫描一次。详见[使用说明](bundles/all/README.md#跨银行搜索)。

六家银行使用统一的浅色界面和三步流程：**Choose scope → Scan offers → Review & add**。搜索只改变列表，**Add all offers** 始终覆盖所选范围中的全部可添加优惠。按钮会说明尚未选范围、需要扫描、冷却或只读等禁用原因。详见[统一操作流程](docs/unified-workflow.md)。

## 安装与更新

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点上面的 **安装 / 更新 Card Offer Hub**，在 Tampermonkey 安装页确认一次，然后刷新银行页面。
3. 之后不用再管。唯一发布文件的 metadata 里带 `@updateURL` 和 `@downloadURL`，Tampermonkey 按自己的周期回来检查版本号，`@version` 比本地高就静默更新。想立刻更新就在 Tampermonkey 面板点 **Check for userscript updates**。

不要把 `dist/` 里的文件内容手动贴进已有脚本。手贴出来的副本没有和更新地址绑定，不会自动更新。同一站点只运行一份 Card Offer Hub。

## 目录

```text
issuers/<issuer>/<tool>/   # 银行模块：无版本号的清单 + src/ 分模块源码 + README
shared/                    # 银行间共享模块，按需引用
bundles/all/               # 唯一发布清单、版本号、本地路由和跨银行搜索
scripts/build/             # 零依赖构建：清单 -> 合并 -> dist/
dist/                      # 发布产物，Tampermonkey 实际抓取的文件；由构建生成，不要手改
docs/                      # 接口依据与维护记录
tests/<issuer>/            # 合成数据的离线回归
tests/build/               # 构建与发布产物自身的回归
```

公共运行核心、存储工厂与界面只在发布包中定义一次，各银行通过独立实例接入。银行负责会话、请求与成功确认，跨银行搜索通过各自的只读快照适配器读取缓存。详见[统一运行架构](docs/unified-runtime.md)。

## 加一个银行模块

1. 建 `issuers/<issuer>/<tool>/src/`，按功能拆成小文件。模块之间靠拼接后的同一作用域共享，不写 `import` / `export`。
2. 写 `issuers/<issuer>/<tool>/userscript.json`：`id`（kebab-case，用于模块与存储隔离）、`name`、`description`、`author`、`issuer`、`matches`、`grants`，以及按拼接顺序排列的 `sources`。声明 `capabilities`、实际需要的 `sharedModules`，并用 `savedResultsSource` 指定已在 `sources` 登记的离线快照读取器。
3. 银行清单不写版本号，发布时统一升版。跑 `npm run build`。`src/` 下漏登记在 `sources` 里的文件会直接让构建失败，不会被悄悄漏掉。
4. 完成构建、检查、单元和浏览器回归；用户要求发布时提交源码和 `dist/`，推到 `main`。

`@updateURL` 里的仓库地址和发布分支写在 [scripts/build/repository.cjs](scripts/build/repository.cjs)。

## 发一个版本

```sh
npm run bump -- patch   # 或 minor / major
npm run build
```

无论修改哪个银行、共享界面或新增银行，都只提升 `bundles/all/userscript.json` 中的统一版本。构建只生成 `dist/card-offer-hub-all.user.js` 和 `dist/index.json`。发布时把源码和 `dist/` 一起提交推到 `main`。Tampermonkey 只认版本号：**版本号没涨，push 了也不会有人收到更新**。

## 本地开发

Node.js 22 或更新版本，构建和单元测试都不需要 npm 依赖。

```sh
npm run build   # 重新生成 dist/
npm run check   # 校验语法，并确认 dist/ 和源码一致（CI 跑的就是这个）
npm test        # 离线回归
```

浏览器验证使用 Playwright 和 Chromium：

```sh
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright npm run test:browser
```

若项目环境已安装 Playwright，可直接运行 `npm run test:browser`。浏览器测试拦截全部网络请求，仅使用合成数据。

本地 HAR 的结构适配检查不会联网，也不会输出卡片或会话标识：

```sh
node tests/amex/verify-har.cjs /absolute/path/to/capture.har
```

静态检查和离线测试不代表当前发卡行网站的接口、登录态或实际登记已经验证通过。现场问题与待验证事项见 [Amex 修复记录](docs/amex-repair-plan.md)。

统一发布流程见[单一安装包说明](docs/single-release.md)。
