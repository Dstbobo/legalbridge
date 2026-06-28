import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

WebBrowser.maybeCompleteAuthSession();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) => SecureStore.setItemAsync(key, value),
      removeItem: (key) => SecureStore.deleteItemAsync(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

const LAST_METHOD_KEY = 'lb_last_auth_method';

export async function setLastAuthMethod(method: 'google' | 'email') {
  try { await SecureStore.setItemAsync(LAST_METHOD_KEY, method); } catch {}
}
export async function getLastAuthMethod(): Promise<string | null> {
  try { return await SecureStore.getItemAsync(LAST_METHOD_KEY); } catch { return null; }
}

export class AuthCancelled extends Error {}

export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) throw new AuthCancelled('cancelled');

  const code = Linking.parse(result.url).queryParams?.code as string | undefined;
  if (!code) throw new Error('No authorization code returned from Google.');

  const { data: sess, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;

  const u = sess.user!;
  const onboarded = !!(u.user_metadata?.onboarded || u.app_metadata?.onboarded);
  await setLastAuthMethod('google');
  return {
    user: {
      id: u.id,
      email: u.email!,
      role: (u.app_metadata?.role ?? 'other') as string,
      fullName: (u.user_metadata?.full_name ?? u.user_metadata?.name ?? '') as string,
    },
    token: sess.session!.access_token,
    onboarded,
  };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const u = data.user!;
  await setLastAuthMethod('email');
  return {
    user: {
      id: u.id,
      email: u.email!,
      role: (u.app_metadata?.role ?? 'other') as string,
      fullName: (u.user_metadata?.full_name ?? '') as string,
    },
    token: data.session!.access_token,
  };
}

export async function signUp(email: string, password: string, fullName: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  // Sign in immediately (requires email confirmation disabled in Supabase)
  return signIn(email, password);
}

export async function markOnboardedOnServer() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  await supabase.auth.updateUser({ data: { onboarded: true } });
}
