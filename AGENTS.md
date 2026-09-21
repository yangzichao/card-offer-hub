# Card Offer Hub

这个仓库只发布一个包含全部银行的 Card Offer Hub Tampermonkey 脚本。下面是所有银行模块都要遵守的规范。
新增脚本、改老脚本、加测试之前先读完这一页。

## 布局

- 每个银行模块住在 `issuers/<issuer>/<tool>/`：一个不含版本号的 `userscript.json` 清单、拆成小模块的 `src/`、一个 `README.md`。唯一发布身份和版本号在 `bundles/all/userscript.json`。
- 跨脚本代码放 `shared/`，通过清单的 `sharedModules` 引入。**等第二个脚本真的需要了再抽**，不要预先抽象。
- 测试：`tests/<issuer>/` 放脚本回归，`tests/build/` 放构建与发布产物自身的回归。维护记录放 `docs/`。
- 命名用描述性的长名字，文件宁可多而小，按功能分子目录（`core/` `api/` `workflows/` `ui/`）。一个文件变大之前就拆，不要等它变大。
- `src/` 模块最后被拼进银行自己的 IIFE：不写 `import` / `export`。公共定义在发布包外层只输出一次，公共名字必须唯一；通过工厂显式传入银行状态、配置和回调，不能读取银行隐含全局变量。
- 银行清单声明 `capabilities`（`activation` 布尔值与 `scope: card|account`）。离线搜索读取器通过 `savedResultsSource` 指向 `sources` 内的一个文件；只定义无副作用的 `readIssuerSavedResults(bank, readValue)`，不访问会话、不发请求。
- 银行清单必须声明 `workflow`，与 `shared/workflows/catalog.json` 中的模板和 scope 匹配。优惠归属、去重与目标分配属于模板；银行 `core/workflow.js` 只转换记录和选择。新增模板/银行前读 `docs/workflow-templates.md`，不要以添加能力或银行名称代替业务模型。

## 发布产物

- `dist/` 是生成的。永远不要手改，也不要把它的内容手贴进已安装的脚本。
- `dist/card-offer-hub-all.user.js` 是唯一安装包，`dist/` 只保留它和 `index.json`。不再生成银行单独版。它的 `@updateURL` / `@downloadURL` 指向发布分支上的 raw 地址，仓库和分支配置在 `scripts/build/repository.cjs`。
- **小心全局 gitignore 静默吞掉整个目录。** 这个坑已经踩过两次：`dist/` 被吞时所有 `@updateURL` 变 404，`build/` 被吞时整个 `scripts/build/` 管线连同它的测试都没进仓库 —— 两次都毫无报错，push 看起来完全正常。本仓库 `.gitignore` 底部用 `!` 把 `dist/`、`scripts/build/`、`tests/build/` 逐个收回来。新建目录后跑一次 `npm test`：`tests/build/published-output.test.cjs` 会走一遍真实目录树，任何被忽略的项目文件都会让它失败。
- 银行模块的身份只写一次，在各自 `userscript.json` 里。源码通过构建常量 `__USERSCRIPT_ID__` / `__USERSCRIPT_NAME__` 读取；`__USERSCRIPT_VERSION__` 统一取自 `bundles/all/userscript.json`。**不要在银行清单中添加版本号，也不要在 `src/` 里硬编码名字或版本号**。
- 一个 tool 的 `src/` 下每个 `.js` 都必须在清单的 `sources` 里出现且只出现一次，顺序就是拼接顺序。漏登记会直接让构建失败，不会被悄悄跳过。
- 源码改动和重新构建的 `dist/` 一起提交。`dist/` 过期的 push 会把旧代码发给所有已安装的用户。

## 脚本行为准则

这些是发给真人、跑在真实账户页面上的脚本。下面几条不是风格偏好，是安全边界：

- **不自动跑。** 脚本不装任何定时器、不在页面加载后自己发请求。每一个网络请求都要能追溯到用户的一次点击。点了之后可以无人值守跑完，但起点必须是显式的。
- **限速串行。** 同一时刻只有一个请求在飞，间隔从上一个响应完成开始算。429 要按 `Retry-After` 进入冷却，且已有的更长冷却不能被更短的覆盖。
- **不自动重试。** 失败、未确认、HTTP 错误都停下来并要求用户重新扫描，不要盲目重发。
- **只信明确的成功信号。** 服务端没有明确说成功（例如 `isEnrolled === true`）就记成未确认，不要当成功。
- **持久化要带 schema 版本。** 存到 GM storage 的快照带 `schemaVersion`，升级时写前向迁移，不要静默丢用户数据。保存失败要在 UI 上看得见。
- **UI 控件都要有 `aria-label`。** 浏览器测试按 role + name 选元素，没有可访问名字的控件测不到。

## 测试

- **合成数据。** 永远不要提交账户抓包、token 或 HAR 文件。`*.har`、`work/`、`analysis/` 已在 `.gitignore` 里。
- 单元测试跑的是**构建产物** `dist/card-offer-hub-all.user.js`，由 `tests/helpers/published-issuer-source.cjs` 提取实际发布的公共定义和银行模块，再通过 `tests/<issuer>/helpers/` 里的 vm harness 载入。不要为测试另建单独版产物。harness 需要暴露新函数时改 probe 列表。
- vm realm 里创建的数组和宿主的原型不同，`assert.deepStrictEqual` 会报「same structure but not reference-equal」。跨 realm 比较先 `Array.from(x, fn)` 转成本地数组。
- 浏览器回归用 Playwright + Chromium：拦截**全部**网络请求，只喂合成数据，用 `page.clock` 跑虚拟时间而不是真的等。
- 离线回归结果不等于发卡行网站当前行为已验证。写结论时把两者分开说。

## 验证

改任何脚本或构建之后，跑完这三条再说做完了：

```sh
npm run build   # 重新生成 dist/
npm run check   # CI 跑的就是这个：语法、dist/ 是否同步、孤儿产物、README 安装表是否过期
npm test        # 离线回归
```

改了工作流或 UI 还要跑 `npm run test:browser`（需要可用的 Playwright 运行时）。
汇报时写清楚跑了哪条命令、结果是 pass 还是 fail，不要只说「测过了」。

## 发版

- Tampermonkey **只认版本号**。`@version` 没涨，push 了也不会有任何人收到更新。
- 流程：`npm run bump -- <major|minor|patch>` → `npm run build` → 源码和 `dist/` 一起提交推到 `main`。只升统一版本，不支持银行 ID 或定向 `--script` 构建；提交推送仍需用户明确要求。
- 行为变化记到 `docs/`，还没在真实网站上验证过的事情放进「待现场验证」，不要写成已完成。

## 仓库工作流

- 保留无关改动，按精确路径 stage。
- 只有用户明确要求时才 commit / push。
