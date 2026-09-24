# 面板 UI/UX 重设计（1.6.6）

本次只改界面与交互，不改扫描、添加、限速、存储和成功判定。所有按钮名称、`aria-label` 与银行差异保持不变。

## 审计：旧面板的问题

用合成数据渲染六家银行面板、折叠态与跨行搜索后，问题集中在以下几处：

1. **占地过大，折叠也不省地方。** 表头有四行（品牌、标题、版本、更新），下面还有两条通栏入口。折叠后仍约 390px 高，在银行页面右下角挡住内容。
2. **强调色太多。** 「Search all banks」和「Open 银行 offers」两条绿色通栏叠在一起，和主按钮争抢注意力。
3. **状态离按钮太远。** 除 Citi 外，任务状态、存储错误都在页脚，长列表时要滚到底才能看到。运行中只有一行文字，没有进度条。
4. **嵌套滚动。** 面板本身滚动，卡片列表 180px、优惠列表 260px 又各自滚动。滚轮容易被困住，Stop 按钮会跟着内容滚出视野。
5. **列表难扫读。** 状态（Available / Added / Needs review）埋在灰色小字里，与卡名、日期挤在一行。Amex 每条优惠七行。
6. **说明文字堆叠。** 范围区域常有两三段灰色说明（模板提示 + 银行提示 + 保存说明），真正的控件被推到下面。
7. **US Bank 的选择操作分三行换行**，看不出它们是一组。
8. **搜索弹窗偏营销风格**（大标题「Find your next offer.」），结果卡片松散，一屏只放下两三条。

## 参考

- **同类产品**：CardPointers 扩展同样在银行页面上工作，提供一键全部添加、按卡查看并支持勾选部分优惠，以及跨卡的搜索和排序（[扩展介绍](https://cardpointers.com/extension/)、[Doctor of Credit 评测](https://www.doctorofcredit.com/free-chrome-extension-easily-adds-all-available-amex-offers/)）。本项目不自动运行，但“先选范围，再批量添加，可随时搜索”的信息层级一致。
- **进度反馈**：超过约 10 秒的操作应显示完成百分比，进度只增不减（[NN/g：Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)、[NN/g：Progress Indicators](https://www.nngroup.com/articles/progress-indicators/)）。逐条添加几十个优惠正属于这种情况。
- **批量操作栏**：批量操作要始终够得到，常见做法是固定在列表上方或下方的操作栏，并显示所选数量（[Bulk actions UX](https://www.eleken.co/blog-posts/bulk-actions-ux)、[eBay Playbook：Bulk editing](https://playbook.ebay.com/design-system/patterns/bulk-editing)）。
- **第三方页面上的浮层**：保持非模态、尽量小，可以收起成小启动器，不遮挡宿主页面的按钮（[Firefox Extension Workshop](https://extensionworkshop.com/documentation/develop/user-experience-best-practices/)、[Intercom Messenger 定位](https://www.intercom.com/help/en/articles/6612589-set-up-and-customize-the-messenger)）。
- **列表筛选**：常用的状态切分应当一眼可见，并标出每类数量（[SaaS filtering patterns](https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns)）。

## 设计原则

1. **单一强调色**：中性灰白为底，绿色只用于主操作、链接、勾选和「已添加」状态。
2. **操作与反馈相邻**：按钮、原因说明、任务状态、进度条放在同一个操作区，且在列表上方。
3. **Stop 永远可见**：只有面板主体一个滚动区，操作区在滚动时吸顶。
4. **状态可扫读**：每条优惠右侧显示状态标签，颜色区分可添加、已添加、需核验和跳过。
5. **少占地方**：表头压成两行，折叠后只剩表头。

## 方案

### 外壳

- 表头两行：卡片图标 + `CARD OFFER HUB · v1.6.6 · Update` 一行，银行名称一行，右侧收起按钮。更新入口在折叠态仍可见。
- 折叠后只保留表头，宽度收窄为紧凑条。
- 面板改为纵向布局：表头固定，主体单独滚动；取消卡片列表和优惠列表的内部滚动。

### 跨行入口

- 「Search all banks」和「Open 银行 offers」合并为表头下方的一行工具栏，放进面板主体，折叠时一起收起。两者都是次要按钮，不再是绿色通栏。

### 步骤与操作区

- 两个步骤标题前加序号（1 选择范围、2 优惠与操作），标题文字不变。
- 操作区（`.hub-command`）包含主操作、原因说明、任务状态、存储错误和进度条，吸顶。所有银行的 `#status` 与 `#storage-error` 都移到这里，不再只有 Citi。
- 新增进度条（`role="progressbar"`）：有总数时显示确定进度（已完成 / 总数），扫描等没有总数的任务显示不确定进度。每个面板仍只有一个 `role="status"`。
- 原因说明、任务状态和存储错误改成带左边线的提示块，颜色分别为中性、中性和错误红。

### 搜索与列表

- 搜索框带放大镜图标，「Clear search」按钮移入输入框右侧。
- 优惠行统一由 `shared/ui/offer-row.js` 生成：第一行商户名 + 状态标签，第二行优惠内容，第三行卡片与到期日。US Bank 的勾选框放在行首。
- US Bank 的「Add selected / Select all / Clear selection」合成一组紧凑选择工具栏。
- Amex 保留卡片排序、每卡统计和目标卡说明的全部文字，压缩行距与按钮尺寸，并把卡片级徽章改为紧凑标签。

### 跨行搜索弹窗

- 标题改为「Search saved offers」，缩小字号；筛选条件与按钮排成一行。
- 结果改为同一容器内的分隔列表，行距更紧凑，状态标签与面板一致。

### 银行入口页

- 「Open 银行 offers」作为主按钮，「Search all banks」作为次要按钮。

## 保留的契约

- 按钮与控件的 role、`aria-label` 和文字不变；`.hub-step > h3` 文字、`.hub-eyebrow`、`.hub-version`、`data-workflow` 不变。
- 状态仍在操作按钮下方、优惠列表上方（Citi gherkin 场景）。
- 按钮、状态、原因说明不使用 `text-transform`，避免改变 `innerText`。
- 所有网络行为、确认规则和存储结构不变。

## 验证

新增的回归断言：

- `tests/build/browser-all-in-one.cjs`（六家银行）：每条优惠都有状态标签；空闲时操作区只有一个主操作；进度条空闲时隐藏；折叠后隐藏快捷入口、面板高度小于 96px、更新入口仍可见；短视口下只有面板主体滚动，滚到列表末尾时操作按钮仍在可视区内。
- `tests/amex/browser-bulk-tab-switch.cjs`：批量添加进行中进度条报告 0 / 3，结束后隐藏。

用重设计前的构建产物运行这两个测试，分别在状态标签和进度条断言处失败；用新产物运行则通过。

```sh
npm run build
npm run check
npm test
npm run test:browser
```

本次结果：build、check 均 PASS；443 项单元回归 PASS；18 组浏览器回归 PASS；17 个 gherkin 场景（187 步）PASS。浏览器回归全部拦截网络、只用合成数据，不证明真实银行页面上的表现。

## 待现场验证

离线回归只证明合成页面上的布局和交互。以下需要在真实 Tampermonkey 和银行页面观察：

- 吸顶操作区与银行页面自身的固定导航、聊天浮窗是否冲突。
- 折叠紧凑条在各银行页面右下角是否遮挡宿主页面的按钮。
- Firefox 旧版本（不支持 `:has()`）上，折叠后的宽度会回退为完整宽度，功能不受影响。
