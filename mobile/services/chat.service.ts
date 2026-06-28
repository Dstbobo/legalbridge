import { supabase } from './auth.service';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function getAuthToken(): Promise<string> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session?.access_token) return data.session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session?.access_token) return refreshed.session.access_token;
  } catch {}
  return SUPABASE_ANON_KEY;
}

export async function streamChat(
  message: string,
  chatId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getAuthToken();
  const url = `${SUPABASE_URL}/functions/v1/chat-stream`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ message, chatId }),
      signal,
    });
  } catch (e: any) {
    throw new Error(`Network error: ${e?.message ?? e}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`chat-stream ${response.status}: ${text.slice(0, 300)}`);
  }

  await _readSSE(response, onChunk);
}

export async function streamDocument(
  message: string,
  chatId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getAuthToken();
  // Route through the same Supabase infra as chat (chat-documents Edge Function)
  // — the api.legalbridge.ng/v1/documents path was failing in-app.
  const url = `${SUPABASE_URL}/functions/v1/chat-documents`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ message, chatId }),
      signal,
    });
  } catch (e: any) {
    throw new Error(`Network error: ${e?.message ?? e}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`documents ${response.status}: ${text.slice(0, 300)}`);
  }

  await _readSSE(response, onChunk);
}

async function _readSSE(response: Response, onChunk: (text: string) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body from server');
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;
      try {
        const parsed = JSON.parse(raw);
        const text = parsed.text ?? parsed.choices?.[0]?.delta?.content ?? '';
        if (text) onChunk(text);
      } catch {}
    }
  }
}
