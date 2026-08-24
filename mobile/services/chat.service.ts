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
  throw new Error('Sign in is required to use LegalBridge AI services.');
}

export async function streamChat(
  message: string,
  chatId: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  opts?: { language?: string },
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
      body: JSON.stringify({ message, chatId, language: opts?.language ?? 'en' }),
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
  opts?: { userType?: string; language?: string; history?: { role: 'user' | 'assistant'; content: string }[] },
): Promise<void> {
  const token = await getAuthToken();
  // Route through the same Supabase infra as chat (chat-documents Edge Function)
  // — the api.legalbridge.ng/v1/documents path was failing in-app.
  const url = `${SUPABASE_URL}/functions/v1/chat-documents`;

  // chat-documents expects a `messages` array (it reads the LAST message's content),
  // not a single `message` string.
  const messages = [
    ...(opts?.history ?? []),
    { role: 'user' as const, content: message },
  ];

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages, userType: opts?.userType ?? 'other', summary: '', profile: {}, language: opts?.language ?? 'en' }),
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

export interface Attachment { data: string; mimeType: string }

/** Analyse images and/or PDF documents via the chat-tools vision endpoint. */
export async function streamVision(
  question: string,
  attachments: { images?: Attachment[]; documents?: Attachment[] },
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  opts?: { userType?: string; language?: string },
): Promise<void> {
  const token = await getAuthToken();
  const url = `${SUPABASE_URL}/functions/v1/chat-tools`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        tool: 'vision',
        messages: [{ role: 'user', content: question }],
        images: attachments.images ?? [],
        documents: attachments.documents ?? [],
        userType: opts?.userType ?? 'other',
        language: opts?.language ?? 'en',
      }),
      signal,
    });
  } catch (e: any) {
    throw new Error(`Network error: ${e?.message ?? e}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`vision ${response.status}: ${text.slice(0, 300)}`);
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
