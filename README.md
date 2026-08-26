# Enamel AI Platform

用于珐琅锅企业 AI 应用与客服知识库技术面试展示的集成型 PoC（概念验证）。项目重点是清晰展示开源选型、系统集成、API 边界、Docker 部署和后续 AI/人工协作设计，而不是开发完整商业 SaaS。

## Phase 2 当前能力

- Node.js + TypeScript AI Gateway
- `GET /health` 存活检查
- `POST /webhooks/chatwoot` Webhook 接收入口
- Chatwoot 客户文本消息筛选、Conversation 持久化与 MaxKB 知识库回复
- 独立 Chatwoot API Client（timeout、错误分类与延迟记录）
- 独立 MaxKB Application API Client（timeout、有限重试、错误分类与延迟记录）
- PostgreSQL 15 基础服务与 `conversations`、`ai_runs` 表初始化
- Docker Compose 本地编排
- ESLint、Prettier、TypeScript strict、Vitest

以下能力尚未实现：Human Handoff、统计接口和 Dashboard。Gateway 不直接调用 LLM；知识库回答只来自 MaxKB。

## 架构边界

- **本仓库自行维护**：AI Gateway、集成层、配置、Docker 编排、测试和项目文档。
- **第三方开源组件**：Chatwoot（客服系统）与 MaxKB（知识库/RAG）。本仓库不复制或魔改它们的核心源码。
- **Phase 2**：Gateway 已能处理 Chatwoot Webhook，通过 MaxKB 应用 API 获取知识库答案，再用 Chatwoot API 回帖。

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

- `postgres`：业务数据持久化基础设施。
- `migrate`：在 PostgreSQL 健康后执行版本化 SQL migration；已执行版本不会重复执行。
- `gateway`：只在 migration 成功后启动，并暴露端口 `3000`。

### 数据库升级

不再依赖 PostgreSQL `initdb.d` 作为增量升级机制。版本化 SQL 位于 `infra/postgres/migrations/`，执行记录写入 `schema_migrations`；因此已有 Phase 1 数据卷会保留原数据，并依次补上 `002`、`003` 所需结构。

本地手动执行：

```bash
npm run migrate
```

部署流程先执行 migration，确认成功后再启动 Gateway；Compose 已按这个顺序编排。

### Chatwoot 与 MaxKB 配置及数据流

在本地 `.env` 或部署环境中配置：

```text
CHATWOOT_BASE_URL=https://your-chatwoot.example
CHATWOOT_ACCOUNT_ID=your-account-id
CHATWOOT_API_TOKEN=your-token
CHATWOOT_REQUEST_TIMEOUT_MS=5000
MAXKB_BASE_URL=https://your-maxkb.example
MAXKB_APP_ID=your-application-id
MAXKB_API_KEY=application-your-key
MAXKB_TIMEOUT_MS=10000
```

默认 MaxKB v2 路径为 `POST /chat/api/{MAXKB_APP_ID}/chat/completions`。如部署改过 MaxKB `CHAT_PATH`，可提供完整的 `MAXKB_CHAT_COMPLETIONS_URL` 覆盖默认路径。真实 Key 只放在 `.env` 或部署密钥管理中。

收到 `message_created` 后，Gateway 只处理客户发送的 `incoming` 文本消息：

```text
Chatwoot customer message
→ POST /webhooks/chatwoot
→ conversations upsert (mode=AI)
→ MaxKB Application API (stream=false)
→ ai_runs audit record
→ Chatwoot API outgoing message
```

MaxKB 成功返回的 `choices[0].chat_id` 才会写入本地 `conversations.maxkb_chat_id`，并只在下一条同会话消息中传回；Gateway 不生成或猜测 MaxKB 会话 ID。`outgoing`、bot、system、非文本与非目标事件都会安全返回 2xx 而不调用下游服务，因此 Gateway 自己发出的回复不会形成 webhook 循环。

同一 `message_id` 由数据库唯一键认领：重复或并发重复 webhook 返回安全 2xx，不会再次调用 MaxKB 或回帖。针对同一 Chatwoot conversation，Gateway 使用 PostgreSQL 事务级 advisory lock 串行化 MaxKB session 初始化，避免竞争创建多个会话。

MaxKB 无可用答案或上游异常时，Gateway 不调用 LLM 兜底，而是回帖受控文案：`暂时无法从知识库中找到可靠答案，请稍后重试或联系人工客服。`

日志只保留事件类型、会话/消息标识、处理状态与延迟；不记录完整 payload、问题、回答、Authorization、API Key 或数据库密码。数据库中保留 question/answer 仅用于 PoC 面试审计。生产环境还应增加数据保留期限、访问控制、脱敏与删除策略。

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
- [MaxKB](https://github.com/1Panel-dev/MaxKB)：企业知识库/RAG，作为独立第三方 API 服务集成。
- Node.js、TypeScript、Express、PostgreSQL 与 Docker Compose。

许可证和归属说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。第三方作者不会被标记为本仓库提交的共同作者。
