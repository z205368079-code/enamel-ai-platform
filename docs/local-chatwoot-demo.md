# Local Chatwoot Demo

The local Chatwoot runtime is isolated from the Gateway database and is pinned to `chatwoot/chatwoot:v4.17.1`, `pgvector/pgvector:0.8.6-pg15`, and `redis:7-alpine`.

Run it from the repository root:

```powershell
docker compose -f infra/chatwoot-compose.yml up -d
docker compose -f infra/chatwoot-compose.yml run --rm web bundle exec rails db:chatwoot_prepare
```

Open `http://localhost:3002` to create the first local administrator account. Do not reuse a production password. After creating an account, create a website inbox and an API token, then configure the Gateway's ignored `.env` with the corresponding `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, and `CHATWOOT_API_TOKEN` values.

For a local Docker setup, configure the Chatwoot webhook target as `http://host.docker.internal:3000/webhooks/chatwoot` so the Chatwoot container can reach the Gateway on the host.

`SAFE_FETCH_ALLOW_PRIVATE_NETWORK=true` is enabled only in the local Chatwoot Compose runtime because Chatwoot otherwise blocks callbacks to private Docker/host addresses. Do not carry that setting into a production deployment; production webhook endpoints should use a controlled HTTPS address with normal network access controls.
