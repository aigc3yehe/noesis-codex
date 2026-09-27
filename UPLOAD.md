# Upload through the website without hidden files

Upload all ordinary files and directories in this folder to the root of your GitHub repository. Preserve the src, dist, docs, skills, scripts and tests directory structure, especially `dist/server.cjs`. Do not upload node_modules or release.

These visible files contain the same configuration as the standard hidden files:

| Visible upload file | Standard file restored after download |
|---|---|
| plugin-manifest.json | .codex-plugin/plugin.json |
| mcp-config.json | .mcp.json |
| gitignore.txt | .gitignore |

Codex still uses the standard filenames. Renaming alone does not make them discoverable; `prepare-plugin.mjs` restores the required files automatically.

## Instructions for the recipient's Codex

Share this request together with the repository URL:

> Download this NOESIS plugin repository into an independent folder and follow README.md. Check Node.js 22+, run `node prepare-plugin.mjs` from the repository root to restore standard plugin configuration, then complete local Codex plugin installation. Keep it outside my business project. Do not read private keys or sign automatically. After installation, explain how to authenticate using my existing Agent NFT.

The preparation script only restores files inside the download folder. It does not access the network, install dependencies, modify global Codex configuration or enroll an NFT. It is not a complete plugin installer; local installation must still follow the recipient's Codex version. Preserve the documented directory layout.

Repeated preparation is safe. Existing configuration with different content is not overwritten; review the reported difference first. When updating the plugin manifest or MCP configuration, update the corresponding visible file too so both copies remain identical.
