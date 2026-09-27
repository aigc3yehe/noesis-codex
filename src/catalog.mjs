import { z } from 'zod';

const str = (max = 200) => z.string().min(1).max(max);
const id = str(220).refine(s => !/[\/%?#\\\x00-\x20]/.test(s) && s !== '.' && s !== '..', 'Use the exact identifier returned by the directory.');
const page = { limit: z.number().int().min(1).max(1000).optional(), offset: z.number().int().nonnegative().optional() };
const time = z.string().datetime({ offset: true });
const metric = { metric_id: str(), entity: str().optional() };
const cursor = str(2000).optional();
const rows = [];
function add(name, path, fields, description, scope = 'market-data:read', refine) {
  let schema = z.object(fields).strict();
  if (refine) schema = schema.refine(refine, 'Provide an ordered start/end or since/until time range.');
  rows.push({ name, path, schema, description, scope });
}
add('macro_latest', '/v1/agent-api/macro/latest', {}, 'Latest saved macro, crypto and technology assessment.', 'macro:read');
add('macro_report', '/v1/agent-api/macro/{id}', { id }, 'Saved report by reportId.', 'macro:read');
add('signals', '/v1/agent-api/signals', { hours: z.number().int().min(1).max(12).optional(), limit: z.number().int().min(1).max(100).optional(), cursor }, 'Saved JEV signals, maximum rolling 12 hours; recorded summaries only. Capability-dependent.', 'signals:read');
add('theses', '/v1/agent-api/theses', { limit: z.number().int().min(1).max(500).optional(), cursor: z.string().regex(/^[a-f0-9]{48}$/).optional(), agent: str().optional(), q: str(160).optional(), status: z.enum(['active', 'expired']).optional(), since: time.optional(), until: time.optional() }, 'Authenticated thesis stream; since/until filter receipt time.', 'theses:read', q => !q.since || !q.until || Date.parse(q.since) < Date.parse(q.until));
for (const [name, path, fields, description] of [
  ['catalog', 'catalog', {}, 'Available data families, metric IDs and entities.'],
  ['indicators', 'indicators', { ...page, unit_id: str().optional(), data_layer: str().optional() }, 'Metric definitions and quality.'],
  ['latest', 'latest', metric, 'Latest stored metric observation.'],
  ['freshness', 'freshness', metric, 'Source freshness and quality; not proof of latest official release.'],
  ['ohlcv', 'ohlcv', { instrument_id: str(), interval: z.enum(['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w','1M']).optional(), limit: page.limit }, 'Stored candles and actual coverage.'],
  ['stock_context', 'stock-context', { symbol: str(60), market: z.enum(['us','hk','cn']) }, 'Stock evidence with field-level gaps.'],
  ['instruments', 'instruments', { ...page, market: str(60).optional() }, 'Instrument IDs; inspect sourceMayHaveMore.'],
  ['instrument', 'instruments/{id}', { id }, 'Instrument identity and mappings.'],
  ['taxonomies', 'taxonomies', page, 'Sector and theme directory.'],
  ['taxonomy_members', 'taxonomies/{id}/instruments', { id, ...page }, 'Instruments in one taxonomy.'],
  ['subjects', 'holdings/subjects', { ...page, subject_type: z.enum(['person','qdii_fund']).optional() }, 'Public disclosure subjects.'],
  ['snapshots', 'holdings/subjects/{id}/snapshots', { id, ...page }, 'Reported disclosure snapshots.'],
  ['positions', 'holdings/subjects/{id}/positions', { id, ...page, compare: z.enum(['previous','none']).optional() }, 'Disclosed holdings; these are not current private positions.'],
  ['transactions', 'holdings/subjects/{id}/transactions', { id, ...page }, 'Publicly disclosed transactions; source cap may apply.'],
  ['document', 'holdings/documents/{id}', { id: z.string().regex(/^[1-9][0-9]*$/), ...page }, 'Disclosure document; positions and transactions paginate independently.'],
]) add(name, '/v1/agent-api/data/' + path, fields, description);
add('series', '/v1/agent-api/data/series', { ...metric, limit: page.limit, start: time.optional(), end: time.optional() }, 'Metric history with original dates.', 'market-data:read', q => (!q.start && !q.end) || (!!q.start && !!q.end && Date.parse(q.start) < Date.parse(q.end)));

// These are documented protocol bootstrap/receipt APIs, publicly readable by design.
add('advisors', '/v1/identity/public/advisors', { limit: z.number().int().min(1).max(50).optional(), cursor: z.number().int().nonnegative().optional(), sort: z.enum(['rank','decision','proposal','created']).optional(), q: str().optional() }, 'Public NFT advisor directory (not a private user profile).', 'public');
add('advisor', '/v1/identity/public/advisors/{id}', { id }, 'Public NFT advisor by identity key.', 'public');
add('identity_summary', '/v1/identity/public/summary', {}, 'Public registration count.', 'public');
add('public_theses', '/v1/theses/public', { limit: z.number().int().min(1).max(50).optional(), cursor, agent: str(220).optional(), submissionId: z.string().uuid().optional(), q: str().optional(), status: z.enum(['active','expired']).optional(), verifiable: z.literal('true').optional() }, 'Public publication receipts; preserve filters across pages.', 'public');
add('thesis_receipt', '/v1/theses/public/{id}', { id: z.string().uuid() }, 'Public thesis receipt and recorded evaluation.', 'public');

export const catalog = Object.freeze(rows);
export const endpointNames = rows.map(x => x.name);
export function resolveEndpoint(name, parameters = {}) {
  const endpoint = rows.find(x => x.name === name);
  if (!endpoint) throw new Error('UNKNOWN_ENDPOINT');
  const parsed = endpoint.schema.parse(parameters);
  const path = endpoint.path.replace('{id}', encodeURIComponent(parsed.id ?? ''));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) if (key !== 'id') query.set(key, String(value));
  return { ...endpoint, requestPath: path + (query.size ? '?' + query : '') };
}
