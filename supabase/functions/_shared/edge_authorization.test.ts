import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FUNCTION_NAMES = ['chat-stream', 'chat-documents', 'chat-tools'] as const;
const ADMIN_FUNCTION_NAMES = [
  'broadcast-apology',
  'broadcast-live',
  'broadcast-update',
  'engine-check',
] as const;
const QUOTA_FUNCTION_NAMES = [
  'chat-stream',
  'chat-documents',
  'chat-tools',
  'live',
  'news-summarize',
  'send-welcome',
] as const;

async function functionSource(name: string): Promise<string> {
  return readFile(new URL(`../${name}/index.ts`, import.meta.url), 'utf8');
}

test('every paid chat function authenticates before reading its request body', async () => {
  for (const name of FUNCTION_NAMES) {
    const source = await functionSource(name);
    const authAt = source.indexOf('await requirePrincipal(req');
    const bodyAt = source.indexOf('await readJsonBody<any>(req');
    assert.notEqual(authAt, -1, `${name} must authenticate explicitly`);
    assert.notEqual(bodyAt, -1, `${name} must use bounded JSON parsing`);
    assert.ok(authAt < bodyAt, `${name} must authenticate before parsing content`);
    assert.equal(source.includes('JSON.stringify({ error: err.message })'), false);
  }
});

test('chat stream never substitutes an anonymous key for a missing user JWT', async () => {
  const source = await functionSource('chat-stream');
  assert.equal(source.includes('`Bearer ${SUPABASE_ANON}`'), false);
  assert.equal(source.includes('bodyUserType'), false);
});

test('direct document and tools routes derive persona from verified identity', async () => {
  for (const name of ['chat-documents', 'chat-tools'] as const) {
    const source = await functionSource(name);
    assert.match(source, /profiles\?id=eq\.\$\{principal\.id\}/);
    assert.equal(source.includes("userType  = 'other'"), false);
  }
});

test('Supabase gateway JWT verification is explicit for paid chat functions', async () => {
  const config = await readFile(new URL('../../config.toml', import.meta.url), 'utf8');
  for (const name of FUNCTION_NAMES) {
    assert.match(
      config,
      new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt\\s*=\\s*true`),
      `${name} must fail at the gateway as well as in the handler`,
    );
  }
});

test('broadcast and diagnostic functions require explicit admin identity', async () => {
  for (const name of ADMIN_FUNCTION_NAMES) {
    const source = await functionSource(name);
    assert.match(source, /await requireAdminPrincipal\(req/);
    assert.equal(source.includes('x-admin-key'), false);
    assert.equal(source.includes('?? SERVICE_KEY'), false);
  }
});

test('admin functions keep the service role server-side and enable gateway JWT checks', async () => {
  const config = await readFile(new URL('../../config.toml', import.meta.url), 'utf8');
  for (const name of ADMIN_FUNCTION_NAMES) {
    assert.match(config, new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt\\s*=\\s*true`));
  }
  for (const name of ADMIN_FUNCTION_NAMES.filter((name) => name.startsWith('broadcast-'))) {
    const source = await functionSource(name);
    assert.match(source, /createClient\(SUPABASE_URL, SERVICE_KEY\)/);
    assert.equal(source.includes('failed, alreadySent'), false);
  }
});

test('Live uses verified short-lived tickets instead of caller identity query fields', async () => {
  const edgeSource = await functionSource('live');
  const mobileSource = await readFile(
    new URL('../../../mobile/services/geminiLive.ts', import.meta.url),
    'utf8',
  );
  const config = await readFile(new URL('../../config.toml', import.meta.url), 'utf8');

  assert.match(edgeSource, /await requirePrincipal\(req/);
  assert.match(edgeSource, /await issueLiveTicket\(principal\.id/);
  assert.match(edgeSource, /await verifyLiveTicket\(ticket/);
  assert.equal(mobileSource.includes('userId=${'), false);
  assert.equal(mobileSource.includes('apikey=${encodeURIComponent'), false);
  assert.match(mobileSource, /await requestLiveTicket\(\)/);
  assert.match(
    config,
    /\[functions\.live\]\s+verify_jwt\s*=\s*false/,
    'Live may bypass gateway JWT only because the handler verifies POST auth and signed WS tickets',
  );
});

test('provider-backed functions apply server-side atomic quotas', async () => {
  for (const name of QUOTA_FUNCTION_NAMES) {
    const source = await functionSource(name);
    assert.match(source, /await consumeProviderQuota\(\{/);
  }
});

test('multi-provider streams stop fallback after any visible output', async () => {
  for (const name of FUNCTION_NAMES) {
    const source = await functionSource(name);
    assert.match(source, /await runProviderFallback\(\{/);
    assert.match(source, /hasOutput: \(\) => outputStarted/);
    assert.equal(source.includes('(await res.text()).slice'), false);
  }
});

test('news functions fail closed and revalidate server-side fetch redirects', async () => {
  const ingest = await functionSource('news-ingest');
  const summarize = await functionSource('news-summarize');
  const config = await readFile(new URL('../../config.toml', import.meta.url), 'utf8');

  assert.match(ingest, /requireSharedSecret\(req, 'x-news-ingest-secret'/);
  assert.match(ingest, /fetchSafeExternalHttp\(url/);
  assert.match(summarize, /await requirePrincipal\(req/);
  assert.match(summarize, /fetchSafeExternalHttp\(url/);
  assert.match(config, /\[functions\.news-summarize\]\s+verify_jwt\s*=\s*true/);
});
