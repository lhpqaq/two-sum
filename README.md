# LeetCode Two-Sum 在线人数监控

实时监控 LeetCode 平台上 Two-Sum 题目的在线刷题人数，支持国际区（US）和中国区（CN）数据对比。

## 📋 项目特性

- ⏱️ **实时采集**：每分钟自动采集一次数据
- 📊 **双 Y 轴图表**：完美展示不同数量级的数据对比
- 🔍 **多时间范围**：支持 1 小时到 7 天的历史数据查询
- 🎨 **精美可视化**：基于 ECharts 的交互式图表
- 💰 **零成本部署**：完全基于 Cloudflare 免费套餐
- ⚡ **高性能**：全球 CDN 加速，毫秒级响应

## 🏗️ 技术架构

- **后端**：Cloudflare Workers（定时任务 + REST API）
- **数据库**：Cloudflare D1（SQLite）
- **前端**：纯静态页面（ECharts）
- **部署**：Cloudflare Pages

## 📦 项目结构

```
two-sum/
├── src/
│   └── index.js           # Worker 主逻辑（Cron + API）
├── public/
│   └── index.html         # 前端页面
├── schema.sql             # 数据库表结构
├── wrangler.toml          # Cloudflare 配置
├── package.json           # 项目依赖
└── README.md              # 本文件
```

## 🚀 快速开始

### 前置要求

- Node.js 16+
- npm 或 yarn
- Cloudflare 账号（免费）

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
npm run db:create
```

复制输出的 `database_id`，并更新 `wrangler.toml` 中的配置：

```toml
[[d1_databases]]
binding = "DB"
database_name = "two-sum-db"
database_id = "粘贴你的_database_id"  # 替换这里
```

### 3. 初始化数据库表

**本地环境：**
```bash
npm run db:init
```

**生产环境（稍后部署时运行）：**
```bash
npm run db:init:remote
```

### 4. 本地开发调试

启动 Worker 开发服务器：

```bash
npm run dev
```

访问 `http://localhost:8787` 查看 API 端点：

- `http://localhost:8787/api/data?hours=24` - 获取历史数据
- `http://localhost:8787/api/latest` - 获取最新数据
- `http://localhost:8787/api/stats` - 获取统计信息
- `http://localhost:8787/api/collect` - 手动触发采集

### 5. 测试前端页面

在另一个终端启动前端服务器：

```bash
npm run pages:dev
```

访问 `http://localhost:3000` 查看可视化页面。

⚠️ **注意**：需要先修改 `public/index.html` 中的 API_URL 配置：

```javascript
const API_URL = 'http://localhost:8787';  // 本地开发时使用
```

### 6. 手动测试数据采集

在浏览器访问：
```
http://localhost:8787/api/collect
```

然后查询数据库验证：

```bash
npx wrangler d1 execute two-sum-db --local --command "SELECT * FROM records ORDER BY timestamp DESC LIMIT 10"
```

## 🌐 线上部署

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

### 2. 部署 Worker（后端 + 定时任务）

```bash
npm run deploy
```

部署成功后会输出 Worker URL，例如：
```
https://two-sum.your-subdomain.workers.dev
```

### 3. 初始化生产数据库

```bash
npm run db:init:remote
```

### 4. 测试定时任务

由于 Cron 是每分钟执行，等待 1-2 分钟后查询数据库：

```bash
npx wrangler d1 execute two-sum-db --remote --command "SELECT COUNT(*) as count FROM records"
```

或者手动触发采集：
```bash
curl https://two-sum.your-subdomain.workers.dev/api/collect
```

### 5. 部署前端页面

**方式一：通过 CLI 部署**

修改 `public/index.html` 中的 API_URL：
```javascript
const API_URL = 'https://two-sum.your-subdomain.workers.dev';
```

然后部署：
```bash
npm run pages:deploy
```

**方式二：通过 GitHub 自动部署（推荐）**

1. 将代码推送到 GitHub
2. 登录 Cloudflare Dashboard → Pages
3. 点击 "Create a project" → "Connect to Git"
4. 选择你的仓库
5. 配置构建设置：
   - **Build command**: (留空)
   - **Build output directory**: `public`
6. 点击 "Save and Deploy"

部署完成后，你会得到一个 `.pages.dev` 域名。

### 6. 绑定自定义域名（可选）

在 Cloudflare Dashboard 中：

1. **Worker 绑定自定义域名**：
   - Workers & Pages → two-sum → Settings → Triggers
   - 添加自定义域名（需要域名托管在 Cloudflare）

2. **Pages 绑定自定义域名**：
   - Pages → two-sum-web → Custom domains
   - 添加你的域名

## 🔧 运维管理

### 查询数据库

**本地环境：**
```bash
npx wrangler d1 execute two-sum-db --local --command "SELECT * FROM records LIMIT 10"
```

**生产环境：**
```bash
npx wrangler d1 execute two-sum-db --remote --command "SELECT * FROM records LIMIT 10"
```

### 查看统计信息

```bash
npx wrangler d1 execute two-sum-db --remote --command "
SELECT
  region,
  COUNT(*) as total,
  MIN(count) as min,
  MAX(count) as max,
  AVG(count) as avg
FROM records
GROUP BY region
"
```

### 清理历史数据

保留最近 7 天的数据：
```bash
npx wrangler d1 execute two-sum-db --remote --command "
DELETE FROM records
WHERE timestamp < strftime('%s', 'now', '-7 days') * 1000
"
```

### 查看 Worker 日志

```bash
npx wrangler tail
```

实时查看定时任务和 API 请求的日志输出。

### 暂停/恢复定时任务

修改 `wrangler.toml`：

```toml
# 暂停：注释掉 crons 配置
# [triggers]
# crons = ["* * * * *"]

# 恢复：取消注释
[triggers]
crons = ["* * * * *"]
```

然后重新部署：
```bash
npm run deploy
```

## 🐛 常见问题

### 1. WebSocket 连接失败？

LeetCode 的 WebSocket 协议可能需要调整。建议：

1. 在浏览器开发者工具中观察真实的 WebSocket 消息格式
2. 修改 `src/index.js` 中的 `getOnlineCount()` 函数
3. 调整消息解析逻辑

### 2. 数据库写入失败？

检查 `wrangler.toml` 中的 `database_id` 是否正确：

```bash
npx wrangler d1 list
```

### 3. 前端无法获取数据？

检查 CORS 配置和 API URL：

1. 确保 `public/index.html` 中的 `API_URL` 指向正确的 Worker 地址
2. 在浏览器控制台查看网络请求错误

### 4. 定时任务没有执行？

```bash
# 查看实时日志
npx wrangler tail

# 手动触发测试
curl https://your-worker.workers.dev/api/collect
```

## 📊 API 文档

### GET /api/data

获取历史数据。

**查询参数：**
- `hours` (可选)：返回最近 N 小时的数据，默认 24

**响应示例：**
```json
[
  {
    "region": "US",
    "count": 1234,
    "timestamp": 1707580800000
  },
  {
    "region": "CN",
    "count": 567,
    "timestamp": 1707580800000
  }
]
```

### GET /api/latest

获取最新数据。

**响应示例：**
```json
{
  "US": {
    "region": "US",
    "count": 1234,
    "timestamp": 1707580800000
  },
  "CN": {
    "region": "CN",
    "count": 567,
    "timestamp": 1707580860000
  },
  "updated_at": "2024-02-10T12:34:56.789Z"
}
```

### GET /api/stats

获取统计信息。

**响应示例：**
```json
{
  "total_records": 2880,
  "by_region": [
    {
      "region": "US",
      "count": 1440,
      "min": 800,
      "max": 2000,
      "avg": 1234.5
    },
    {
      "region": "CN",
      "count": 1440,
      "min": 300,
      "max": 800,
      "avg": 567.8
    }
  ]
}
```

## 💡 优化建议

1. **数据聚合**：对于长时间范围（7天+），可以在 API 中按小时聚合数据
2. **缓存策略**：添加 Cloudflare Cache API 缓存历史数据
3. **告警通知**：当人数异常时发送通知（Telegram/Email）
4. **多题目支持**：扩展到监控更多热门题目

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**Made with ❤️ using Cloudflare Workers**
