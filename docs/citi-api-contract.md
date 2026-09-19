# Citi Merchant Offers 接口记录 · 2026-09-19

依据：用户提供的本地 HAR，以及其中捕获的 Citi 官方前端 bundle。原始 HAR 不复制进仓库；下文没有账户、会话值或真实 Offer ID。

## 已观察到的列表请求

`POST /gcgapi/prod/public/v1/digital/customers/creditCards/merchantOffers/retrieve`

- 初次 body 为 `{}`，返回 `cardArtDetails` 和默认卡片的 `merchantOffers`。
- 切卡 body 为 `{ "accountId": "synthetic-card-id" }`；本次抓包中切卡响应的 `cardArtDetails` 为 `[]`。
- `cardArtDetails` 中使用 `accountId`、`displayProductName`；不会根据 `primaryAccountFlag` 自动选择卡片。
- `merchantOffers` 为分类数组，每项含 `displayOffersCategory` 与 `offers` 数组。
- Offer 字段：`offerId`、`offerStatus`、`merchantName`、`offerTitle`、`offerEndDate` 等。
- 实际观察到 `AVAILABLE`、`ENROLLED`。抓包中没有列表分页参数；一次返回数百条 Offer。按卡片和 Offer ID 去重后处理，未知状态不登记。
- 默认响应的 Offers 不归属到用户后来勾选的卡片，每张选中卡都用明确的 `accountId` 重新读取。

## 由实际请求和官方前端代码确认的登记调用

`POST /gcgapi/prod/public/v1/digital/customers/creditCards/accounts/rewards/specialOffers/enrollMerchantOffer`

```json
{ "offerId": "synthetic-offer-id", "accountId": "synthetic-card-id", "oneClickEnroll": "true" }
```

注意 `oneClickEnroll` 是字符串。官方 `enrollOneClickMO` 检查非空 `MerchantOfferDetails` 和 `EnrolledOfferInfo`；详情页登记另外检查 `EnrolledOfferInfo.enrollmentId`。脚本同时要求非空详情与非空登记 ID，有可选身份/状态字段时校验一致性。

第二份 HAR（同日 09:09 提供）已包含 **4 次 HTTP 200 成功登记**：涉及 2 张卡、3 个不同 Offer，其中一个 Offer 在两张卡上分别登记。四次请求都与脚本生成的 body 完全匹配，`oneClickEnroll` 都是字符串 `"true"`。

四次响应均包含匹配请求的 `MerchantOfferDetails.offerId`、`offerStatus: "ENROLLED"` 和非空字符串 `EnrolledOfferInfo.enrollmentId`。响应不回显 `accountId`；脚本按当前串行请求的卡片关联结果。详情文案位于 `MerchantOfferDetails.merchantOfferText[]`，`ActivatedCouponInformation` 可以包含 null 和空数组，不能因此把成功登记判成失败。

现有脚本对这四次响应均判定成功，无需修改运行时接口或成功判断。测试使用手工编写的合成值重建相同的响应结构，没有复制真实商户优惠文案、账户或登记 ID。返回空对象、仅 HTTP 200 或单纯页面按钮消失仍不计为成功。

## 当前会话请求头

Citi 的 `establishCookiePackage` 将 `appVersion`、`businessCode`、`channelId`、`client_id`、`countryCode` 写为 Cookie。脚本每次请求从这些当前 Cookie 读取相应头；`TMXSessionId` 来自 `tmx_sessionid`，生产 `environmentID` 为 `SuperMarioPROD`。如有 `XSRF-TOKEN`，附带对应 `X-XSRF-TOKEN` 头。

凭据由同源浏览器请求携带。脚本不读取或持久化认证 Cookie，不使用 HAR 的任何会话值，目标 origin 与 API 路径固定；不跟随登录重定向。

抓包中的 `app-envConfig.json` 启用 `newSessionDeleteLogic: true`；请求中没有可见的 `Authorization`/`bizToken` 头。这是当前版本的认证依据，不能把脱敏 HAR 中缺失的敏感头当成它们永远不存在的证明。其他旧版共存登录模式不在此版本的已验证范围内。

## 离线验证

```sh
npm run build
npm run check
npm test
PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright npm run test:browser
node tests/citi/verify-har.cjs /absolute/path/to/capture.har
```

HAR 校验器只输出统计和结构结论，不打印 ID/请求头、不写入副本、不重放请求。合成回归覆盖卡片选择、跨卡同 Offer、重复分类、未知响应、429、HTTP 错误、取消、存储错误及多标签锁。

## 待现场验证

- Tampermonkey 中当前 Citi Cookie 配置、同源凭据与请求头能否成功完成实际读取。
- 脚本在 Tampermonkey 中发出请求并成功登记的端到端验证；HAR 已确认网站自身的四次登记成功，但不证明这四次是脚本发出的。
- 特殊类别 Offer 是否存在额外的资格或同意步骤；如果返回未知结果，脚本将停止等待重新扫描。
- 长批次的登录会话有效期。此版本不执行 keepalive、不自动登录或续期。

本次仅在本地解析抓包和运行合成测试，没有重放登记请求，也没有发布到 GitHub。
