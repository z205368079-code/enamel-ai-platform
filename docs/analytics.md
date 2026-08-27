# Analytics and Knowledge Gaps

`knowledge_gaps` 只记录知识库能力问题：当前由 MaxKB `NO_ANSWER` 触发；用户主动要求人工不视为知识缺口。`message_id` 唯一，重复 webhook 不会重复记录。

内部只读接口：`GET /internal/stats` 与 `GET /internal/knowledge-gaps?limit=20&offset=0`，复用内部 Bearer Token。统计定义直接对应数据库：会话总数、当前 AI/HUMAN 数、AI runs 成功/失败、handoff events、knowledge gaps，平均延迟只计算非空 latency。

闭环：客户问题 → MaxKB NO_ANSWER → Human Handoff → knowledge gap → 人工分析 → 后续补充知识库。Phase 4 不自动修改 MaxKB。记录不保存完整 payload 或问题文本；生产环境应增加脱敏、保留期限与访问控制。
