# Enamel AI Platform — Future Agent Guide

This file is the handoff guide for future work, including a frontend built with Google Antigravity. It describes the verified current PoC and intentionally separates it from planned production work.

## Product boundary

This is an interview PoC for an enamel-cookware AI customer-service knowledge base. The demo data is synthetic. It must not claim to represent a real company, product specification, warranty, refund, compensation, or legal policy.

| Owner                              | Responsibility                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| This repository                    | Node.js/TypeScript AI Gateway, integration policy, PostgreSQL persistence, Docker Compose, tests, documentation |
| Chatwoot                           | Third-party customer conversation and human-agent system                                                        |
| MaxKB                              | Third-party knowledge-base/RAG system                                                                           |
| Future Google Antigravity frontend | Read-only operations UI; it must not modify Chatwoot or MaxKB core source                                       |

## Current message flow

```text
Customer → Chatwoot Widget → Chatwoot webhook → Gateway
         → risk / human-request check → HUMAN when needed
         → MaxKB answer → Chatwoot reply
         → exact NO_ANSWER → optional DeepSeek fallback → Chatwoot reply
         → unresolved failure → knowledge gap + HUMAN
```

Gateway persists conversations, AI runs, handoff events, knowledge gaps, and processed webhook message IDs in PostgreSQL. It ignores outgoing, bot, system, and unrelated Chatwoot events so its own reply does not loop back into another AI request.

## Frontend boundary — important

The existing `/internal/*` APIs are **not browser-safe public APIs**. They require `Authorization: Bearer <INTERNAL_API_TOKEN>` and a static token must never be embedded in a browser bundle, URL, client-side environment variable, screenshot, or source repository.

For a local interview demo, a trusted operator may use the internal API through a local tool. For a deployed dashboard, add a small server-side BFF/reverse-proxy layer first, then protect that layer with real access control (for example private network plus SSO/IAM/RBAC). Do not let Google Antigravity call `/internal/*` directly from a static frontend.

### Existing API contract

| Endpoint                                      | Use                                  | Authentication        | Frontend guidance                                                    |
| --------------------------------------------- | ------------------------------------ | --------------------- | -------------------------------------------------------------------- |
| `GET /health`                                 | Gateway liveness                     | None                  | Local status indicator only; it is not a dependency readiness check. |
| `GET /internal/stats`                         | Read-only aggregate metrics          | Internal Bearer token | Call only through a future server-side BFF.                          |
| `GET /internal/knowledge-gaps?limit=&offset=` | Read-only knowledge-gap list         | Internal Bearer token | Call only through a future server-side BFF.                          |
| `POST /internal/conversations/:id/resume-ai`  | Demo/admin recovery from HUMAN to AI | Internal Bearer token | Keep out of the first read-only dashboard.                           |

The dashboard should initially show only: aggregate stats, knowledge gaps, metric definitions, and a clear label that HUMAN conversations require a Chatwoot operator. It should not become a second customer-service system. For design decisions, defect root-cause analyses, and verification notes, see [`docs/dashboard-implementation-notes.md`](docs/dashboard-implementation-notes.md).

## Architecture backlog

Implement these in priority order only when the PoC becomes a deployed service. They are intentionally not bundled into the frontend work.

### P0 — before exposing a public webhook

1. **Verify webhook origin.** The webhook currently validates the payload shape but does not prove that the request came from Chatwoot. Add the supported Chatwoot signature/secret verification when available, or enforce a reverse-proxy secret and network allowlist.
2. **Make idempotency recoverable after a process crash.** The database unique `message_id` claim prevents normal duplicates, but a crash after claiming and before completion can suppress a later redelivery forever. Store a processing state and claim timestamp, then reclaim only expired in-progress work. Design this together with outbound reply idempotency so a retry cannot send two customer replies.
3. **Replace free-text `NO_ANSWER` coupling.** The current fallback relies on an exact MaxKB answer string. Use a structured, versioned response signal or a tightly tested prompt/output contract before relying on it in production.

### P1 — reliability and operations

1. Add a `/ready` endpoint that checks PostgreSQL and required configuration without calling external AI providers. Keep `/health` as liveness.
2. Move long external calls out of the database transaction/advisory-lock window. If throughput becomes relevant, use a durable outbox/queue and per-conversation serialization; do not add Redis merely for this PoC.
3. Reuse a shared PostgreSQL pool instead of constructing one pool per repository.
4. Clamp pagination `limit` to a positive range such as `1..100`.
5. Give every Chatwoot API call the same timeout/error-handling policy; the human-handoff label calls should match the message-send client behavior.

### P2 — security, privacy, and metrics

1. Static `INTERNAL_API_TOKEN` is acceptable only for the local demo. Production needs a private network boundary and authenticated server-side administration.
2. `ai_runs` may retain question/answer text for the interview audit, and DeepSeek fallback receives a question. Define consent, masking, retention, deletion, and access policies before handling real customers.
3. Current AI metrics count provider attempts. A MaxKB `NO_ANSWER` followed by a successful DeepSeek fallback produces two AI runs, so it is not an end-to-end per-message success rate. Label it accurately in any dashboard.

## Non-goals for the first frontend

- No API key or internal-token handling in the browser.
- No automatic knowledge-base editing or MaxKB database access.
- No Chatwoot/MaxKB source forks or core modifications.
- No replacement of Chatwoot's agent UI, handoff workflow, or email capture.
- No complex BI, user accounts, or role system until the BFF/auth boundary exists.

## Local interview launcher

`scripts/start-demo.ps1` is the Windows local-demo launcher. It starts Docker Desktop when necessary, starts the existing Gateway and Chatwoot Compose services, starts the pre-existing `enamel-maxkb` container when present, then starts the Dashboard and writes a clickable Desktop entry page. It must keep the Dashboard on `127.0.0.1`; the Chatwoot Widget remains the only LAN/customer-facing entry. The launcher reads local `.env` only and must never print, persist, or commit credential values.

## Safe verification after future changes

Run the repository checks before a demo:

```bash
npm run verify
docker compose --env-file .env -f infra/docker-compose.yml config
```

The Compose file lives in `infra/`, while local configuration lives in the repository-root `.env`. Always pass `--env-file .env`; otherwise `INTERNAL_API_TOKEN` is interpolated as empty and protected Gateway APIs correctly return `401`. This local setup issue and its verified resolution are recorded in [`docs/dashboard-implementation-notes.md`](docs/dashboard-implementation-notes.md).

Never commit `.env`, `infra/.env.chatwoot`, API keys, passwords, `Authorization` headers, or `INTERNAL_API_TOKEN` values. Keep only placeholder values in `.env.example`.
