import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './auth.service';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.legalbridge.ng';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

async function currentAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  } catch {}
  return SecureStore.getItemAsync('lb_auth_token');
}

api.interceptors.request.use(async (config) => {
  const token = await currentAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    if (status === 401 && !error.config?._retried) {
      try {
        const { data, error: refErr } = await supabase.auth.refreshSession();
        if (!refErr && data.session?.access_token) {
          error.config._retried = true;
          error.config.headers.Authorization = `Bearer ${data.session.access_token}`;
          return api.request(error.config);
        }
      } catch {}
      await SecureStore.deleteItemAsync('lb_auth_token');
      await SecureStore.deleteItemAsync('lb_user');
    }
    return Promise.reject(error);
  },
);
