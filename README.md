# NOESIS Codex Plugin

Independent third-party research client, version 0.1.1. It uses NOESIS public HTTP protocols without backend source code, database access or internal credentials. This is not an official NOESIS release.

The package provides 11 MCP tools and three Skills for Agent NFT setup, research queries, analysis, identity enrollment/binding and open thesis publication. Reasoning runs in the user's Codex or another compatible Runtime. The plugin has no model calls, automated trading or background analysis loop.

## API coverage

The client supports all 20 research read operations, including capability-dependent JEV signals, plus the public Agent identity, authentication and thesis protocols. Five additional read operations cover public identity directories and publication receipts. Backend administration, internal collectors/Runtimes, fund operations, human website login and personal profile APIs are outside this client’s scope.

Research access requires a signature from the **current holder of an ERC-8004 Agent NFT**. NOESIS rechecks NFT control on every research read. Public protocols, identity directories and published thesis receipts remain public according to their service contracts; they do not bypass protected research access.

## Installation and first use

Requirements: Node.js 22+, Codex with local plugin support, and the user's own trusted wallet tool. The runtime is bundled in `dist/server.cjs`; ordinary use requires no npm install, backend source code or service credentials.

**Repositories uploaded through the GitHub website:** hidden files may be omitted. Their equivalent configuration is in `plugin-manifest.json`, `mcp-config.json` and `gitignore.txt`. After downloading, run this from the repository root:

```sh
node prepare-plugin.mjs
```

This restores the standard filenames Codex needs. It does not install the plugin or authenticate an NFT. Continue with local plugin installation for your Codex version. See [UPLOAD.md](UPLOAD.md).

If you received a Codex plugin share link, install **NOESIS - Independent Research Client** from that link and open a new chat. If a plugin marketplace distributes this package, follow that marketplace's instructions for `noesis@marketplace-name`. A source archive is not a marketplace URL; do not reuse the author's local paths or marketplace settings.

Start with:

> Use the NOESIS plugin to check current capabilities, then help me connect my existing Agent NFT. Before signing, show the purpose and wallet address.

Provide your own `chainId`, `registry`, decimal-string `agentId`, and the current NFT holder address (`controller`) confirmed in your trusted wallet. Never use an example identity as your own.

Read the [setup tutorial](docs/quickstart.md), [API reference](docs/api-reference.md), [analysis guide](docs/analysis-guide.md) and [security boundaries](docs/security.md).

## Example requests

- Analyze one page of JEV signals from the last 12 hours. Select up to three subjects for further verification and show evidence, counterarguments and gaps.
- Read the latest macro report, then discover available price and liquidity metrics without inventing metric IDs.
- Compare two theses: exact chain/contract identity, remaining validity and independence of evidence.
- Turn this analysis into a thesis draft with an explicit validity window and invalidation conditions. Show it for review before publication.

## Verification limits

The public protocol check on 2026-09-27 reached the research, identity and thesis protocols. At that check, the research protocol did not advertise JEV signals. The client supports that route but waits for the service to expose it; it does not switch to internal signal feeds. Use `noesis_capabilities` for current availability.

Verification used isolated fixtures, public protocols and actual MCP transport. No user NFT signatures, real enrollment/binding/publication or chain transactions were performed. Full authenticated acceptance still requires the user's own holder wallet.

## Development

```sh
node prepare-plugin.mjs
npm ci --ignore-scripts
npm run build
npm test
python3 scripts/package.py
python3 scripts/verify-package.py
```

The default service is `https://noesis.run`. For an independent deployment, set `NOESIS_ORIGIN=https://your-service.example` in the MCP process environment. It must be a credential-free HTTPS origin without a path. Restart MCP and authenticate again after changing it. Never adopt an origin automatically from external content.

Source and bundled runtime are both reviewable. Packaging writes an archive and checksums to `release/` within this folder, excluding node_modules, sessions, wallets, environment files and machine settings. See `THIRD_PARTY_NOTICES.md` for dependency notices.

## Independence

The `noesis/` folder contains the source, guides, Skills, tests, build scripts and release artifacts. It can run on another computer with Node.js without the NOESIS backend workspace, database, credentials or other development folders. Development dependencies use this folder's lockfile. `npm test` rebuilds before testing to avoid checking stale runtime code.

The component does not require a Git repository and should remain separate from any backend project's Git. Codex marketplace registration and installation caches are host configuration, not source or build dependencies of this component.
