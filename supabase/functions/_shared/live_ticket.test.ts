import assert from 'node:assert/strict';
import test from 'node:test';

import { SecurityError } from './security.ts';
import { issueLiveTicket, verifyLiveTicket } from './live_ticket.ts';

const SECRET = 'test-only-live-ticket-secret-at-least-32-bytes';

test('live ticket binds the verified user and expires quickly', async () => {
  const ticket = await issueLiveTicket('verified-user-id', SECRET, { nowSeconds: 100, ttlSeconds: 60 });
  const result = await verifyLiveTicket(ticket, SECRET, { nowSeconds: 120 });
  assert.deepEqual(result, { userId: 'verified-user-id', expiresAt: 160 });
});

test('expired live tickets fail closed', async () => {
  const ticket = await issueLiveTicket('verified-user-id', SECRET, { nowSeconds: 100, ttlSeconds: 30 });
  await assert.rejects(
    verifyLiveTicket(ticket, SECRET, { nowSeconds: 130 }),
    (error: unknown) => error instanceof SecurityError && error.status === 401,
  );
});

test('tampered live tickets fail closed', async () => {
  const ticket = await issueLiveTicket('verified-user-id', SECRET, { nowSeconds: 100 });
  const [payload, signature] = ticket.split('.');
  const changed = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}.${signature}`;
  await assert.rejects(
    verifyLiveTicket(changed, SECRET, { nowSeconds: 110 }),
    (error: unknown) => error instanceof SecurityError && error.code === 'invalid_live_ticket',
  );
});

test('weak or missing ticket secrets fail closed', async () => {
  await assert.rejects(
    issueLiveTicket('verified-user-id', 'short', { nowSeconds: 100 }),
    (error: unknown) => error instanceof SecurityError && error.status === 503,
  );
});
