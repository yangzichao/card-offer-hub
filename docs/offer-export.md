# 优惠导出与本地 AI 读取

目标：让本机的 AI agent（Claude Code 等）能读到已保存优惠的完整内容，包括详情和条款。整条链路分三段：扫描时保存全文、用户点击导出、本地 CLI/skill 读取文件。全程不新增网络请求，也不新增 Tampermonkey 权限。

## 1. 扫描时保存全文

银行列表响应里本来就带的长描述和条款，在归一化时以 `details` / `terms` 两个字段保留。它们只用于保存结果和导出，**不参与任何添加/激活判断**。

| 银行 | `details` | `terms` | 来源 |
| --- | --- | --- | --- |
| Amex | `longDescription` | `terms.details` | 原有 `groupKey` 已包含这两段，搜索时直接解析，不另存 |
| Chase | `offerDisplayDetails.rewardDescriptionText` | `offerDisplayDetails.termsAndConditionsText` | 列表响应 |
| US Bank | `ad.assets.copy.value.marketingCopy` | `ad.assets.copy.value.termsAndConditions` | 列表响应。GraphQL 只返回点名的字段，1.10.1 之前查询里没有这两项，导出为空 |
| Wells Fargo | `merchantDealDetails.longDescription` | 无 | 列表响应没有条款字段 |
| BankAmeriDeals | `description` | `terms_and_conditions` | `offers-search` 列表响应 |
| Kroger | `longDescription` | `requirementDescription` | 优惠券列表响应 |
| Citi | 无 | 无 | 列表只有标题和类别，条款只出现在登记响应里，不为拿条款额外发请求 |

除 Amex 外，全文存在独立的 GM key `${script-id}:offer-details`，不放进 workspace 快照。原因是 workspace 每次添加都要重写，而 Amex 一类银行可能有上千条、单条条款数 KB。

`offer-details` 格式（`schemaVersion: 1`）：

```json
{ "schemaVersion": 1, "savedAt": 1800000000000,
  "texts": ["Earn 10% back…", "Minimum spend $50…"],
  "entries": { "[\"acct\",\"offer\"]": [0, 1] } }
```

- 相同文本只存一次（`texts` 去重），`entries` 的键与 workspace 记录键相同，`-1` 表示空。单段文本截到 8000 字符。
- 只在一次完整扫描结束时写一次（`recordWorkspaceScan`）。本次扫描带回全文的记录覆盖旧文本；从缓存恢复、本次没带全文的记录沿用旧文本；已不存在的优惠移除。
- 未知版本或损坏的旧值原样保留，保存时置 `storageError` 并阻止后续请求，面板上可见。搜索/导出读取失败时只隐藏全文，优惠本身照常显示。
- 升级后，各银行要**重新扫描一次**才有全文。

## 2. Export all

Search all banks 弹窗里的 **Export all**（`aria-label="Export all saved offers"`）重新读取本地快照，下载 `card-offer-hub-offers-<ISO 时间>.json`。导出忽略当前搜索词和筛选，包含所有已保存优惠。

```json
{
  "format": "card-offer-hub-offers", "schemaVersion": 1,
  "exportedAt": "2026-11-08T09:30:00.000Z", "release": "1.8.0",
  "note": "Saved results from each bank's last manual scan…",
  "statuses": { "available": "…", "added": "…", "review": "…", "other": "…" },
  "coverage": [{ "bankId": "chase-offer-lite", "bankName": "Chase", "state": "saved", "count": 42 }],
  "offers": [{ "bankId": "…", "bankName": "…", "card": "Sapphire · 3003", "merchant": "…",
    "description": "…", "details": "…", "terms": "…", "category": "…", "status": "available",
    "expires": "…", "scannedAt": "2026-11-07T12:00:00.000Z", "incomplete": false, "url": "…" }]
}
```

只含跨银行搜索已经显示的字段加全文：卡片显示名和尾号，没有账户 ID、token、请求头或 Cookie。状态是 `scannedAt` 那次扫描的结果，不代表当前。

## 3. 本地读取：CLI 和 skill

`scripts/offers/read-offer-export.cjs` 零依赖，默认读 `~/Downloads` 里最新的导出文件：

```sh
npm run -s offers -- --query "whole foods"
node scripts/offers/read-offer-export.cjs --bank chase --status available
node scripts/offers/read-offer-export.cjs --query costco --format json
node scripts/offers/read-offer-export.cjs --file /path/to/export.json --no-details --limit 20
```

`--query` 的每个词都必须命中银行、卡片、商户、摘要、详情、条款或类别之一（大小写、重音不敏感）。找不到导出时提示用户去点 Export all；格式或版本不对时报错退出（exit 1）。

`.claude/skills/card-offers/SKILL.md` 让 Claude Code 在本仓库里遇到「哪张卡有 X 的优惠」「这个 offer 条款是什么」时自动调用上面的 CLI，并要求回答时注明导出时间和 `scannedAt`、不把 `available` 说成已添加、没有全文时直说。这个 skill 只在本仓库内加载；全局使用需要把目录链接到 `~/.claude/skills/`。

全局 gitignore 会忽略 `.claude/`，仓库 `.gitignore` 只把 `.claude/skills/` 收回来，`.claude/settings.local.json` 仍被忽略。`tests/build/published-output.test.cjs` 会遍历 `.claude/skills/`，skill 文件被 gitignore 吞掉时测试失败。

## 验证

- `tests/build/offer-details.test.cjs`：文本去重与往返、未知版本拒绝、合并规则、五家银行归一化字段、Kroger 扫描后全文独立保存且搜索可读回、未知版本保留并阻止请求、Amex `groupKey` 解析、导出结构、无账户标识、文件名。
- `tests/offers/read-offer-export.test.cjs`：选最新导出、全文搜索、json/银行/状态/限条数、缺失/外来/损坏文件和错误参数。
- `tests/build/browser-cross-bank-search.cjs`：Chromium 中点击 Export all，下载文件结构、7 条优惠、无账户标识、状态提示、全程无网络请求。

以上全部使用合成数据。

## 待现场验证

- BankAmeriDeals `offers-search` 列表响应是否带 `description` / `terms_and_conditions`：抓包中只确认了 `offers-page` 有 `description`、`offers-details` 两者都有；`offers-search` 响应体未抓到。
- Amex 真实 Offers Hub 响应中 `longDescription`、`terms.details` 的内容；本地抓包没有该响应体，依赖原有代码的字段名。
- Chase、US Bank、Wells Fargo、Kroger 在真实账户扫描后全文确实写入 `offer-details`，且导出中可见。
- 真实 Tampermonkey 中 Blob 下载的文件名与保存位置。
- Amex 等大账户的 `offer-details` 体积是否触及 Tampermonkey 存储限制。
