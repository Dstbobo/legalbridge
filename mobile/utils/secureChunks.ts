// SecureStore can reject large values on some native platforms. Keep every
// encrypted value comfortably below the historical ~2 KB iOS threshold.
export const SECURE_CHUNK_CODEPOINTS = 350;

export function splitSecurePayload(value: string): string[] {
  const points = Array.from(value);
  const chunks: string[] = [];
  for (let index = 0; index < points.length; index += SECURE_CHUNK_CODEPOINTS) {
    chunks.push(points.slice(index, index + SECURE_CHUNK_CODEPOINTS).join(''));
  }
  return chunks.length > 0 ? chunks : [''];
}
