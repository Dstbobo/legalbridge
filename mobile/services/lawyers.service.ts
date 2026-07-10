import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './auth.service';

export interface LawyerVerification {
  id: string;
  user_id: string;
  full_name: string;
  scn_number: string;
  year_of_call: number | null;
  state: string | null;
  firm: string | null;
  whatsapp: string | null;
  specializations: string[];
  bio: string | null;
  cert_path: string | null;
  status: 'pending' | 'verified' | 'rejected';
  admin_note: string | null;
  created_at: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    out[p++] = (a << 2) | (b >> 4);
    if (clean[i + 2] && clean[i + 2] !== '=') out[p++] = ((b & 15) << 4) | (c >> 2);
    if (clean[i + 3] && clean[i + 3] !== '=') out[p++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, p);
}

/** Upload the call-to-bar certificate photo to the private bucket. */
async function uploadCertificate(userId: string, localUri: string): Promise<string> {
  const b64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(b64);
  const path = `${userId}/certificate_${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('verification-docs')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Certificate upload failed: ${error.message}`);
  return path;
}

export interface VerificationSubmission {
  fullName: string;
  scnNumber: string;
  yearOfCall?: number | null;
  state?: string;
  firm?: string;
  whatsapp?: string;
  specializations: string[];
  bio?: string;
  certUri?: string | null; // local image uri of call-to-bar certificate
}

export async function submitVerification(sub: VerificationSubmission): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) throw new Error('You must be signed in.');

  let certPath: string | null = null;
  if (sub.certUri) certPath = await uploadCertificate(userId, sub.certUri);

  const row = {
    user_id: userId,
    full_name: sub.fullName.trim(),
    scn_number: sub.scnNumber.trim().toUpperCase(),
    year_of_call: sub.yearOfCall ?? null,
    state: sub.state?.trim() || null,
    firm: sub.firm?.trim() || null,
    whatsapp: sub.whatsapp?.trim() || null,
    specializations: sub.specializations,
    bio: sub.bio?.trim() || null,
    ...(certPath ? { cert_path: certPath } : {}),
    status: 'pending' as const,
    updated_at: new Date().toISOString(),
  };

  // Re-submissions (e.g. after rejection) update the existing row back to pending.
  const { data: existing } = await supabase
    .from('lawyer_verifications').select('id').eq('user_id', userId).maybeSingle();

  if (existing) {
    const { error } = await supabase.from('lawyer_verifications').update(row).eq('user_id', userId);
    if (error) throw new Error(friendly(error.message));
  } else {
    const { error } = await supabase.from('lawyer_verifications').insert(row);
    if (error) throw new Error(friendly(error.message));
  }
}

function friendly(msg: string): string {
  if (/scn_number/.test(msg) && /duplicate|unique/i.test(msg)) {
    return 'This SCN number is already registered to another account. If this is your number, contact support@legalbridge.ng.';
  }
  return msg;
}

export async function getMyVerification(): Promise<LawyerVerification | null> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return null;
  const { data } = await supabase
    .from('lawyer_verifications').select('*').eq('user_id', userId).maybeSingle();
  return (data as LawyerVerification) ?? null;
}

/** The public directory — verified lawyers only, enforced by RLS. */
export async function listVerifiedLawyers(): Promise<LawyerVerification[]> {
  const { data, error } = await supabase
    .from('lawyer_verifications')
    .select('id,user_id,full_name,scn_number,year_of_call,state,firm,whatsapp,specializations,bio,cert_path,status,admin_note,created_at')
    .eq('status', 'verified')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LawyerVerification[];
}
