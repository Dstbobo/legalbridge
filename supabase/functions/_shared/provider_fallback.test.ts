import assert from 'node:assert/strict';
import test from 'node:test';

import { runProviderFallback } from './provider_fallback.ts';

test('provider failure before output advances to one healthy fallback', async () => {
  let outputStarted = false;
  let secondCalls = 0;
  let fallbackCalls = 0;
  const result = await runProviderFallback({
    providers: [
      async () => { throw new Error('first unavailable'); },
      async () => { secondCalls += 1; outputStarted = true; return true; },
    ],
    hasOutput: () => outputStarted,
    emitFallback: async () => { fallbackCalls += 1; },
  });

  assert.equal(result, 'completed');
  assert.equal(secondCalls, 1);
  assert.equal(fallbackCalls, 0);
});

test('provider failure after partial output never appends another answer', async () => {
  let outputStarted = false;
  let secondCalls = 0;
  let fallbackCalls = 0;
  const result = await runProviderFallback({
    providers: [
      async () => { outputStarted = true; throw new Error('stream interrupted'); },
      async () => { secondCalls += 1; return true; },
    ],
    hasOutput: () => outputStarted,
    emitFallback: async () => { fallbackCalls += 1; },
  });

  assert.equal(result, 'partial');
  assert.equal(secondCalls, 0);
  assert.equal(fallbackCalls, 0);
});

test('all failures before output emit exactly one safe fallback', async () => {
  let fallbackCalls = 0;
  const result = await runProviderFallback({
    providers: [async () => false, async () => { throw new Error('down'); }],
    hasOutput: () => false,
    emitFallback: async () => { fallbackCalls += 1; },
  });

  assert.equal(result, 'fallback');
  assert.equal(fallbackCalls, 1);
});
