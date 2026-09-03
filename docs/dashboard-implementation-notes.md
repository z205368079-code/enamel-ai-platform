# Dashboard 实现与架构说明笔记 (Implementation Notes)

本文档面向技术面试与架构复盘，用于阐明 **Enamel AI Platform** 运营控制台（Operations Dashboard）的设计初衷、安全边界、数据流、遇到问题的根因分析与解决方案。

---

## 1. 目标与架构边界

### 目标

为珐琅锅（Enamel Cookware）AI 客服网关提供一个**轻量、专注、只读**的运营审计与指标监控界面，供面试展示及运营人员实时掌握系统健康度与知识盲区。

### 架构边界（明确非目标）

- **只读操作**：仅提供监控指标聚合与知识盲区列表，**不提供**写操作（如恢复 AI 状态、修改知识库文档、更改用户会话）。
- **非侵入集成**：不修改或 fork 第三方开源系统（Chatwoot 客服系统、MaxKB 知识库）的任何源码。
- **业务解耦**：Dashboard 作为独立子应用运行在 `apps/dashboard`，通过服务端 BFF 转发，不侵入修改 Gateway 核心消息路由与业务逻辑。
- **无自建用户系统**：当前处于 PoC 演示阶段，不引入冗余的本地用户表、JWT 登录或 RBAC 权限系统。

---

## 2. 端到端数据流

系统采用“浏览器前端 → Dashboard 服务端 BFF → AI Gateway → PostgreSQL 持久层”的分层流转拓扑：

```text
[浏览器 Client]
    │  1. 无鉴权只读请求 (GET /api/health, /api/stats, /api/knowledge-gaps)
    ▼
[Dashboard BFF 服务端 (Node.js/Express, 默认仅监听 127.0.0.1:3001)]
    │  2. 读取服务端环境变量 INTERNAL_API_TOKEN
    │  3. 注入 Header: Authorization: Bearer <INTERNAL_API_TOKEN>
    ▼
[AI Gateway (Node.js/Express, 监听 3000 端口)]
    │  4. 验证 Bearer Token 并在路由层解耦
    │  5. 聚合数据库视图 / 过滤敏感数据
    ▼
[PostgreSQL 持久层 (conversations, ai_runs, knowledge_gaps, handoff_events)]
```

---

## 3. 为什么浏览器不能直接携带 `INTERNAL_API_TOKEN`？

在项目安全设计中，Gateway 的 `/internal/*` 接口由静态凭据 `INTERNAL_API_TOKEN` 保护：

1. **客户端不可控性**：所有发送到浏览器的代码、静态资源、环境变量（如前端注入）都可以通过 DevTools Network 面板、断点或源码检索被无门槛提取。
2. **凭据权限过大**：`INTERNAL_API_TOKEN` 具有网关内部敏感接口的读取和管理权限。一旦泄露到公网或局域网，攻击者可直接越权探测全量运营数据甚至触发管理端点。
3. **安全隔离原则 (Least Privilege & Defense in Depth)**：
   - 浏览器仅与 BFF 交互，BFF 仅暴露受限、只读且脱敏的 `/api/*`。
   - 内部 API Key/Token 严格作为**服务器端 Secret**，生命周期受限在容器内或服务主机进程内，杜绝客户端泄露风险。

---

## 4. 关键问题、根因与解决方案

| 问题                             | 风险 / 现象                                                                                       | 根因                                                                                                                                               | 解决方式                                                                                                                | 验证结果                                                                 |
| :------------------------------- | :------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| **BFF 监听范围**                 | Dashboard 启动后可能直接暴露给局域网其他主机访问，造成未授权数据读取                              | `app.listen(port)` 未指定 host，Node.js 默认绑定在 `0.0.0.0` 上                                                                                    | 显式将启动监听地址绑定为 `127.0.0.1`（Loopback 本机接口）                                                               | 代码审查与启动输出验证（绑定 `127.0.0.1`）                               |
| **异常数据显示为 0**             | 当 Gateway 返回数据损坏、字段缺失或类型异常时，界面仍显示为 `0`，易被误解为“无会话”等真实业务状态 | 采用了宽容的兜底转换逻辑（如 `Number(v) \|\| 0`），掩盖了上游异常                                                                                  | BFF 增加严格校验：字段缺失、非有限正整数时抛出受控错误，返回 `503 GATEWAY_INVALID_RESPONSE`；前端提示“暂时无法获取数据” | 自动化测试用例覆盖（`bff-stats.test.ts`）                                |
| **Knowledge Gap 状态不一致**     | UI 界面与测试使用 `UNRESOLVED`，与数据库真实枚举约束冲突                                          | 原设计未核对 DB Migration 定义，数据库真实约束为 `CHECK (status IN ('OPEN', 'RESOLVED'))`                                                          | 统一后端 BFF、测试与 API 合同为 `OPEN` 与 `RESOLVED`；UI 中文对应显示“待处理”与“已解决”，遇未知状态明确显示原始状态     | 自动化测试用例覆盖（`bff-knowledge-gaps.test.ts`）                       |
| **Compose 未加载根目录环境文件** | Dashboard 可打开且 Gateway `/health` 正常，但 `/api/stats` 与 `/api/knowledge-gaps` 返回 `503`    | 使用 `-f infra/docker-compose.yml` 时，Compose 默认从 `infra/` 查找环境文件；项目真实 `.env` 位于仓库根目录，导致容器收到空的 `INTERNAL_API_TOKEN` | 使用 `docker compose --env-file .env -f infra/docker-compose.yml up -d` 显式加载根目录配置；不记录或打印 Token 值       | 实机验证 Gateway、Dashboard health、stats 与 knowledge gaps 均返回 `200` |

---

## 5. 已验证与尚未验证内容

### 已验证内容

- **代码规范与类型安全**：全量执行并通过 `prettier --check .`、`eslint .`、`tsc --noEmit`。
- **BFF 核心单元与集成测试**：
  - 健康检查探测与延迟统计；
  - 统计指标代理、Token 零泄露断言、上游异常格式校验返回 503；
  - 知识盲区分页截断、字段脱敏及 `OPEN`/`RESOLVED` 状态校验。
- **构建产物验证**：执行 `tsc -p tsconfig.build.json`，构建产出可独立运行的 `dist/` 文件。
- **容器编排语法验证**：执行 `docker compose --env-file .env -f infra/docker-compose.yml config` 校验通过。
- **本机真实联调**：Gateway、Dashboard BFF、`/api/stats` 与 `/api/knowledge-gaps` 均已在本机返回 `200`；演示数据来自本地 PostgreSQL，未连接生产环境。

### 尚未验证内容（生产差距）

- **真实高并发压力**：未进行千级 QPS 下的并发压测；当前主要适用于低频面试演示与内部看板。
- **真实浏览器 E2E 自动化测试**：目前依赖 Supertest + Vitest 模拟 HTTP 断言，未配置 Playwright/Cypress 运行端到端跨浏览器自动化回归。
- **分布式追踪与 APM**：未集成 OpenTelemetry 或 Prometheus exporter。

---

## 6. 生产环境后续建议

若该 PoC 未来向生产环境演进，建议按以下顺序补齐生产级防护：

1. **网络边界与反向代理**：
   - Dashboard BFF 前置反向代理（如 Nginx 或 Envoy），负责 TLS 卸载与外部流量接入。
   - 内部服务间通过私有虚拟网络（VPC）互联，禁止 Gateway 和数据库直接暴露公网。
2. **身份认证与访问控制 (SSO / IAM / RBAC)**：
   - 接入企业身份认证体系（OAuth2 / OIDC / SAML，如 Okta、Google Workspace 等）。
   - 引入细粒度 RBAC 权限模型，区分运营人员（只读指标）、知识库编辑人员（维护知识盲区）与超级管理员。
3. **数据隐私、脱敏与保留策略**：
   - 对知识盲区涉及的用户原始消息实行 PII（个人身份信息）自动掩码与脱敏过滤。
   - 建立数据库保留周期策略（Data Retention Policy），对过期的审计日志与运行记录执行定期归档或安全清理。
