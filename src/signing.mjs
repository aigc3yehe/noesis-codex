import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const identitySchema = z.object({ chainId: z.number().int().positive(), registry: addressSchema.transform(s => s.toLowerCase()), agentId: z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(s => BigInt(s) < 2n ** 256n) }).strict();
export const signatureSchema = z.string().regex(/^0x(?:[a-fA-F0-9]{2}){1,8192}$/);
const text = z.string().refine(s => !s.includes('\0') && Array.from(s).every(c => { const n = c.codePointAt(0); return n < 0xd800 || n > 0xdfff; }));
export const contentSchema = z.object({
  publishedAt: z.string().datetime({ offset: true }),
  targets: z.array(z.object({ name: text.transform(s => s.trim()).pipe(z.string().min(1).max(160)), kind: z.enum(['asset','strategy']), recommendation: z.enum(['invest','watch']), chainId: z.number().int().positive().optional(), address: z.string().min(32).max(44).optional(), market: z.string().trim().min(1).max(60).optional(), symbol: z.string().trim().min(1).max(40).optional(), chain: z.string().regex(/^[a-z0-9-]{3,8}:[a-zA-Z0-9_-]{1,32}$/).optional() }).strict()).min(1).max(10),
  reason: text.pipe(z.string().min(1).max(20000)).refine(s => s.trim().length > 0),
  validUntil: z.string().datetime({ offset: true }),
  forecast: z.object({ targetIndex: z.number().int().min(0).max(9), direction: z.enum(['up','down']) }).strict().optional(),
}).strict().refine(c => Date.parse(c.validUntil) > Date.parse(c.publishedAt), 'Validity must follow publication.');
export function normalizeContent(input) {
  const c = contentSchema.parse(input);
  return { publishedAt: new Date(c.publishedAt).toISOString(), targets: c.targets.map(t => ({ name: t.name, kind: t.kind, recommendation: t.recommendation, ...(t.chainId ? { chainId: t.chainId } : {}), ...(t.address ? { address: t.chain?.startsWith('solana:') ? t.address : t.address.toLowerCase() } : {}), ...(t.market ? { market: t.market } : {}), ...(t.symbol ? { symbol: t.symbol } : {}), ...(t.chain ? { chain: t.chain } : {}) })), reason: c.reason, ...(c.forecast ? { forecast: c.forecast } : {}), validUntil: new Date(c.validUntil).toISOString() };
}
export const signingContracts = {
  research: { version: 'noesis-research-api-v1', prefix: 'NOESIS | Read research data | v1\n', fields: ['version','origin','action','identity','controller','scopes','challengeId','nonce','blockNumber','blockHash','issuedAt','expiresAt','sessionSeconds'] },
  identity: { version: 'noesis-identity-v1', prefix: 'NOESIS | ERC-8004 advisor action | v1\n', fields: ['version','origin','action','requestId','identity','controller','blockNumber','blockHash','payload','nonce','issuedAt','expiresAt'] },
  thesis: { version: 'noesis-open-theses-v1', prefix: 'NOESIS | Publish open thesis | v1\n', fields: ['version','origin','action','challengeId','identity','controller','submissionId','content','contentHash','blockNumber','blockHash','nonce','issuedAt','expiresAt'] },
};
export function validateChallenge(kind, response, expected, now = Date.now()) {
  const contract = signingContracts[kind], p = response.signingPayload;
  const check = ok => { if (!ok) throw new Error('UNSAFE_SIGNING_CHALLENGE'); };
  check(p && isDeepStrictEqual(Object.keys(p), contract.fields));
  check(p.version === contract.version && p.origin === expected.origin && p.action === expected.action);
  check(isDeepStrictEqual(p.identity, expected.identity) && isDeepStrictEqual(Object.keys(p.identity), ['chainId','registry','agentId']));
  check(typeof p.controller === 'string' && p.controller.toLowerCase() === expected.controller.toLowerCase());
  check(z.string().uuid().safeParse(response.challengeId).success);
  check((kind === 'identity' ? p.requestId : p.challengeId) === response.challengeId);
  const lifetime = kind === 'identity' ? (expected.action === 'request_binding' ? 86400000 : 600000) : 300000;
  check(response.expiresAt === p.expiresAt && Date.parse(p.expiresAt) > now && Date.parse(p.issuedAt) <= now + 30000 && Date.parse(p.issuedAt) > now - 330000 && Date.parse(p.expiresAt) <= Date.parse(p.issuedAt) + lifetime);
  check(typeof p.nonce === 'string' && p.nonce.length >= 16 && p.nonce.length <= 256 && /^\d+$/.test(p.blockNumber) && /^0x[a-fA-F0-9]{64}$/.test(p.blockHash));
  if (kind === 'research') check(isDeepStrictEqual(p.scopes, expected.scopes) && p.sessionSeconds === 900);
  if (kind === 'identity') check(isDeepStrictEqual(p.payload, expected.payload));
  if (kind === 'thesis') {
    check(p.submissionId === expected.submissionId && isDeepStrictEqual(p.content, expected.content));
    check(p.contentHash === '0x' + createHash('sha256').update(JSON.stringify(expected.content)).digest('hex'));
    check(JSON.stringify(p.content) === JSON.stringify(expected.content));
  }
  check(response.message === contract.prefix + JSON.stringify(p));
  return response;
}
