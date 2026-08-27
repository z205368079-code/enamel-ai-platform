# Interview Demo

## One sentence

Enamel AI Platform is an enterprise AI customer-service and knowledge-base PoC built with Chatwoot, MaxKB, Node.js and PostgreSQL.

## Architecture and ownership

Customer → Chatwoot → Gateway → MaxKB/RAG → Chatwoot; Gateway → PostgreSQL. `NO_ANSWER` or high risk → HUMAN. Chatwoot owns conversations/agents; MaxKB owns knowledge retrieval/RAG; this project owns the Gateway, webhook/client adapters, state, idempotency, retry, migration, handoff, internal auth, analytics and knowledge gaps.

## 3–5 minute demo

1. Ask a normal size question: show RAG response and `ai_runs`.
2. Send a three-turn E22/E24 conversation: show saved MaxKB chat id.
3. Send an injury/compensation question: show HUMAN state and Chatwoot label.
4. Ask an unknown company question: show gap, handoff and internal stats.

## Talking points

- Chatwoot and MaxKB avoid rebuilding mature customer-service and RAG capabilities; the Gateway is necessary for enterprise policy, persistence, integration and safe handoff.
- A webhook is an event HTTP callback. Incoming-only filtering prevents reply loops; unique `message_id` makes redelivery idempotent.
- PostgreSQL advisory locks serialize MaxKB session initialization. Retry is limited to one transient retry to avoid duplicate side effects.
- `NO_ANSWER` is a knowledge gap; a human handoff can also be user-requested or high-risk and is not always a gap.
- RAG happens in MaxKB; this PoC intentionally does not build a vector database.

## Limits and production next steps

This is a PoC: no RBAC/SSO, PII masking system, queue, HA, Kubernetes, formal monitoring or SLA. Production next steps: SSO/RBAC, private-network controls, tracing/metrics, assignment rules, retention/masking, knowledge review workflow, CRM/ERP integration and multitenancy.

## Possible Interview Questions

1. Why Chatwoot? Mature open-source customer conversations and agents.
2. Why MaxKB? Existing knowledge-base/RAG application capability.
3. Why Gateway? It owns business rules and integration boundaries.
4. Why not direct integration? Policy, idempotency and persistence need an owned layer.
5. What if MaxKB fails? Controlled fallback, small retry, then handoff threshold.
6. What if DB fails? Webhook processing fails safely; production needs HA.
7. What did AI coding tools do? Assisted scaffolding, tests and documentation; design boundaries and verification remain explicit.
