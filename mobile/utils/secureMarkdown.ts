export const MAX_MARKDOWN_CHARS = 32_000;
export const MAX_MARKDOWN_LINES = 600;
export const MAX_MARKDOWN_LINE_CHARS = 2_000;

/**
 * Bound untrusted/provider-authored markdown before it reaches markdown-it.
 * The single pass is deliberately linear and avoids regex work on hostile input.
 */
export function constrainMarkdownForDisplay(value: string): string {
  const source = value.slice(0, MAX_MARKDOWN_CHARS);
  let result = '';
  let lineCount = 1;
  let lineLength = 0;

  for (const character of source) {
    if (character === '\n') {
      if (lineCount >= MAX_MARKDOWN_LINES) {
        result += ' ';
        lineLength += 1;
        continue;
      }
      result += character;
      lineCount += 1;
      lineLength = 0;
      continue;
    }

    if (lineLength >= MAX_MARKDOWN_LINE_CHARS) {
      if (lineCount < MAX_MARKDOWN_LINES) {
        result += '\n';
        lineCount += 1;
        lineLength = 0;
      } else {
        continue;
      }
    }

    result += character;
    lineLength += 1;
  }

  return result;
}

export function isSafeMarkdownLink(value: string): boolean {
  if (!value || value.length > 2_048 || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  return value.toLowerCase().startsWith('https://');
}
