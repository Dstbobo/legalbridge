import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SECURE_CHUNK_CODEPOINTS, splitSecurePayload } from '../../../mobile/utils/secureChunks.ts';

test('secure document chunks stay below the historical native payload limit', () => {
  const value = `${'A'.repeat(2000)}${'😀'.repeat(1000)}`;
  const chunks = splitSecurePayload(value);
  assert.equal(chunks.join(''), value);
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= SECURE_CHUNK_CODEPOINTS));
  assert.ok(chunks.every((chunk) => new TextEncoder().encode(chunk).byteLength <= 1400));
});

test('legal chats never write transcripts or titles to plaintext storage', async () => {
  const source = await readFile(
    new URL('../../../mobile/app/(main)/chat.tsx', import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('AsyncStorage.setItem'), false);
  assert.match(source, /AsyncStorage\.multiRemove\(sensitiveKeys\)/);
  assert.match(source, /recentMessagesRef\.current\.set/);
});

test('saved legal documents are encrypted, chunked, and account-scoped', async () => {
  const source = await readFile(
    new URL('../../../mobile/stores/documents.store.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /SecureStore\.setItemAsync/);
  assert.match(source, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  assert.match(source, /`lb\.saved_documents\.\$\{userId\}/);
  assert.match(source, /splitSecurePayload\(JSON\.stringify\(document\)\)/);
  assert.equal(source.includes('AsyncStorage.setItem'), false);
  assert.match(source, /AsyncStorage\.removeItem\(LEGACY_STORAGE_KEY\)/);
});

test('mobile provider calls fail closed instead of using the anonymous key', async () => {
  const source = await readFile(
    new URL('../../../mobile/services/chat.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /Sign in is required to use LegalBridge AI services/);
  assert.equal(source.includes('return SUPABASE_ANON_KEY'), false);
});
