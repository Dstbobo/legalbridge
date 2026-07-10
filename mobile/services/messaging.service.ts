import { supabase } from './auth.service';

export interface Conversation {
  id: string;
  client_id: string;
  lawyer_id: string;
  client_name: string;
  lawyer_name: string;
  last_message: string | null;
  last_sender: string | null;
  last_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface ReviewSummary { avg: number; count: number }

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (!id) throw new Error('You must be signed in.');
  return id;
}

// ── Conversations ───────────────────────────────────────────────────────────
/** Start (or reuse) the conversation between the current user and a lawyer. */
export async function getOrCreateConversation(
  lawyerUserId: string, lawyerName: string, clientName: string,
): Promise<Conversation> {
  const me = await uid();
  const { data: existing } = await supabase
    .from('conversations').select('*')
    .eq('client_id', me).eq('lawyer_id', lawyerUserId)
    .maybeSingle();
  if (existing) return existing as Conversation;

  const { data, error } = await supabase
    .from('conversations')
    .insert({ client_id: me, lawyer_id: lawyerUserId, client_name: clientName, lawyer_name: lawyerName })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Conversation;
}

export async function listConversations(): Promise<{ mine: Conversation[]; myId: string }> {
  const me = await uid();
  const { data, error } = await supabase
    .from('conversations').select('*')
    .or(`client_id.eq.${me},lawyer_id.eq.${me}`)
    .order('last_at', { ascending: false });
  if (error) throw new Error(error.message);
  return { mine: (data ?? []) as Conversation[], myId: me };
}

// ── Messages ────────────────────────────────────────────────────────────────
export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages').select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ChatMessage[];
}

export async function sendChatMessage(conversationId: string, content: string): Promise<void> {
  const me = await uid();
  const text = content.trim();
  if (!text) return;
  const { error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, sender_id: me, content: text });
  if (error) throw new Error(error.message);
  // Keep the conversation list fresh (last message preview + ordering).
  await supabase.from('conversations').update({
    last_message: text.slice(0, 140),
    last_sender: me,
    last_at: new Date().toISOString(),
  }).eq('id', conversationId);
}

// ── Reviews (lawyer credibility) ───────────────────────────────────────────
export async function submitReview(lawyerUserId: string, clientName: string, rating: number, comment?: string): Promise<void> {
  const me = await uid();
  const { error } = await supabase.from('lawyer_reviews').upsert({
    lawyer_id: lawyerUserId,
    client_id: me,
    client_name: clientName,
    rating,
    comment: comment?.trim() || null,
  }, { onConflict: 'client_id,lawyer_id' });
  if (error) throw new Error(error.message);
}

/** Average rating + count per lawyer, for the directory cards. */
export async function fetchReviewSummaries(lawyerUserIds: string[]): Promise<Map<string, ReviewSummary>> {
  const out = new Map<string, ReviewSummary>();
  if (!lawyerUserIds.length) return out;
  const { data } = await supabase
    .from('lawyer_reviews').select('lawyer_id,rating')
    .in('lawyer_id', lawyerUserIds);
  for (const r of (data ?? []) as { lawyer_id: string; rating: number }[]) {
    const cur = out.get(r.lawyer_id) ?? { avg: 0, count: 0 };
    cur.avg = (cur.avg * cur.count + r.rating) / (cur.count + 1);
    cur.count += 1;
    out.set(r.lawyer_id, cur);
  }
  return out;
}

export async function listReviews(lawyerUserId: string): Promise<{ client_name: string; rating: number; comment: string | null; created_at: string }[]> {
  const { data } = await supabase
    .from('lawyer_reviews')
    .select('client_name,rating,comment,created_at')
    .eq('lawyer_id', lawyerUserId)
    .order('created_at', { ascending: false })
    .limit(30);
  return data ?? [];
}
