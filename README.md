# Enamel AI Platform

用于珐琅锅企业 AI 应用与客服知识库技术面试展示的集成型 PoC（概念验证）。项目重点是清晰展示开源选型、系统集成、API 边界、Docker 部署和后续 AI/人工协作设计，而不是开发完整商业 SaaS。

## Phase 0 当前能力

- Node.js + TypeScript AI Gateway
- `GET /health` 存活检查
- PostgreSQL 15 基础服务
- Docker Compose 本地编排
- ESLint、Prettier、TypeScript strict、Vitest

以下能力尚未实现：Chatwoot Webhook、MaxKB API、Human Handoff、业务数据库表和统计接口。

## 架构边界

- **本仓库自行维护**：AI Gateway、集成层、配置、Docker 编排、测试和项目文档。
- **第三方开源组件**：Chatwoot（客服系统）与 MaxKB（知识库/RAG）。本仓库不复制或魔改它们的核心源码。
- **Phase 0**：仅运行 Gateway 与 PostgreSQL。Chatwoot、MaxKB 只作为后续阶段的架构规划存在。

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

- `postgres`：业务数据持久化基础设施（Phase 0 尚未创建业务表）。
- `gateway`：等待 PostgreSQL 健康后启动，并暴露端口 `3000`。

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
