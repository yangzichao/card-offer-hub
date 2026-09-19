# US Bank Offer Lite

手动扫描、选择并激活 US Bank Cash Back Deals 的 Tampermonkey 脚本。每次激活后回查服务端，只有该优惠的 `activationState === "ACTIVATED"` 才计为成功。

## 使用

1. 发布到 main 后，从 [安装 / 更新](https://raw.githubusercontent.com/yangzichao/card-offer-hub/main/dist/usbank-offer-lite.user.js) 安装；本地开发产物为仓库 `dist/usbank-offer-lite.user.js`，可在 Tampermonkey Utilities 中从文件导入。不要手贴覆盖已安装脚本。
2. 登录 US Bank，在网站内进入 **Cash Back Deals**，等待原页面加载完毕。脚本显示浮动面板，但不会自动请求。
3. 点击 **Scan offers**。扫描不会自动勾选优惠。
4. 单独勾选优惠，或点击 **Select all available**，然后点击 **Activate selected**。
5. 本次运行先刷新列表，再逐个激活和回查。**Stop** 会停止后续请求；进行中的激活若尚未回查，仍标为 `UNCONFIRMED`。继续前重新扫描。

抓包里的 Cash Back Deals 使用客户级会话，没有逐卡选择字段，因此本脚本不提供卡片白名单，也不声称把优惠添加到某张卡。仅操作当前登录客户的已选优惠。

搜索只筛选显示。**Select all available** 包含搜索结果之外的可激活优惠；计数显示实际选中数量。清空选择使用 **Clear selection**。

## 边界

- 正常请求从上一个完整响应结束后等待 500 毫秒，串行执行；每次激活需要额外回查，因此不保证每秒激活两个优惠。不同标签页通过 Web Locks 互斥。
- 只处理 `NEW` / `SERVED`、`ACTIVATABLE`、`VISIBLE` 且有效期内的 Cash Back Offer。跳过未知状态、重复 ID、自动激活、联盟推广和要求跳转商户链接的优惠。
- 激活接口的 `requestId` 只作为接收确认。回查未出现 `ACTIVATED`、HTTP/GraphQL 错误、超时或断网都停止，不轮询、不自动重发。重新扫描后才能再次选择激活。
- 429 遵守 `Retry-After`，缺失时冷却 5 分钟；已有更长冷却不会被缩短。
- 登录信息仅在点击后读取当前页面 `sessionStorage`。会话变化会阻止旧选择继续请求。账户标识、优惠和凭证不写入 GM storage；只保存带 `schemaVersion` 的等待／冷却时间。存储异常会显示并阻止进一步请求。
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
