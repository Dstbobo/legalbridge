import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MIGRATION = new URL(
  '../../migrations/20260818110000_conversation_certificate_boundaries.sql',
  import.meta.url,
);

test('conversation participants are immutable and cross-user policies remain explicit', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  assert.match(sql, /new\.client_id is distinct from old\.client_id/);
  assert.match(sql, /new\.lawyer_id is distinct from old\.lawyer_id/);
  assert.match(sql, /raise exception 'conversation participants cannot be reassigned'/);
  assert.match(sql, /auth\.uid\(\) in \(client_id, lawyer_id\)/);
  assert.match(sql, /client_id <> lawyer_id/);
});

test('certificate metadata and object policies expose owner paths only', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  assert.match(sql, /drop policy if exists "read verified lawyers"/);
  assert.match(sql, /set public = false/);
  assert.match(sql, /for insert to authenticated[\s\S]*storage\.foldername\(name\)/);
  assert.match(sql, /for update to authenticated[\s\S]*with check/);
  assert.match(sql, /for delete to authenticated/);
  assert.match(sql, /storage\.foldername\(cert_path\)/);
});

test('mobile directory lookup does not select private verification rows', async () => {
  const source = await readFile(
    new URL('../../../mobile/services/lawyers.service.ts', import.meta.url),
    'utf8',
  );
  const publicLookup = source.slice(source.indexOf('export async function listVerifiedLawyers'));
  assert.equal(publicLookup.includes(".from('lawyer_verifications')"), false);
  assert.match(publicLookup, /rpc\('list_lawyer_directory'\)/);
});
