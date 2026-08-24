import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CORE_MIGRATION = new URL(
  '../../migrations/20260703100000_core_schema.sql',
  import.meta.url,
);
const MIGRATION = new URL(
  '../../migrations/20260818110000_conversation_certificate_boundaries.sql',
  import.meta.url,
);

test('core production dependencies are tracked before feature migrations', async () => {
  const sql = await readFile(CORE_MIGRATION, 'utf8');
  for (const table of [
    'profiles',
    'chats',
    'messages',
    'document_templates',
    'legal_documents',
    'generated_documents',
    'conversations',
    'direct_messages',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(sql, /create or replace function public\.search_legal_documents/);
  assert.match(sql, /drop policy if exists "Users can view own profile"/);
  assert.equal(sql.includes('to public using (true)'), false);
});
const AUTHORITY_MIGRATION = new URL(
  '../../migrations/20260818111000_service_role_profile_boundaries.sql',
  import.meta.url,
);

test('conversation participants are immutable and cross-user policies remain explicit', async () => {
  const sql = await readFile(MIGRATION, 'utf8');
  assert.match(sql, /new\.client_id is distinct from old\.client_id/);
  assert.match(sql, /new\.lawyer_id is distinct from old\.lawyer_id/);
  assert.match(sql, /new\.user_a is distinct from old\.user_a/);
  assert.match(sql, /new\.user_b is distinct from old\.user_b/);
  assert.match(sql, /before insert or update on public\.conversations/);
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

test('public cannot impersonate the service role or escalate profile authority', async () => {
  const sql = await readFile(AUTHORITY_MIGRATION, 'utf8');
  assert.match(sql, /drop policy if exists "Service role full access"/);
  assert.match(sql, /from anon, authenticated/);
  assert.match(sql, /revoke all on function public\.news_prune\(\)/);
  assert.match(sql, /new\.plan is distinct from old\.plan/);
  assert.match(sql, /new\.user_type is distinct from old\.user_type/);
  assert.match(sql, /verification decision requires server authorization/);
});

test('legacy direct messages keep immutable identity and content', async () => {
  const sql = await readFile(AUTHORITY_MIGRATION, 'utf8');
  assert.match(sql, /new\.conversation_id is distinct from old\.conversation_id/);
  assert.match(sql, /new\.sender_id is distinct from old\.sender_id/);
  assert.match(sql, /new\.body is distinct from old\.body/);
});

test('private application tables have explicit authenticated grants', async () => {
  const source = await readFile(
    new URL('../../migrations/20260818112000_application_role_grants.sql', import.meta.url),
    'utf8',
  );
  assert.match(source, /revoke all on table[\s\S]*public\.conversations[\s\S]*from public, anon/);
  assert.match(source, /grant select, insert, update on table public\.conversations to authenticated/);
  assert.match(source, /grant select, insert on table public\.chat_messages to authenticated/);
  assert.match(source, /grant select, insert, update on table public\.lawyer_verifications to authenticated/);
  assert.match(source, /grant select, insert, update on table public\.profiles to authenticated/);
  assert.equal(/grant\s+all/i.test(source), false);
});
