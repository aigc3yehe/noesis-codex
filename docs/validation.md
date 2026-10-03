# Validation record · 2026-09-27

- After the 0.1.1 review, all 29 tests passed, including prior protocol and authentication cases and five regression cases reproduced before their fixes. See [the review](review-0.1.1.md).
- The plugin manifest and all three Skills passed the official local validation scripts.
- The build used locked versions of MCP SDK 1.30.1, Zod 3.25.76, zod-to-json-schema 3.25.2 and esbuild 0.28.2. `npm audit` reported zero vulnerabilities when dependencies were installed; this was not an independent security audit.
- The installed plugin bundle started from its own working directory, listed 11 tools and reported an unauthenticated state. It did not need the backend project environment.
- Real MCP tool calls read the three public live protocols; see `public-protocol-check.json` for the summary. The live protocol did not expose signals, and the plugin reported that limitation.
- There was no real NFT-signature acceptance, enrollment, binding, publication or onchain transaction. This development did not deploy the backend or change service runtime state.

The distribution includes source, the strict endpoint catalog, tutorials and a directly runnable `dist/server.cjs`. `node_modules` is used only to build during development and is excluded from the archive. The runtime has no independent inference engine, scheduled tasks or database access.

Independence check: the archive was extracted into a fresh temporary directory with a space in its path. Using only native Node.js APIs, the MCP server started, listed all 11 tools and rejected an unauthenticated research read. The directory contained neither `node_modules` nor backend source. Per-file SHA-256 archive checks passed. Source and release reside in the same `noesis` component outside backend Git.
