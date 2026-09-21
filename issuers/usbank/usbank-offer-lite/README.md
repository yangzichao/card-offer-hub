# US Bank Offer Lite

本银行功能随 [Card Offer Hub 统一安装包](../../../bundles/all/README.md) 发布。

手动扫描、选择并激活 US Bank Cash Back Deals 的 Tampermonkey 脚本。每次激活后回查服务端，只有该优惠的 `activationState === "ACTIVATED"` 才计为成功。

## 使用

1. 发布到 main 后，从 [安装 / 更新](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/card-offer-hub-all.user.js) 安装；本地开发产物为仓库 `dist/card-offer-hub-all.user.js`，可在 Tampermonkey Utilities 中从文件导入。不要手贴覆盖已安装脚本。
2. 登录 US Bank，在网站内进入 **Cash Back Deals**，等待原页面加载完毕。脚本显示浮动面板，但不会自动请求。
3. 点击 **Scan offers**。扫描不会自动勾选优惠。
4. 点击 **Add all offers** 添加扫描结果中全部可添加优惠；如只需要部分优惠，逐项勾选后点击次要操作 **Add selected**。
5. 本次运行先刷新列表，再逐个激活和回查。**Stop** 会停止后续请求；进行中的激活若尚未回查，仍标为 `UNCONFIRMED`。继续前重新扫描。

抓包里的 Cash Back Deals 使用客户级会话，没有逐卡选择字段，因此本脚本不提供卡片白名单，也不声称把优惠添加到某张卡。仅操作当前登录客户的优惠；Add all offers 和 Add selected 分别对应全部可添加项和手动选中项。

搜索只筛选显示。**Add all offers** 与 **Select all available** 都包含搜索结果之外的可激活优惠；前者直接启动批量添加，后者只更新选择。计数显示实际选中数量。清空选择使用 **Clear selection**。

## 边界

- 正常请求从上一个完整响应结束后按本行已学习的间隔等待，首次 1000 毫秒、最低 500 毫秒，限流时减速，串行执行；每次激活需要额外回查，因此不保证每秒激活两个优惠。不同标签页通过 Web Locks 互斥。
- 只处理 `NEW` / `SERVED`、`ACTIVATABLE`、`VISIBLE` 且有效期内的 Cash Back Offer。跳过未知状态、重复 ID、自动激活、联盟推广和要求跳转商户链接的优惠。
- 激活接口的 `requestId` 只作为接收确认。回查未出现 `ACTIVATED`、HTTP/GraphQL 错误、超时或断网都停止，不轮询、不自动重发。重新扫描后才能再次选择激活。
- 429 遵守 `Retry-After`，缺失时冷却 5 分钟；已有更长冷却不会被缩短。
- 登录信息仅在点击后读取当前页面 `sessionStorage`。会话变化会阻止旧选择继续请求。GM storage 保存带 `schemaVersion` 的优惠展示字段、勾选、搜索和面板状态，并独立保留限速时间；不保存原始客户标识、凭证或 serving token。使用客户标识的 SHA-256 指纹区分账户；同客户重新扫描保留仍可激活的选择，换客户清除选择。存储异常会显示并阻止进一步请求。
- 不自动刷新银行页面或修改其优惠徽标；以脚本回查结果为准，完成后可手动刷新。

## 验证

```sh
npm run build
npm run check
npm test
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright npm run test:browser
node tests/usbank/verify-har.cjs /absolute/path/to/capture.har
```

测试使用构建产物、合成数据和全网络拦截。HAR 检查只在本地读取，不输出标识或凭证，不重放请求。真实账户运行和激活回查仍需现场验证，见 [接口记录](../../../docs/usbank-api-contract.md)。

## 本地保存与恢复

扫描结果、已有选择、搜索条件和面板折叠状态保存在 Tampermonkey 本地存储，刷新或重新打开后恢复。页面显示最后完整扫描时间；恢复本身不发网络请求、不自动添加。取消勾选也会保存，不因刷新重新选中。

保存失败会显示错误；未知或损坏的快照保留原数据，不静默覆盖。快照只保存展示字段和选择，Cookie、登录 token、请求头、原始响应和地理位置不写入快照。正在添加时刷新，未确认的项目保留为未确认，后续先扫描核验。详见[持久化说明](../../../docs/local-persistence.md)。

自动调速的样本、间隔与冷却按银行保存，刷新页面不丢失，也不自动启动任务。速度详情默认折叠，无需用户调参。算法、缓存迁移与现场验证边界见[自动调速](../../../docs/adaptive-pacing.md)。
