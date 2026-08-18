import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FUNCTION_NAMES = ['chat-stream', 'chat-documents', 'chat-tools'] as const;

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
