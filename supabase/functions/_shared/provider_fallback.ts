export type ProviderFallbackResult = 'completed' | 'partial' | 'fallback';

/**
 * Try another provider only while no output has reached the caller. Once a
 * stream is visible, switching models would append a second answer and corrupt
 * the response, so a partial response is closed without fallback text.
 */
export async function runProviderFallback(options: {
  providers: Array<() => Promise<boolean>>;
  hasOutput: () => boolean;
  emitFallback: () => Promise<unknown>;
  onProviderError?: (providerIndex: number, error: unknown) => void;
}): Promise<ProviderFallbackResult> {
  for (let index = 0; index < options.providers.length; index += 1) {
    try {
      if (await options.providers[index]()) return 'completed';
    } catch (error) {
      options.onProviderError?.(index, error);
    }
    if (options.hasOutput()) return 'partial';
  }

  await options.emitFallback();
  return 'fallback';
}
