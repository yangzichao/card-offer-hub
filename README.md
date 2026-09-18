# Card Offer Hub

集中维护信用卡 Offer 的 Tampermonkey 脚本。所有脚本从这个仓库发布，装一次之后由 Tampermonkey 自动更新。

## 已发布脚本

<!-- published-scripts:start -->

| 脚本 | 发卡行 | 版本 | 生效站点 | 安装 |
| --- | --- | --- | --- | --- |
| [Amex Offer Lite](issuers/amex/amex-offer-lite/README.md) | amex | 5.0.0 | https://global.americanexpress.com/* | [安装 / 更新](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/amex-offer-lite.user.js) |

<!-- published-scripts:end -->

机器可读的目录在 [dist/index.json](dist/index.json)。

## 安装与更新

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点上表里的 **安装 / 更新** 链接，Tampermonkey 会弹出安装页，确认即可。
3. 之后不用再管。每个发布文件的 metadata 里带 `@updateURL` 和 `@downloadURL`，Tampermonkey 按自己的周期回来检查版本号，`@version` 比本地高就静默更新。想立刻更新就在 Tampermonkey 面板点 **Check for userscript updates**。

不要把 `dist/` 里的文件内容手动贴进已有脚本。手贴出来的副本没有和更新地址绑定，不会自动更新。旧版本手动安装过的同名脚本要先删掉，否则两份会同时匹配同一个站点。

## 目录

```text
issuers/<issuer>/<tool>/   # 每个脚本：userscript.json 清单 + src/ 分模块源码 + README
shared/                    # 跨脚本共享模块，按需引用
scripts/build/             # 零依赖构建：清单 -> 合并 -> dist/
dist/                      # 发布产物，Tampermonkey 实际抓取的文件；由构建生成，不要手改
docs/                      # 迁移来源与修复记录
tests/<issuer>/            # 合成数据的离线回归
tests/build/               # 构建与发布产物自身的回归
```

## 加一个新脚本

1. 建 `issuers/<issuer>/<tool>/src/`，按功能拆成小文件。模块之间靠拼接后的同一作用域共享，不写 `import` / `export`。
2. 写 `issuers/<issuer>/<tool>/userscript.json`：`id`（kebab-case，决定发布文件名）、`name`、`version`、`description`、`author`、`issuer`、`matches`、`grants`，以及按拼接顺序排列的 `sources`。
3. 跑 `npm run build`。`src/` 下漏登记在 `sources` 里的文件会直接让构建失败，不会被悄悄漏掉。
4. 提交源码和 `dist/`，推到 `main`。

`@updateURL` 里的仓库地址和发布分支写在 [scripts/build/repository.cjs](scripts/build/repository.cjs)。

## 发一个版本

```sh
npm run bump -- <script-id> patch   # 或 minor / major
npm run build
```

然后把 `dist/` 的改动一起提交推到 `main`。Tampermonkey 只认版本号：**版本号没涨，push 了也不会有人收到更新**。

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

迁移来源见 [迁移说明](docs/migration.md)。
