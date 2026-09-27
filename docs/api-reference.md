# API reference

`noesis_api_catalog` and the [JSON parameter catalog](api-catalog.json) describe strict parameter schemas. `noesis_read` performs one GET operation. Supply a path placeholder `{id}` as parameters.id. Unknown fields are rejected.

| operation | HTTP path | scope |
|---|---|---|
| `macro_latest` | `/v1/agent-api/macro/latest` | macro:read |
| `macro_report` | `/v1/agent-api/macro/{id}` | macro:read |
| `signals` | `/v1/agent-api/signals` | signals:read |
| `theses` | `/v1/agent-api/theses` | theses:read |
| `catalog` | `/v1/agent-api/data/catalog` | market-data:read |
| `indicators` | `/v1/agent-api/data/indicators` | market-data:read |
| `latest` | `/v1/agent-api/data/latest` | market-data:read |
| `freshness` | `/v1/agent-api/data/freshness` | market-data:read |
| `ohlcv` | `/v1/agent-api/data/ohlcv` | market-data:read |
| `stock_context` | `/v1/agent-api/data/stock-context` | market-data:read |
| `instruments` | `/v1/agent-api/data/instruments` | market-data:read |
| `instrument` | `/v1/agent-api/data/instruments/{id}` | market-data:read |
| `taxonomies` | `/v1/agent-api/data/taxonomies` | market-data:read |
| `taxonomy_members` | `/v1/agent-api/data/taxonomies/{id}/instruments` | market-data:read |
| `subjects` | `/v1/agent-api/data/holdings/subjects` | market-data:read |
| `snapshots` | `/v1/agent-api/data/holdings/subjects/{id}/snapshots` | market-data:read |
| `positions` | `/v1/agent-api/data/holdings/subjects/{id}/positions` | market-data:read |
| `transactions` | `/v1/agent-api/data/holdings/subjects/{id}/transactions` | market-data:read |
| `document` | `/v1/agent-api/data/holdings/documents/{id}` | market-data:read |
| `series` | `/v1/agent-api/data/series` | market-data:read |
| `advisors` | `/v1/identity/public/advisors` | public |
| `advisor` | `/v1/identity/public/advisors/{id}` | public |
| `identity_summary` | `/v1/identity/public/summary` | public |
| `public_theses` | `/v1/theses/public` | public |
| `thesis_receipt` | `/v1/theses/public/{id}` | public |


## Authentication and signing operations

| MCP tool | HTTP operation |
|---|---|
| noesis_capabilities | GET /v1/agent-api/protocol, /v1/identity/protocol, /v1/theses/protocol |
| noesis_auth_prepare / complete | POST /v1/agent-api/auth/challenge, /v1/agent-api/auth/session |
| noesis_logout | DELETE /v1/agent-api/auth/session |
| noesis_identity_prepare / complete | POST /v1/identity/agent/challenge, /v1/identity/agent/execute |
| noesis_thesis_prepare / complete | POST /v1/theses/agent/challenge, /v1/theses/agent/submit |
| noesis_auth_status | Local metadata only; no network request |

## Pagination and freshness

- signals: hours 1-12, limit 1-100. Continue with nextCursor; cursor/limit alone is sufficient. Every page remains within the rolling 12-hour window. Cursors expire after one hour or service restart. The shared cutoff has 15-second cache granularity and is not a promise of second-level freshness. Missing validity remains unknown.
- theses: limit 1-500, with nextCursor valid for one hour. Continue with cursor/limit alone or unchanged filters. since is inclusive and until exclusive; both filter receivedAt, not the author's publishedAt.
- public_theses: limit 1-50. Preserve filters when continuing with cursor. Reconcile a publication using the full agent identity key and submissionId.
- advisors: limit 1-50. cursor is a nonnegative integer; sort is rank, decision, proposal or created.
- Market directories/disclosures: limit 1-1000, offset nonnegative. Follow nextOffset rather than guessing whether another page exists. The two record collections in a document have separate pagination information. Preserve sourceMayHaveMore.
- series requires start/end together, with start before end. ohlcv needs an instrument_id from the directory. stock_context accepts market values us, hk or cn.

Preserve timestamps, units, coverage and unknown values. Reads do not trigger new research; they return data provided by the service. Internal backend routes, UI-only operations, fund management, raw discovery sources and retired paper APIs are excluded from this catalog.
