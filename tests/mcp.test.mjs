import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

test('bundled MCP initializes, lists schemas and denies unauthenticated research without network', async () => {
  const client = new Client({ name: 'isolated-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../dist/server.cjs', import.meta.url))], cwd: tmpdir(), stderr: 'pipe' });
  let errors = ''; transport.stderr?.on('data', b => errors += b.toString());
  try {
    await client.connect(transport);
    const tools = await client.listTools(); assert.equal(tools.tools.length, 11);
    assert.ok(tools.tools.find(x => x.name === 'noesis_thesis_complete').annotations.destructiveHint);
    const catalog = await client.callTool({ name: 'noesis_api_catalog', arguments: {} });
    assert.equal(JSON.parse(catalog.content[0].text).endpoints.length, 25);
    const result = await client.callTool({ name: 'noesis_read', arguments: { endpoint: 'macro_latest' } });
    assert.equal(result.isError, true); assert.equal(JSON.parse(result.content[0].text).error.code, 'AUTH_REQUIRED');
    assert.equal(errors, '');
  } finally { await client.close(); }
});
