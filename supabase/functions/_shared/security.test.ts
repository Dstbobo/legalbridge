import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SecurityError,
  constantTimeEqual,
  readJsonBody,
  requireAdminPrincipal,
  requirePrincipal,
  securityErrorResponse,
} from './security.ts';

const OPTIONS = {
  supabaseUrl: 'https://example.supabase.co',
  anonKey: 'public-anon-key',
};

test('constant-time comparison accepts only identical values', () => {
  assert.equal(constantTimeEqual('same', 'same'), true);
  assert.equal(constantTimeEqual('same', 'diff'), false);
  assert.equal(constantTimeEqual('same', 'same-longer'), false);
});

test('missing authorization fails closed', async () => {
  await assert.rejects(
    requirePrincipal(new Request('https://function.test'), OPTIONS),
    (error: unknown) => error instanceof SecurityError && error.status === 401,
  );
});

test('invalid JWT response fails closed', async () => {
  await assert.rejects(
    requirePrincipal(
      new Request('https://function.test', { headers: { authorization: 'Bearer invalid' } }),
      { ...OPTIONS, fetchImpl: async () => new Response('{}', { status: 401 }) },
    ),
    (error: unknown) => error instanceof SecurityError && error.code === 'unauthorized',
  );
});

test('verified user identity comes from Supabase, not caller payload', async () => {
  const req = new Request('https://function.test', {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'spoofed-user' }),
  });
  const principal = await requirePrincipal(req, {
    ...OPTIONS,
    fetchImpl: async () => Response.json({
      id: 'verified-user',
      role: 'authenticated',
      email: 'verified@example.test',
      app_metadata: { role: 'lawyer' },
    }),
  });
  assert.equal(principal.id, 'verified-user');
});

test('service role is accepted only on explicitly internal paths', async () => {
  const req = new Request('https://function.test', {
    headers: { authorization: 'Bearer internal-service-secret' },
  });
  const principal = await requirePrincipal(req, {
    ...OPTIONS,
    allowServiceRole: true,
    serviceRoleKey: 'internal-service-secret',
  });
  assert.equal(principal.kind, 'service');
});

test('admin authorization trusts app metadata, never user metadata', async () => {
  const req = new Request('https://function.test', {
    headers: { authorization: 'Bearer valid-user' },
  });
  await assert.rejects(
    requireAdminPrincipal(req, {
      ...OPTIONS,
      fetchImpl: async () => Response.json({
        id: 'ordinary-user',
        role: 'authenticated',
        app_metadata: { role: 'lawyer' },
        user_metadata: { role: 'admin' },
      }),
    }),
    (error: unknown) => error instanceof SecurityError && error.status === 403,
  );
});

test('admin app metadata grants explicit privileged access', async () => {
  const req = new Request('https://function.test', {
    headers: { authorization: 'Bearer valid-admin' },
  });
  const principal = await requireAdminPrincipal(req, {
    ...OPTIONS,
    fetchImpl: async () => Response.json({
      id: 'admin-user',
      role: 'authenticated',
      app_metadata: { roles: ['legalbridge_admin'] },
    }),
  });
  assert.equal(principal.id, 'admin-user');
});

test('oversized JSON bodies are rejected before parsing', async () => {
  const req = new Request('https://function.test', {
    method: 'POST',
    body: JSON.stringify({ text: 'x'.repeat(64) }),
  });
  await assert.rejects(
    readJsonBody(req, 16),
    (error: unknown) => error instanceof SecurityError && error.status === 413,
  );
});

test('security responses never echo exception messages or secrets', () => {
  const response = securityErrorResponse(new Error('provider-key-secret'));
  assert.equal(response.status, 500);
  return response.text().then((body) => {
    assert.equal(body, JSON.stringify({ error: 'internal_error' }));
    assert.equal(body.includes('provider-key-secret'), false);
  });
});
