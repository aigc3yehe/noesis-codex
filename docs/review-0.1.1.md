# 0.1.1 Review · 2026-09-27

Scope: all source code, signing and session boundaries, MCP interfaces, documentation, packaging and installation for this independent plugin. No backend project files were changed, staged or committed.

## Resolved issues

| Issue | User impact | Fix and regression evidence |
|---|---|---|
| HTML or non-JSON error responses lost HTTP status and Retry-After | A proxy rate-limit page appeared only as INVALID_RESPONSE, leaving users without a wait time | Preserve status, wait time and a safe error code without exposing the response body; `HTML rate-limit response retains status and Retry-After without leaking body` |
| Failure of any protocol module caused the whole capability query to fail | A thesis protocol outage hid valid research and identity information | Return available/partial/unavailable with per-module errors; `protocol discovery preserves working modules when an optional module fails` |
| Unsigned extra response fields overwrote local control fields | The pending ID, wallet or purpose shown for signing could disagree with the pending local operation | Select validated signing fields explicitly and preserve the local pending ID, controller and purpose; `unsigned response metadata cannot override the local pending ID or wallet` |
| A research proof was consumed before local rate limiting | An unsent request still required a new user signature | Consume the proof only on dispatch; a sent request with a lost response still cannot reuse it; `local backoff does not consume an unsent research proof` |
| Completed identity operations still occupied pending-signature capacity | After 16 completed operations, new requests could not be prepared, especially with long-lived binding challenges | Evict completed receipts first when at capacity while retaining truly pending operations; `completed identity receipts do not exhaust the pending challenge quota` |

Each case failed before its fix and passed afterward. The full `npm test` suite passed 29/29 tests. Tests now rebuild the MCP server first so they cannot exercise an old `dist` bundle by accident.

## Independence and delivery

- Package output moved from a sibling directory into this component's `release/` directory; the old version is retained outside the active plugin directory in `~/plugin-archives/noesis-codex/0.1.0/`.
- Source, documentation, tests, build scripts, runtime bundle and archive reside in one component directory. There are no backend imports, database access, local absolute-path dependencies or file-based external npm dependencies.
- The manifest, MCP configuration and Skills use component-relative paths. Runtime use needs only Node.js 22+ and a configured HTTPS service. Development tests use this directory's locked dependencies.
- `scripts/verify-package.py` can repeat the archive hash check and start the real MCP server in an isolated directory without `node_modules`, verifying its tool list and denial of unauthenticated reads.
- The source directory is outside the backend project's Git repository, has no Git repository of its own and is not added to backend Git. Codex market registration and installation cache are host-managed records.

## Acceptance boundary

No user wallet signature, real enrollment, binding, publication or onchain transaction was performed. Earlier live public-protocol results remain in `public-protocol-check.json`; this regression did not create live requests or add collection load. Complete NFT onboarding still requires the user's current-holder wallet. Current service protocols determine JEV availability.
