import { supabase } from './auth.service';

export interface MentorProfile {
  user_id: string;
  full_name: string;
  focus_areas: string[];
  bio: string | null;
  capacity: number;
  is_active: boolean;
}

export interface MentorshipRequest {
  id: string;
  student_id: string;
  mentor_id: string;
  student_name: string;
  message: string;
  status: 'pending' | 'accepted' | 'declined';
  mentor_note: string | null;
  created_at: string;
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (!id) throw new Error('You must be signed in.');
  return id;
}

// ── Mentor (lawyer) side ────────────────────────────────────────────────────
export async function getMyMentorProfile(): Promise<MentorProfile | null> {
  const id = await uid();
  const { data } = await supabase.from('mentor_profiles').select('*').eq('user_id', id).maybeSingle();
  return (data as MentorProfile) ?? null;
}

export async function saveMentorProfile(p: {
  fullName: string; focusAreas: string[]; bio?: string; capacity?: number; isActive: boolean;
}): Promise<void> {
  const id = await uid();
  const { error } = await supabase.from('mentor_profiles').upsert({
    user_id: id,
    full_name: p.fullName.trim(),
    focus_areas: p.focusAreas,
    bio: p.bio?.trim() || null,
    capacity: p.capacity ?? 3,
    is_active: p.isActive,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function incomingRequests(): Promise<MentorshipRequest[]> {
  const id = await uid();
  const { data, error } = await supabase
    .from('mentorship_requests').select('*')
    .eq('mentor_id', id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MentorshipRequest[];
}

export async function respondToRequest(requestId: string, accept: boolean, note?: string): Promise<void> {
  const { error } = await supabase
    .from('mentorship_requests')
    .update({ status: accept ? 'accepted' : 'declined', mentor_note: note?.trim() || null })
    .eq('id', requestId);
  if (error) throw new Error(error.message);
}

// ── Student side ────────────────────────────────────────────────────────────
export async function listActiveMentors(): Promise<MentorProfile[]> {
  const { data, error } = await supabase
    .from('mentor_profiles').select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MentorProfile[];
}

export async function requestMentorship(mentorId: string, studentName: string, message: string): Promise<void> {
  const id = await uid();
  const { error } = await supabase.from('mentorship_requests').insert({
    student_id: id,
    mentor_id: mentorId,
    student_name: studentName.trim() || 'Law student',
    message: message.trim(),
    status: 'pending',
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error('You have already sent a request to this mentor.');
    }
    throw new Error(error.message);
  }
}

export async function myRequests(): Promise<MentorshipRequest[]> {
  const id = await uid();
  const { data, error } = await supabase
    .from('mentorship_requests').select('*')
    .eq('student_id', id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MentorshipRequest[];
}
