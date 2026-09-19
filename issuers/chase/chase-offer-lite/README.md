# Chase Offer Lite

Chase Offers 的 Tampermonkey 脚本，提供手动选择卡片和串行扫描的浮动面板。当前版本只提供读取功能；添加 Offer 的请求格式和明确成功信号尚未验证，**Scan & add all** 始终禁用。需要添加时，请使用 Chase 网站本身的操作。

## 安装与使用

构建产物为 [`dist/chase-offer-lite.user.js`](../../../dist/chase-offer-lite.user.js)。首次发布前，在 Tampermonkey Dashboard → Utilities → Import from file 中导入本地文件；发布到 `main` 后可使用 [安装 / 更新链接](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/chase-offer-lite.user.js)，以后由 Tampermonkey 检查版本更新。

1. 安装后刷新 Chase 页面，使脚本在页面加载开始时安装被动观察器。登录并进入 Chase Offers；如果已经停留在 Offers 页面，可切换页面内的卡片，让 Chase 自身正常加载清单。
2. 点击 **Detect cards**，从本标签页已观察到的 Chase 响应缓存读取卡片；此操作不会发出网络请求。再手动勾选需要扫描的卡片，不会默认选择卡片。卡片显示末四位便于区分同名卡，Chase 标记为不符合 Offer 条件的卡不可选择。
3. 点击 **Scan selected**，读取已选卡片的 Offer。
4. 需要中止时点击 **Stop**。已经发出的请求会等到响应并记录结果，然后停止后续请求。

脚本页面加载时仅安装被动观察器，不会自动发出请求；Chase 页面自身的请求照常进行。脚本发出的每次请求必须由点击扫描触发，同一时刻只有一个请求在途，从前一次响应完成起至少间隔 0.5 秒。搜索仅筛选显示内容，不改变扫描卡片。面板最多显示 200 个搜索匹配项，读取清单本身没有此上限。

## 安全与状态

- 使用 Chase 当前浏览器登录会话，不复制抓包中的 Cookie、token 或账户标识，不向第三方发送账户数据。
- HTTP 错误、未知响应及未确认结果会停止流程，不自动重试。遇到 429 按 `Retry-After` 冷却，已有的更长冷却不会被覆盖。
- 存储使用带 schema 版本的结构。存储失败会显示错误并阻止新的操作。
- 卡片和 Offer 数据仅作为当前会话的展示。刷新后重新检测卡片并手动选择。
- 面板仅展示接口明确提供的状态；没有已验证的登记接口时，不会发出添加请求，也不会声称添加成功。

## 验证边界

接口分析依据用户提供的 Chase HAR；抓包仅用于本地分析，账户数据、token、Cookie 和 HAR 不进入仓库或构建产物。离线回归只使用合成数据。

抓包中未发现添加 Offer 的请求及成功响应，因此当前版本不能激活 Offer。未来启用添加功能前，需要包含手动添加成功过程的脱敏证据，以确认登记请求和明确成功响应的契约。

待现场验证：Tampermonkey 在实际 Chase 登录会话中的卡片检测、Offer 扫描、会话过期和限速提示。构建和离线回归不等于真实网站行为已验证。
