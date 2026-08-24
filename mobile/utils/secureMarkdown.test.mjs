import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_MARKDOWN_CHARS,
  MAX_MARKDOWN_LINE_CHARS,
  MAX_MARKDOWN_LINES,
  constrainMarkdownForDisplay,
  isSafeMarkdownLink,
} from './secureMarkdown.ts';

test('caps oversized markdown before parsing', () => {
  const hostile = `mailto:${'a'.repeat(MAX_MARKDOWN_CHARS * 4)}`;
  const constrained = constrainMarkdownForDisplay(hostile);

  assert.ok(constrained.length <= MAX_MARKDOWN_CHARS + MAX_MARKDOWN_LINES);
  assert.ok(Math.max(...constrained.split('\n').map((line) => line.length)) <= MAX_MARKDOWN_LINE_CHARS);
});

test('caps excessive line complexity', () => {
  const hostile = Array.from({ length: MAX_MARKDOWN_LINES * 3 }, (_, index) => `[${index}](mailto:x)`).join('\n');
  const constrained = constrainMarkdownForDisplay(hostile);

  assert.ok(constrained.split('\n').length <= MAX_MARKDOWN_LINES);
});

test('allows only bounded HTTPS links', () => {
  assert.equal(isSafeMarkdownLink('https://example.com/legal-source'), true);
  assert.equal(isSafeMarkdownLink('http://example.com'), false);
  assert.equal(isSafeMarkdownLink('mailto:person@example.com'), false);
  assert.equal(isSafeMarkdownLink('javascript:alert(1)'), false);
  assert.equal(isSafeMarkdownLink(`https://example.com/${'a'.repeat(2_048)}`), false);
});
