# IP Radar · Cloudflare 网络情报与隐私检测平台

一个以中文为默认语言的 IP 信息和网络隐私检测站，使用 **React + TypeScript + Vite + Cloudflare Workers** 构建。前端静态资源与 API Worker 在同一个项目中部署，不需要 VPS。

> 项目已包含可运行的基础功能和后端接口。VPN / Proxy / Tor 等安全情报需要配置 `ipapi.is` API Key 才能获得完整检测字段；真实 DNS 泄露测试需要自己的探测子域名和 Cloudflare DNS Analytics 只读 Token。没有配置时，页面会明确显示“未配置 / 未知”，不会使用演示数据伪装真实检测。

## 功能清单

| 功能 | 当前实现 | 说明 |
|---|---|---|
| 首页自动识别 IP | ✅ | 从 Cloudflare `CF-Connecting-IP` 与 `request.cf` 获取访客 IP、国家/地区、ASN、运营商等 |
| 任意 IPv4 / IPv6 查询 | ✅ | 服务端调用 ipapi.is，避免把 API Key 暴露给浏览器 |
| IP 纯净度参考评分 | ✅ | 可用安全情报字段计算风险参考分；未配置 Key 时仅显示低可信度基础评估 |
| VPN / Proxy / Tor / 数据中心 / 滥用检测 | ✅* | 完整字段依赖 ipapi.is API Key；匿名接口不返回这些字段 |
| DNS 泄露检测 | ✅* | 使用随机子域名触发递归解析，再通过 Cloudflare DNS Analytics `sourceIP` 观察解析器出口；需要按下文配置探针域名 |
| WebRTC 检测 | ✅ | 在浏览器内创建临时 ICE 会话，不申请摄像头或麦克风权限 |
| IPv4 / IPv6 出口检测 | ✅ | 通过 ipify 的 IPv4 / IPv6 专用端点检测 |
| DNS 查询 | ✅ | Cloudflare 公共 DoH，支持 A / AAAA / CNAME / MX / NS / TXT / CAA / SOA |
| WHOIS / RDAP | ✅ | 服务端代理查询 `rdap.org` |
| IPv4 CIDR 计算 | ✅ | 子网掩码、网络地址、广播地址、主机范围和数量 |
| 网络延迟 / 下载测速 | ✅ | 本站 Worker 往返延迟，以及可选 Cloudflare 测速端点 |
| 手机端适配 / 动效 | ✅ | 响应式布局、CSS 动画、减少动态效果偏好支持 |

`*` 需要自行配置外部服务或 Cloudflare DNS 探针。功能边界和结果可信度会在页面中说明。

## 技术架构

- 前端：React、TypeScript、Vite、Lucide Icons、原生 CSS 动效。
- 后端：Cloudflare Workers（`worker/index.ts`）。
- 静态资源：Workers Static Assets（构建输出 `dist/`）。
- IP 情报：ipapi.is（可匿名查询基础归属信息；建议添加免费 API Key 以启用安全字段）。
- DNS 泄露：Cloudflare Authoritative DNS Analytics GraphQL API。
- DNS 查询：Cloudflare Public DNS over HTTPS。
- IP 注册信息：RDAP bootstrap 服务 `rdap.org`。

## 目录结构

```text
IP-Radar-CF/
├── src/
│   ├── App.tsx              # 页面、导航、检测交互
│   ├── api.ts               # 前端 API 封装
│   ├── types.ts             # 数据类型
│   ├── utils.ts             # IP/CIDR 等工具方法
│   ├── main.tsx             # 前端入口
│   └── styles.css           # 深色科技风样式与动效
├── worker/
│   └── index.ts             # Cloudflare Worker API
├── public/
├── .github/workflows/       # GitHub CI
├── wrangler.jsonc           # Workers 部署配置
├── vite.config.ts
└── README.md
```

---

# 部署到 GitHub + Cloudflare

## 方案 A：使用 Cloudflare Workers Builds 连接 GitHub（推荐）

### 1. 上传到 GitHub

1. 在 GitHub 新建一个空仓库，例如 `IP-Radar-CF`。
2. 解压本项目压缩包。
3. 将压缩包内的**所有文件和文件夹**上传到仓库根目录，不要再套一层 `ip-radar-cf/` 文件夹。
4. 确认仓库根目录能看到 `package.json`、`wrangler.jsonc`、`src/`、`worker/` 和 `README.md`。
5. 不要上传 `.dev.vars`、`.env`、API Token 或任何真实密钥。

### 2. 在 Cloudflare 创建 Worker

1. 登录 Cloudflare Dashboard。
2. 打开 **Workers & Pages**。
3. 选择创建应用 / Worker，并选择从 GitHub 仓库导入（界面文案可能随 Cloudflare 后台调整）。
4. 选择刚才的 `IP-Radar-CF` 仓库和需要部署的分支（通常为 `main`）。
5. 构建命令填写：

   ```bash
   npm run deploy
   ```

   如果界面要求单独填写构建命令和部署命令，可分别填写：

   ```bash
   npm run build
   npx wrangler deploy
   ```

6. 安装依赖使用 npm，项目根目录为仓库根目录。
7. 保存并首次部署。

> 如果 Cloudflare 的 Git 导入界面没有自动注入部署权限，请按照它的提示授权 Cloudflare GitHub App / Workers Builds。不要把 Cloudflare API Token 写入仓库文件。

### 3. 绑定自己的域名

首次部署成功后，在 Worker 的 **Settings → Domains & Routes** 中添加自定义域名，例如 `ip.example.com`。Cloudflare 会按提示创建所需 DNS 记录并配置 HTTPS。也可以先用 `workers.dev` 地址测试。

### 4. 配置 IP 情报 Key（强烈建议）

`ipapi.is` 的匿名接口只返回基础归属与地理信息，不返回完整的 VPN / Proxy / Tor / Data Center / Abuser 检测字段；官方说明匿名请求有较低每日额度，而注册免费账户可获得带完整字段的免费额度（截至本项目编写时文档为 1,000 次/天，具体以服务商页面为准）。

1. 访问 <https://ipapi.is/> 注册并取得 API Key。
2. 打开 Cloudflare Worker → **Settings → Variables and Secrets**。
3. 新增 Secret：
   - Name：`IPAPIIS_KEY`
   - Value：你的 ipapi.is API Key
4. 保存后重新部署 / 触发一次新部署。

Key 只保存在 Worker Secret，绝不要放入 `src/`、`.env` 或 GitHub 仓库。

---

# DNS 泄露检测探针配置（可选，但要真实检测就必须完成）

DNS 泄露检测不是简单地调用 `1.1.1.1` 或 `8.8.8.8` 查询。真实探测需要由浏览器解析一次性随机域名，随后在测试域名的权威 DNS 侧观察哪个递归解析器向权威服务器发起了查询。本项目使用 Cloudflare DNS Analytics 的 `sourceIP` 字段读取解析器出口地址。

## 前置条件

- 一个已经托管在 Cloudflare 的域名，例如 `example.com`。
- 建议专门划分探测子域名：`probe.example.com`。
- Cloudflare 对该 Zone 开启 DNS Analytics（Free 计划也提供 DNS Analytics，但可见维度、数据延迟和历史窗口以 Cloudflare 当前规则为准）。
- Cloudflare API Token，只授予目标 Zone 的 **Zone → Analytics → Read** 权限。

## 步骤 1：添加通配符 DNS 记录

在 Cloudflare DNS 中添加一条专用探针记录：

| 字段 | 值 |
|---|---|
| Type | A |
| Name | `*`（位于 `probe` 子域名下，即 `*.probe.example.com`） |
| IPv4 address | `192.0.2.1`（文档示例地址，不是实际源站） |
| Proxy status | **Proxied（橙色云朵）** |

这条记录只用于让随机探测主机名经过 Cloudflare 边缘网络。不要把此记录用作网站真实源站记录。

## 步骤 2：给探针子域名增加 Worker Route

在 Cloudflare Worker 的 **Settings → Domains & Routes → Add route** 中添加：

```text
*.probe.example.com/*
```

Zone 选择 `example.com`，Worker 选择本项目部署的 IP Radar Worker。该路由使浏览器访问随机探针主机名时由 Worker 返回一个极小的无缓存响应，从而完成一次真实 DNS 解析。

如果你的探测域名不是 `probe.example.com`，请将上面的示例替换成自己的域名。

## 步骤 3：创建最小权限 API Token

1. Cloudflare Dashboard → My Profile → API Tokens → Create Token。
2. 选择自定义 Token。
3. 权限设置为 **Zone → Analytics → Read**。
4. Zone Resources 仅选择存放探针子域名的那个 Zone。
5. 不要授予 DNS Write、Zone Edit 或 Account Admin 等不必要权限。
6. 创建并复制 Token。Token 通常只在创建时展示一次。

Cloudflare GraphQL Analytics API 需要 Analytics Read 权限。若你的账户界面提供的是 Account-level Analytics Read / Zone Analytics Read，请按目标 DNS Zone 的数据范围选择最小必要权限；若接口返回权限不足，再检查该 Token 是否能读取该 Zone 的 DNS Analytics 数据。

## 步骤 4：在 Worker 中添加变量和 Secrets

打开 Worker → Settings → Variables and Secrets，新增：

**普通变量：**

```text
DNS_PROBE_DOMAIN = probe.example.com
CF_DNS_ZONE_ID   = 你的 example.com Zone ID
```

**Secret：**

```text
CF_DNS_API_TOKEN = 你的只读 Analytics API Token
```

Zone ID 可在 Cloudflare 对应域名的 Overview 页面右侧找到。注意这里填写父级 Zone `example.com` 的 Zone ID，而不是 `probe.example.com` 的文本名称。

## 步骤 5：验证

1. 保存变量和 Secret，并重新部署 Worker。
2. 确认 `*.probe.example.com/*` 的 Worker Route 指向本项目。
3. 打开网站 → DNS 泄露检测 → 点击开始检测。
4. 浏览器会请求 5 个每次随机生成的子域名；Worker 再通过 Cloudflare GraphQL DNS Analytics 搜索匹配查询记录。
5. 如果刚完成探测没有结果，等待一段时间后重新测试。DNS Analytics 统计数据可能不是即时入库。

### 常见问题

- **显示尚未配置：** 检查 `DNS_PROBE_DOMAIN`、`CF_DNS_ZONE_ID` 和 `CF_DNS_API_TOKEN` 三项 Worker 配置。
- **跨域或 522 / 525：** 检查探针 DNS 记录是否橙云代理、Wildcard Worker Route 是否添加正确、Route 是否指向当前 Worker。
- **Analytics 权限错误：** 检查 Token 的 Zone Analytics Read 权限与 Zone 资源范围。
- **没有观察到记录：** 确认浏览器请求成功，等待数据入库；检查 DNS Analytics 是否能看到对应的随机 `p...` 查询名。
- **结果数量偏少：** 部分浏览器、系统或网络会合并 DNS 请求、使用缓存或 DoH；本检测会如实展示观察到的记录数，不会用未观测地址补齐。

---

# 本地开发（Windows 11）

你需要安装 Node.js LTS（建议 Node.js 22 或更高版本）和 Git。

1. 解压项目并进入 `ip-radar-cf` 文件夹。
2. 在该文件夹地址栏输入 `cmd` 并回车，打开终端。
3. 安装依赖：

   ```bash
   npm install
   ```

4. 启动前端开发环境：

   ```bash
   npm run dev
   ```

5. 浏览器访问终端显示的本地地址，默认 `http://localhost:5173`。

注意：本地 Vite 开发服务器只用于前端预览，没有 Cloudflare Worker 运行环境，所以 `/api/*` 接口不能完整工作；本地 IP 也不会显示为 Cloudflare 识别的访客 IP。要测试完整 Worker，请先完成 Cloudflare 配置，再使用 `npm run cf:dev` 或部署后的地址测试。

### 本地 Worker 变量

复制 `.dev.vars.example` 为 `.dev.vars`，填入测试用变量。`.dev.vars` 已被 `.gitignore` 忽略，不能上传到 GitHub。

---

# 命令速查

```bash
npm install       # 安装依赖
npm run dev       # 前端开发预览
npm run typecheck # TypeScript 类型检查
npm run build     # 构建前端与类型检查
npm run cf:dev    # 构建后启动 Wrangler Worker 本地预览
npm run deploy    # 构建并部署到 Cloudflare Workers
```

使用 Wrangler 命令部署前，需要先登录：

```bash
npx wrangler login
npm run deploy
```

---

# 隐私、安全和数据源说明

1. **不存储浏览历史：** 当前版本没有用户账户、Cookie 跟踪、D1 或 KV 写入逻辑。检测结果只保存在当前浏览器页面状态中。
2. **访客 IP：** 首页通过 Cloudflare Worker 接收到的连接元数据识别访客 IP。网站运营者本身可能通过 Cloudflare Dashboard 的日志/分析查看请求信息，需结合自身隐私政策和 Cloudflare 条款处理。
3. **第三方 IP 情报：** IP 查询会将查询 IP 发送给 ipapi.is。配置 API Key 后 Key 只在 Worker 端使用。
4. **DNS 探针：** 真实 DNS 泄露测试会生成随机子域名，并在 Cloudflare 权威 DNS Analytics 查询源 IP。解析器出口 IP 是敏感网络信息，建议只保留测试所需数据，不要建立不必要的长期日志。
5. **WebRTC：** 检测在用户浏览器内进行，只创建临时 PeerConnection，不申请摄像头或麦克风权限。
6. **IPv6 / DoH / 测速：** 相关页面会请求 ipify、Cloudflare Public DNS 或 Cloudflare speed.cloudflare.com。使用者需要接受这些服务对请求元数据的处理。
7. **风险评分：** 不提供绝对“纯净 IP”结论。数据源可能漏报或误报，特别是住宅代理、移动代理、未知 VPN 和动态 IP。
8. **开放部署：** 上线前应在网站添加隐私政策、数据源说明、滥用联系方法，并根据访问地区的法律法规检查个人信息处理要求。

## 后续扩展建议

- 增加多数据源交叉验证和可替换 IP 情报 Provider。
- 增加 BGP / ASN 历史、DNSSEC、DNSBL、反向 DNS、邮件域名记录检查。
- 为公共 API 增加限流、配额、访问密钥和缓存。
- 将检测记录保存到 D1 前，先明确保存目的、留存期限和用户告知。
- 若增加全球测速节点，应部署多个独立 Worker / Probe，并明确每个节点测量的是哪一段网络路径。

## 参考文档

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare React + Vite on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Cloudflare Request Metadata](https://developers.cloudflare.com/workers/runtime-apis/request/)
- [Cloudflare DNS Analytics](https://developers.cloudflare.com/dns/additional-options/analytics/)
- [Cloudflare GraphQL Analytics API](https://developers.cloudflare.com/analytics/graphql-api/getting-started/querying-basics/)
- [ipapi.is API Documentation](https://ipapi.is/developers.html)
