import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { NoesisClient } from '../src/client.mjs';
import { catalog, resolveEndpoint } from '../src/catalog.mjs';
import { signingContracts, validateChallenge, normalizeContent } from '../src/signing.mjs';

const origin = 'https://noesis.run', now = Date.parse('2026-09-27T04:00:00Z');
const identity = { chainId: 4663, registry: '0x' + '8'.repeat(40), agentId: '7' }, controller = '0x' + '1'.repeat(40), signature = '0x1234';
const content = { publishedAt: new Date(now).toISOString(), targets: [{ name: 'Example', kind: 'strategy', recommendation: 'watch' }], reason: 'A recorded hypothesis.', validUntil: new Date(now + 3600000).toISOString() };
const scopes = ['macro:read','theses:read','market-data:read','signals:read'];
function challenge(kind, body, config = {}) {
  const challengeId = randomUUID(), action = kind === 'research' ? 'read_research' : kind === 'thesis' ? 'publish_thesis' : body.action;
  const life = kind === 'identity' ? action === 'request_binding' ? 86400000 : 600000 : 300000;
  const values = { version: signingContracts[kind].version, origin, action, identity, controller, scopes: config.scopes ?? scopes, challengeId, requestId: challengeId, nonce: 'a'.repeat(32), blockNumber: '100', blockHash: '0x' + 'a'.repeat(64), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + life).toISOString(), sessionSeconds: 900, payload: body.payload ?? {}, submissionId: body.submissionId, content: body.content, contentHash: body.content && '0x' + createHash('sha256').update(JSON.stringify(body.content)).digest('hex') };
  const signingPayload = Object.fromEntries(signingContracts[kind].fields.map(k => [k, values[k]]));
  return { challengeId, signingPayload, message: signingContracts[kind].prefix + JSON.stringify(signingPayload), expiresAt: values.expiresAt };
}
function fixture({ signals = true, intercept } = {}) {
  const calls = [], config = { signals, scopes: scopes.filter(s => signals || s !== 'signals:read') };
  let clock = now;
  const client = new NoesisClient({ clock: () => clock, spacing: 0, fetchImpl: async (url, options) => {
    const path = url.pathname, body = options.body && JSON.parse(options.body); calls.push({ path, options, body, query: url.search });
    const override = await intercept?.(path, options, body); if (override) return override;
    let data;
    if (path.endsWith('/protocol')) {
      const kind = path.includes('/agent-api/') ? 'research' : path.includes('/identity/') ? 'identity' : 'thesis';
      data = { origin, version: signingContracts[kind].version, network: identity, data: { marketData: { configured: true }, ...(signals ? { signals: { configured: true } } : {}) }, endpoints: { ...(signals ? { signals: 'GET /v1/agent-api/signals' } : {}) }, capabilities: { openTheses: { available: true } } };
    } else if (path.endsWith('/challenge')) data = challenge(path.includes('/agent-api/') ? 'research' : path.includes('/identity/') ? 'identity' : 'thesis', body, config);
    else if (path === '/v1/agent-api/auth/session') data = options.method === 'DELETE' ? { revoked: true } : { accessToken: 'f'.repeat(64), tokenType: 'Bearer', identity, scopes: config.scopes, expiresAt: new Date(clock + 900000).toISOString() };
    else data = { items: [], received: true };
    return Response.json(data);
  } });
  return { client, calls, advance: ms => clock += ms };
}
async function login(client) { const p = await client.prepare('research', { identity, controller }); return client.complete('research', p.pendingId, signature); }

test('all 20 research endpoints are present and arbitrary paths/parameters are rejected', () => {
  assert.equal(catalog.filter(x => x.scope !== 'public').length, 20);
  assert.throws(() => resolveEndpoint('/admin/secret'));
  for (const id of ['..','../admin','%2e%2e','x/y','a?b','a#b','x\\y']) assert.throws(() => resolveEndpoint('instrument', { id }));
  assert.throws(() => resolveEndpoint('catalog', { refresh: true }));
  assert.throws(() => resolveEndpoint('series', { metric_id: 'x', start: '2026-09-27T00:00:00Z' }));
  assert.throws(() => resolveEndpoint('signals', { hours: 13 }));
  assert.throws(() => resolveEndpoint('signals', { limit: 101 }));
  assert.equal(resolveEndpoint('advisors', { cursor: 20, sort: 'rank' }).requestPath, '/v1/identity/public/advisors?cursor=20&sort=rank');
});
test('reject non-HTTPS, credentialed, and path-containing origins', () => {
  for (const origin of ['http://noesis.run','https://user:pass@noesis.run','https://noesis.run/admin','https://noesis.run/?x=y']) assert.throws(() => new NoesisClient({ origin }));
});
test('no unauthenticated research read; protocol bootstrap is public and cached', async () => {
  const { client, calls } = fixture();
  await assert.rejects(client.read('macro_latest'), /AUTH_REQUIRED/); assert.equal(calls.length, 0);
  const a = await client.capabilities(); await client.capabilities(); assert.equal(calls.length, 3); assert.equal(a.signalAvailable, true);
});
test('NFT session stays private and bearer is sent only to research reads', async () => {
  const { client, calls } = fixture(); const output = await login(client);
  assert.equal(JSON.stringify(output).includes('f'.repeat(64)), false);
  assert.equal(JSON.stringify(client).includes('f'.repeat(64)), false);
  await client.read('macro_latest'); assert.equal(calls.at(-1).options.headers.authorization, 'Bearer ' + 'f'.repeat(64));
  assert.equal(calls.at(-1).options.redirect, 'error'); assert.equal(calls.at(-1).options.credentials, 'omit');
  await client.read('identity_summary'); assert.equal(calls.at(-1).options.headers.authorization, undefined);
});
for (const field of ['origin','controller','action','identity','scopes','expiresAt','message','extra']) test('reject tampered signing challenge: ' + field, async () => {
  const { client } = fixture({ intercept(path, options, body) {
    if (!path.endsWith('/auth/challenge')) return;
    const c = challenge('research', body);
    if (field === 'message') c.message += '\n';
    else { const v = { origin: 'https://evil.example', controller: '0x' + '2'.repeat(40), action: 'send_funds', identity: { ...identity, agentId: '8' }, scopes: [...scopes,'admin:write'], expiresAt: new Date(now + 86400000).toISOString(), extra: true }[field]; c.signingPayload[field] = v; c.message = signingContracts.research.prefix + JSON.stringify(c.signingPayload); }
    return Response.json(c);
  } });
  await assert.rejects(client.prepare('research', { identity, controller }), /UNSAFE_SIGNING_CHALLENGE/);
});
test('session expiry prevents a network read', async () => {
  const { client, calls, advance } = fixture(); await login(client); advance(900001); const count = calls.length;
  await assert.rejects(client.read('latest', { metric_id: 'x' }), /AUTH_REQUIRED/); assert.equal(calls.length, count);
});
test('ownership failure clears token and does not retry', async () => {
  const { client, calls } = fixture({ intercept: path => path.endsWith('/macro/latest') && Response.json({ error: { code: 'IDENTITY_CONTROL_CHANGED', message: 'secret upstream detail' } }, { status: 401 }) });
  await login(client); await assert.rejects(client.read('macro_latest'), /IDENTITY_CONTROL_CHANGED/); assert.equal(client.status().authenticated, false); assert.equal(calls.filter(c => c.path.endsWith('/macro/latest')).length, 1);
});
test('old deployment has no signals capability and cannot fall back to public discoverer', async () => {
  const { client, calls } = fixture({ signals: false }); assert.equal((await client.capabilities()).signalAvailable, false); await login(client);
  await assert.rejects(client.read('signals', { hours: 12 }), /REAUTHENTICATE_FOR_SCOPE/); assert.equal(calls.some(c => c.path.endsWith('/signals') || c.path.includes('discoverer')), false);
});
test('429 respects Retry-After and returns immediately without automatic retry', async () => {
  const { client, calls, advance } = fixture({ intercept: path => path.endsWith('/macro/latest') && Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429, headers: { 'retry-after': '60' } }) });
  await login(client); await assert.rejects(client.read('macro_latest'), e => e.code === 'RATE_LIMITED' && e.details.retryAfterSeconds === 60);
  const count = calls.length; await assert.rejects(client.read('macro_latest'), /RETRY_LATER/); assert.equal(calls.length, count);
  advance(60000); await assert.rejects(client.read('macro_latest'), /RATE_LIMITED/); assert.equal(calls.length, count + 1);
});
test('lost research session response invalidates the single-use pending challenge', async () => {
  const { client } = fixture({ intercept(path) { if (path.endsWith('/auth/session')) throw Error('contains secret response'); } });
  const p = await client.prepare('research', { identity, controller });
  await assert.rejects(client.complete('research', p.pendingId, signature), /NETWORK_UNCERTAIN/);
  await assert.rejects(client.complete('research', p.pendingId, signature), /UNKNOWN_PENDING_CHALLENGE/);
});
test('identity binding accepts its actual 24h lifetime and exact target wallet', async () => {
  const { client } = fixture();
  const p = await client.prepare('identity', { identity, controller, action: 'request_binding', payload: { userAddress: controller } });
  assert.equal(Date.parse(p.expiresAt) - now, 86400000);
  assert.equal(p.signingPayload.payload.userAddress, controller);
  await assert.rejects(client.complete('thesis', p.pendingId, signature), /UNKNOWN_PENDING_CHALLENGE/);
});
test('thesis content and hash match; uncertain submission keeps exact envelope', async () => {
  let first = true;
  const { client, calls } = fixture({ intercept(path) { if (path.endsWith('/agent/submit') && first) { first = false; throw Error(); } } });
  const p = await client.prepare('thesis', { identity, controller, submissionId: randomUUID(), content });
  assert.deepEqual(p.signingPayload.content, normalizeContent(content));
  await assert.rejects(client.complete('thesis', p.pendingId, signature), /NETWORK_UNCERTAIN/);
  await assert.rejects(client.complete('thesis', p.pendingId, '0x4321'), /RETRY_SIGNATURE_CHANGED/);
  await client.complete('thesis', p.pendingId, signature);
  const submissions = calls.filter(c => c.path.endsWith('/agent/submit')); assert.deepEqual(submissions[0].body, submissions[1].body);
});
test('already-published thesis returns its existing receipt without asking to sign again', async () => {
  const submissionId = randomUUID();
  const { client } = fixture({ intercept(path, options, body) { if (path === '/v1/theses/agent/challenge') return Response.json({ existing: { identity, submissionId, content: body.content } }); } });
  const result = await client.prepare('thesis', { identity, controller, submissionId, content }); assert.equal(result.existingReceipt.existing.submissionId, submissionId); assert.equal(result.pendingId, undefined);
});
test('logout clears local credentials even when server is unavailable', async () => {
  const { client } = fixture({ intercept(path, options) { if (options.method === 'DELETE') throw Error(); } });
  await login(client); await assert.rejects(client.logout(), /NETWORK_UNCERTAIN/); assert.equal(client.status().authenticated, false);
});
test('oversized JSON response is rejected instead of silently truncated', async () => {
  const { client } = fixture({ intercept: path => path.endsWith('/macro/latest') && Response.json({ text: 'x'.repeat(2 * 1024 * 1024) }) });
  await login(client); await assert.rejects(client.read('macro_latest'), /RESPONSE_TOO_LARGE/);
});
test('bounded queue admits at most eight operations', async () => {
  const { client } = fixture(); let release;
  const wait = new Promise(r => release = r);
  const tasks = Array.from({ length: 8 }, () => client.run(() => wait));
  await assert.rejects(client.run(() => true), /CLIENT_BUSY/); release(); await Promise.all(tasks);
});

test('HTML rate-limit response retains status and Retry-After without leaking body', async () => {
  const { client } = fixture({ intercept: path => path.endsWith('/macro/latest') && new Response('<html>internal proxy details</html>', { status: 429, headers: { 'content-type': 'text/html', 'retry-after': '120' } }) });
  await login(client);
  await assert.rejects(client.read('macro_latest'), e => e.code === 'RATE_LIMITED' && e.details.status === 429 && e.details.retryAfterSeconds === 120 && !JSON.stringify(e).includes('internal proxy'));
});
test('protocol discovery preserves working modules when an optional module fails', async () => {
  const { client } = fixture({ intercept: path => path === '/v1/theses/protocol' && new Response('gateway down', { status: 503 }) });
  const result = await client.capabilities();
  assert.equal(result.protocols.research.version, 'noesis-research-api-v1');
  assert.equal(result.protocols.identity.version, 'noesis-identity-v1');
  assert.equal(result.protocolErrors.thesis.status, 503);
});
test('unsigned response metadata cannot override the local pending ID or wallet', async () => {
  const { client } = fixture({ intercept(path, options, body) {
    if (path.endsWith('/auth/challenge')) return Response.json({ ...challenge('research', body), pendingId: 'remote-value', controller: '0x' + '2'.repeat(40), purpose: 'transfer funds', accessToken: 'should-not-be-returned' });
  } });
  const p = await client.prepare('research', { identity, controller });
  assert.notEqual(p.pendingId, 'remote-value'); assert.equal(p.controller, controller); assert.equal(p.purpose, 'read_research'); assert.equal(p.accessToken, undefined);
  assert.equal((await client.complete('research', p.pendingId, signature)).authenticated, true);
});
test('local backoff does not consume an unsent research proof', async () => {
  const { client, advance, calls } = fixture({ intercept: path => path.endsWith('/public/summary') && Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429, headers: { 'retry-after': '60' } }) });
  const p = await client.prepare('research', { identity, controller });
  await assert.rejects(client.read('identity_summary'), /RATE_LIMITED/);
  await assert.rejects(client.complete('research', p.pendingId, signature), /RETRY_LATER/);
  assert.equal(calls.some(c => c.path.endsWith('/auth/session')), false);
  advance(60000); assert.equal((await client.complete('research', p.pendingId, signature)).authenticated, true);
});
test('completed identity receipts do not exhaust the pending challenge quota', async () => {
  const { client } = fixture();
  for (let i = 0; i < 17; i++) {
    const p = await client.prepare('identity', { identity, controller, action: 'status' });
    await client.complete('identity', p.pendingId, signature);
  }
});
