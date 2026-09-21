# 银行地址覆盖

目标是优先避免漏匹配。不要把脚本限定在某个 Offers 路径：银行可能从登录页或首页通过站内路由进入优惠页，路径也会调整。

## 匹配规则

| 银行 | 安装包匹配范围 | 完整操作面板域名 |
| --- | --- | --- |
| Amex | `https://*.americanexpress.com/*` | `global.americanexpress.com` |
| Citi | `https://*.citi.com/*` | `online.citi.com` |
| Chase | `https://*.chase.com/*` | `secure.chase.com` |
| Bank of America | `https://*.bankofamerica.com/*` 和 `https://deals.merchant-rewards.com/*` | `deals.merchant-rewards.com` |
| US Bank | `https://*.usbank.com/*` | `onlinebanking.usbank.com` |
| Wells Fargo | `https://*.wellsfargo.com/*` | `web.secure.wellsfargo.com` |

`*.` 同时覆盖主域名和任意层级子域名。路径不限，查询参数不会影响匹配，hash 不参与安装包匹配。只在 HTTPS 顶层页面显示，避免 iframe 重复操作面板。

银行清单的 `matches` 是安装包和入口的覆盖范围；`adapterMatches` 明确列出有已知会话/API 实现的域名，并覆盖这些域名的所有路径。构建器检查两个范围与 `offersUrl` 一致。不能仅放宽 `@match` 而保留旧的内部路由，否则安装包虽然注入，界面仍不会出现。

## 用户可见行为

- 完整操作域名：显示该银行的完整面板，恢复已有本地结果；增加可点击的 **Open … offers** 入口。扫描与添加仍需用户点击，并保留已有会话、页面和成功信号检查。
- 主站、登录页和其他子域名：显示 Card Offer Hub 银行入口，提供 **Open … offers** 和 **Search all banks**。不会在未知 origin 上启动银行 API 模块；缓存搜索仍可使用。
- 同域名站内切换：脚本已在最初页面加载，不再因为初始路径不属于 Offers 而遗漏。页面替换面板或 body 后通过 DOM 事件恢复现有面板，不轮询、不自动请求。
- 跨域名跳转：新页面重新匹配，切换为对应入口或完整面板。不会自动跳转、自动登录、自动扫描或自动添加。

入口可折叠。未登录时，完整面板出现不表示银行会话已就绪；进入 Offers 并登录后再执行操作。

## 验证与待现场验证

独立 URL 用例覆盖六家银行的主域名、`www`、其他子域名、登录/网银路径、新旧优惠路径、query 和 hash。用例不从清单生成，避免把漏匹配的规则反过来当作测试标准。另测假冒后缀域名、HTTP 和 iframe 不生效。

浏览器回归使用完整发布包、合成 HTML 和全网络拦截，验证入口、缓存搜索、Offers 链接、跨域名导航、页面替换、重复注入、窄屏及无自动请求。

本地 v1.4.2 验证：

- `npm run build`：PASS。
- `npm run check`：PASS。
- `npm test`：PASS，317 项。
- `PLAYWRIGHT_MODULE_PATH=/Users/zichaoyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright npm run test:browser`：PASS，14 组，包含 18 个主域名/公开入口/其他子域名页面，以及六个操作域名从根路径进入 Offers 的场景。
- `git diff --check`：PASS。

待现场验证：真实 Tampermonkey 安装更新后的域名权限、六家银行当前登录重定向、会话读取和实际站内导航。离线通过不代表已验证真实账户操作；本次不扩大银行 API 合约。

匹配语义参考：[Tampermonkey 官方文档](https://www.tampermonkey.net/documentation.php#meta:match)。
