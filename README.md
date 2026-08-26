# Enamel AI Platform

用于珐琅锅企业 AI 应用与客服知识库技术面试展示的集成型 PoC（概念验证）。项目重点是清晰展示开源选型、系统集成、API 边界、Docker 部署和后续 AI/人工协作设计，而不是开发完整商业 SaaS。

## Phase 1 当前能力

- Node.js + TypeScript AI Gateway
- `GET /health` 存活检查
- `POST /webhooks/chatwoot` Webhook 接收入口
- Chatwoot 客户文本消息筛选、Conversation 持久化与 Mock AI 回复
- 独立 Chatwoot API Client（timeout、错误分类与延迟记录）
- PostgreSQL 15 基础服务与 `conversations` 表初始化
- Docker Compose 本地编排
- ESLint、Prettier、TypeScript strict、Vitest

以下能力尚未实现：MaxKB API、真实 LLM 调用、Human Handoff、统计接口和 Dashboard。

## 架构边界

- **本仓库自行维护**：AI Gateway、集成层、配置、Docker 编排、测试和项目文档。
- **第三方开源组件**：Chatwoot（客服系统）与 MaxKB（知识库/RAG）。本仓库不复制或魔改它们的核心源码。
- **Phase 1**：Gateway 已能处理 Chatwoot Webhook，并使用 Chatwoot API 发送 Mock 回复。MaxKB 仍只作为后续阶段规划。

详细说明见 [`docs/architecture.md`](docs/architecture.md)。

## 本地运行

要求：Node.js 22+、npm 10+。推荐使用 Node.js 22 LTS；当前工程也允许 Node.js 26 用于本地检查。

```bash
npm install
npm run dev
```

访问 `http://localhost:3000/health`，预期返回：

```json
{
  "status": "ok",
  "service": "enamel-ai-gateway",
  "timestamp": "2026-08-26T00:00:00.000Z"
}
```

## Docker Compose

先复制 `.env.example` 为 `.env`，并将本地数据库密码替换为自己的值，然后执行：

```bash
docker compose -f infra/docker-compose.yml up --build
```

Compose 会启动：

- `postgres`：业务数据持久化基础设施，并在新数据卷首次启动时创建 `conversations` 表。
- `gateway`：等待 PostgreSQL 健康后启动，并暴露端口 `3000`。

### Chatwoot 配置与数据流

Phase 1 需要在本地 `.env` 或部署环境中提供以下变量后，才会实际向 Chatwoot 回帖：

```text
CHATWOOT_BASE_URL=https://your-chatwoot.example
CHATWOOT_ACCOUNT_ID=your-account-id
CHATWOOT_API_TOKEN=your-token
CHATWOOT_REQUEST_TIMEOUT_MS=5000
```

收到 `message_created` 后，Gateway 只处理客户发送的 `incoming` 文本消息：

```text
Chatwoot customer message
→ POST /webhooks/chatwoot
→ conversations upsert (mode=AI)
→ Chatwoot API outgoing message
→ "[Demo AI] 已收到您的问题：..."
```

`outgoing`、bot、system、非文本与非目标事件都会安全返回 2xx 而不调用下游服务，因此 Gateway 自己发出的回复不会形成 webhook 循环。

## 质量检查

```bash
npm run verify
docker compose -f infra/docker-compose.yml config
```

`verify` 依次执行格式检查、lint、类型检查、单元测试和构建。

## Git 工作流

建议使用 `main` / `dev` / `feature/*`：功能开发在 `feature/*`，验证后合并到 `dev`，演示稳定版本再合并到 `main`。禁止提交 `.env`、真实 API Key、Token 或密码，也不要自动修改远程仓库可见性。

## Built With / Acknowledgements

- [Chatwoot](https://github.com/chatwoot/chatwoot)：计划用于客服会话和人工坐席，第三方项目。
- [MaxKB](https://github.com/1Panel-dev/MaxKB)：计划用于企业知识库和 RAG，第三方项目。
- Node.js、TypeScript、Express、PostgreSQL 与 Docker Compose。

许可证和归属说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。第三方作者不会被标记为本仓库提交的共同作者。
