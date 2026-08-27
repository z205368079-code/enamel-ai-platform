# Human Handoff（Phase 3）

状态机为 `AI → HUMAN → AI`。新会话默认为 AI；HUMAN 模式下 Gateway 安全确认 webhook，但不调用 MaxKB、不会自动回帖。

触发条件：客户明确要求人工、命中 Demo 高风险关键词、MaxKB 返回 `NO_ANSWER`、或连续 AI 失败达到阈值（默认 2）。高风险问题不让 AI 自动作赔偿、法律或人身伤害结论。

接管先在 PostgreSQL 原子写入 `HUMAN` 与唯一 `handoff_events`，再 best-effort 调用 Chatwoot 标签 API：先读取现有 labels，再追加 `human_handoff`，避免覆盖已有标签。标签 API 失败不会回滚本地状态。

`POST /internal/conversations/:id/resume-ai` 仅用于 Demo/internal use：恢复 AI、清零连续失败计数、不删除历史 handoff event。生产环境应加入认证、客服分配/队列、审计权限、数据保留与脱敏策略。
