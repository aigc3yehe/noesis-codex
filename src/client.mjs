import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { catalog, resolveEndpoint } from './catalog.mjs';
import { addressSchema, identitySchema, signatureSchema, normalizeContent, validateChallenge, signingContracts } from './signing.mjs';

const protocolPaths = { research: '/v1/agent-api/protocol', identity: '/v1/identity/protocol', thesis: '/v1/theses/protocol' };
export class ClientError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}
function requireValue(ok, code) { if (!ok) throw new ClientError(code); }
function originValue(value) {
  const u = new URL(value);
  requireValue(u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash, 'INVALID_HTTPS_ORIGIN');
  return u.origin;
}
const knownScopes = ['macro:read', 'theses:read', 'market-data:read', 'signals:read'];
export class NoesisClient {
  #session;
  #pending = new Map();
  #protocols = new Map();
  #tail = Promise.resolve();
  #nextAt = 0;
  #blockedUntil = 0;
  #clock;
  #fetch;
  #delay;
  #spacing;
  #queued = 0;
  constructor({ origin = 'https://noesis.run', fetchImpl = fetch, clock = Date.now, delay = ms => new Promise(r => setTimeout(r, ms)), spacing = 2100 } = {}) {
    this.origin = originValue(origin); this.#fetch = fetchImpl; this.#clock = clock; this.#delay = delay; this.#spacing = spacing;
  }
  // All operations, including session changes, are serialized. No background work.
  run(operation) {
    if (this.#queued >= 8) return Promise.reject(new ClientError('CLIENT_BUSY'));
    this.#queued++;
    const task = this.#tail.then(operation);
    this.#tail = task.catch(() => {}).finally(() => this.#queued--);
    return task;
  }
  async #request(path, { method = 'GET', body, authenticated = false, onDispatch } = {}) {
    requireValue(path.startsWith('/v1/') && !path.startsWith('//'), 'INVALID_PATH');
    const url = new URL(path, this.origin);
    requireValue(url.origin === this.origin, 'INVALID_PATH');
    if (this.#blockedUntil > this.#clock()) throw new ClientError('RETRY_LATER', { retryAfterSeconds: Math.ceil((this.#blockedUntil - this.#clock()) / 1000) });
    const wait = this.#nextAt - this.#clock();
    if (wait > 0) await this.#delay(wait);
    this.#nextAt = this.#clock() + this.#spacing;
    const headers = { accept: 'application/json' };
    if (body) headers['content-type'] = 'application/json';
    if (authenticated) { this.#requireSession(); headers.authorization = 'Bearer ' + this.#session.accessToken; }
    let response;
    try {
      onDispatch?.();
      response = await this.#fetch(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000) });
    } catch { throw new ClientError('NETWORK_UNCERTAIN', { mutationMayHaveSucceeded: method !== 'GET' }); }
    if (authenticated && (response.status === 401 || response.status === 403)) this.#session = undefined;
    const retryHeader = response.headers.get('retry-after');
    let retryAfterSeconds;
    if (response.status === 429 || response.status === 503) {
      const raw = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : retryHeader ? Math.ceil((Date.parse(retryHeader) - this.#clock()) / 1000) : NaN;
      retryAfterSeconds = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 86400)) : response.status === 429 ? 60 : 5;
      this.#blockedUntil = this.#clock() + retryAfterSeconds * 1000;
    }
    // Bound streamed responses without truncating JSON or silently dropping evidence.
    let value, parseError, reader;
    try {
      requireValue(/application\/json/i.test(response.headers.get('content-type') ?? ''), 'INVALID_RESPONSE');
      reader = response.body.getReader(); let size = 0; const chunks = [];
      for (;;) { const { done, value: bytes } = await reader.read(); if (done) break; size += bytes.length; requireValue(size <= 2 * 1024 * 1024, 'RESPONSE_TOO_LARGE'); chunks.push(Buffer.from(bytes)); }
      value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requireValue(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_RESPONSE');
    } catch (e) { parseError = e instanceof ClientError ? e : new ClientError('INVALID_RESPONSE'); }
    finally { await (reader ? reader.cancel() : response.body?.cancel())?.catch(() => {}); }
    if (!response.ok) {
      const fallback = { 401: 'AUTH_REQUIRED', 403: 'ACCESS_DENIED', 429: 'RATE_LIMITED', 503: 'SERVICE_UNAVAILABLE' }[response.status] ?? 'HTTP_ERROR';
      const code = !parseError && /^[A-Z][A-Z0-9_]{1,80}$/.test(value?.error?.code ?? '') ? value.error.code : fallback;
      throw new ClientError(code, { status: response.status, ...(retryAfterSeconds ? { retryAfterSeconds } : {}), ...(method !== 'GET' && response.status >= 500 ? { mutationMayHaveSucceeded: true } : {}) });
    }
    if (parseError) throw new ClientError(parseError.code, { mutationMayHaveSucceeded: method !== 'GET' });
    return value;
  }
  #requireSession(scope) {
    if (!this.#session || Date.parse(this.#session.expiresAt) <= this.#clock()) { this.#session = undefined; throw new ClientError('AUTH_REQUIRED'); }
    requireValue(!scope || this.#session.scopes.includes(scope), 'REAUTHENTICATE_FOR_SCOPE');
  }
  status() {
    if (this.#session && Date.parse(this.#session.expiresAt) <= this.#clock()) this.#session = undefined;
    return { origin: this.origin, authenticated: !!this.#session, ...(this.#session ? { identity: this.#session.identity, scopes: this.#session.scopes, expiresAt: this.#session.expiresAt } : {}), ownership: 'Server rechecks current NFT control on each research read; local session status is not a fresh ownership proof.' };
  }
  async protocol(kind, refresh = false) {
    requireValue(Object.hasOwn(protocolPaths, kind), 'UNKNOWN_PROTOCOL');
    const cached = this.#protocols.get(kind);
    if (!refresh && cached?.until > this.#clock()) return cached.value;
    const value = await this.#request(protocolPaths[kind]);
    requireValue(value.version === signingContracts[kind].version && value.origin === this.origin, 'PROTOCOL_MISMATCH');
    this.#protocols.set(kind, { value, until: this.#clock() + 300000 }); return value;
  }
  async capabilities(refresh = false) {
    const protocols = {}, protocolErrors = {};
    for (const kind of Object.keys(protocolPaths)) {
      try { protocols[kind] = await this.protocol(kind, refresh); }
      catch (e) { protocolErrors[kind] = e instanceof ClientError ? { code: e.code, ...e.details } : { code: 'PROTOCOL_UNAVAILABLE' }; }
    }
    return { origin: this.origin, status: Object.keys(protocolErrors).length ? Object.keys(protocols).length ? 'partial' : 'unavailable' : 'available', protocols, protocolErrors, localSession: this.status(), signalAvailable: protocols.research ? protocols.research.data?.signals?.configured === true : null, supportedEndpoints: catalog.map(({ name, path, scope, description }) => ({ name, path, scope, description })) };
  }
  async read(name, parameters) {
    const endpoint = resolveEndpoint(name, parameters);
    if (endpoint.scope !== 'public') {
      this.#requireSession(endpoint.scope);
      if (endpoint.scope === 'signals:read') {
        const protocol = await this.protocol('research');
        requireValue(protocol.data?.signals?.configured === true && protocol.endpoints?.signals === 'GET /v1/agent-api/signals', 'SIGNALS_NOT_AVAILABLE');
      }
    }
    return this.#request(endpoint.requestPath, { authenticated: endpoint.scope !== 'public' });
  }
  async prepare(kind, input) {
    requireValue(Object.hasOwn(protocolPaths, kind), 'UNKNOWN_PROTOCOL');
    const identity = identitySchema.parse(input.identity), controller = addressSchema.parse(input.controller).toLowerCase();
    const protocol = await this.protocol(kind);
    requireValue(identity.chainId === protocol.network.chainId && identity.registry === protocol.network.registry.toLowerCase(), 'UNSUPPORTED_IDENTITY');
    let path, body, expected = { origin: this.origin, identity, controller };
    if (kind === 'research') {
      path = '/v1/agent-api/auth/challenge'; body = { identity };
      expected = { ...expected, action: 'read_research', scopes: ['macro:read','theses:read', ...(protocol.data?.marketData?.configured ? ['market-data:read'] : []), ...(protocol.data?.signals?.configured ? ['signals:read'] : [])] };
    } else if (kind === 'identity') {
      const action = z.enum(['enroll','status','request_binding','withdraw_binding']).parse(input.action);
      const payload = (action === 'request_binding' ? z.object({ userAddress: addressSchema.transform(s => s.toLowerCase()) }) : action === 'withdraw_binding' ? z.object({ requestId: z.string().uuid() }) : z.object({})).strict().parse(input.payload ?? {});
      path = '/v1/identity/agent/challenge'; body = { identity, action, payload }; expected = { ...expected, action, payload };
    } else {
      requireValue(protocol.capabilities?.openTheses?.available === true, 'THESIS_PUBLISHING_UNAVAILABLE');
      const content = normalizeContent(input.content), submissionId = z.string().uuid().parse(input.submissionId);
      path = '/v1/theses/agent/challenge'; body = { identity, submissionId, content }; expected = { ...expected, action: 'publish_thesis', content, submissionId };
    }
    for (const [key, value] of this.#pending) if (Date.parse(value.challenge.expiresAt) <= this.#clock()) this.#pending.delete(key);
    // Finished receipts are optional retry caches, not outstanding signing work.
    for (const [key, value] of this.#pending) {
      if (this.#pending.size < 16) break;
      if (value.receipt) this.#pending.delete(key);
    }
    requireValue(this.#pending.size < 16, 'TOO_MANY_PENDING_CHALLENGES');
    const challenge = await this.#request(path, { method: 'POST', body });
    // An idempotent publication may already have a receipt instead of a challenge.
    if (kind === 'thesis' && !challenge.signingPayload && challenge.existing) {
      requireValue(challenge.existing.submissionId === expected.submissionId && isDeepStrictEqual(challenge.existing.identity, identity) && isDeepStrictEqual(challenge.existing.content, expected.content), 'INVALID_RECEIPT');
      return { existingReceipt: challenge };
    }
    validateChallenge(kind, challenge, expected, this.#clock());
    const pendingId = randomUUID();
    this.#pending.set(pendingId, { kind, challenge, expected });
    return { pendingId, purpose: expected.action, controller, challengeId: challenge.challengeId, message: challenge.message, signingPayload: challenge.signingPayload, expiresAt: challenge.expiresAt, ...(challenge.serverTime ? { serverTime: challenge.serverTime } : {}), ...(challenge.warnings ? { warnings: challenge.warnings } : {}), signingInstructions: 'Use your trusted wallet to sign message as UTF-8 EIP-191 text after user authorization. Do not prehash, reformat, or send a private key. Then pass the signature to the matching complete tool.' };
  }
  async complete(kind, pendingId, signature) {
    signatureSchema.parse(signature);
    const pending = this.#pending.get(pendingId);
    requireValue(pending && pending.kind === kind, 'UNKNOWN_PENDING_CHALLENGE');
    requireValue(Date.parse(pending.challenge.expiresAt) > this.#clock(), 'CHALLENGE_EXPIRED');
    // Network-loss retries must keep the original signed envelope.
    requireValue(!pending.signature || pending.signature === signature, 'RETRY_SIGNATURE_CHANGED');
    if (pending.receipt) return pending.receipt;
    const path = kind === 'research' ? '/v1/agent-api/auth/session' : kind === 'identity' ? '/v1/identity/agent/execute' : '/v1/theses/agent/submit';
    const response = await this.#request(path, { method: 'POST', body: { challengeId: pending.challenge.challengeId, signature }, onDispatch: () => {
      pending.signature = signature;
      if (kind === 'research') this.#pending.delete(pendingId); // Single-use once dispatched, even if response is lost.
    } });
    if (kind === 'research') {
      requireValue(response.tokenType === 'Bearer' && /^[a-f0-9]{64}$/.test(response.accessToken) && isDeepStrictEqual(response.identity, pending.expected.identity) && isDeepStrictEqual(response.scopes, pending.expected.scopes) && response.scopes.every(s => knownScopes.includes(s)) && Date.parse(response.expiresAt) > this.#clock() && Date.parse(response.expiresAt) <= this.#clock() + 901000, 'INVALID_SESSION_RESPONSE');
      this.#session = { accessToken: response.accessToken, identity: response.identity, scopes: response.scopes, expiresAt: response.expiresAt };
      return this.status();
    }
    pending.receipt = response; return response;
  }
  async logout() {
    if (!this.#session) return { revoked: false, localSessionCleared: true };
    try { return await this.#request('/v1/agent-api/auth/session', { method: 'DELETE', authenticated: true }); }
    finally { this.#session = undefined; }
  }
}
