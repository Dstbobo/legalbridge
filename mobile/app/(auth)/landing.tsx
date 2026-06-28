import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { LegalBridgeLogo } from '@/components/brand/LegalBridgeLogo';
import { signInWithGoogle, AuthCancelled, getLastAuthMethod } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';
import type { UserRole } from '@/constants/roles';

const PHRASES = [
  'Your AI-powered Nigerian legal assistant',
  'Draft documents in seconds — not hours',
  'Know your rights under Nigerian law',
  'Professional legal help, accessible to all',
];

const BG_START: [string, string][] = [
  ['#0d1b3e', '#1a3a6e'],
  ['#0a1628', '#163060'],
  ['#0d1b3e', '#112247'],
  ['#071024', '#1a3a6e'],
];

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setAuth, completeOnboarding } = useAuthStore();

  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastGoogle, setLastGoogle] = useState(false);

  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    getLastAuthMethod().then((m) => setLastGoogle(m === 'google'));
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setIdx((i) => (i + 1) % PHRASES.length);
        Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
      });
    }, 4500);
    return () => clearInterval(t);
  }, [fade]);

  async function handleGoogle() {
    setErr(null);
    setBusy(true);
    try {
      const { user, token, onboarded } = await signInWithGoogle();
      await setAuth(
        { id: user.id, email: user.email, role: user.role as UserRole, fullName: user.fullName },
        token,
      );
      if (onboarded) {
        await completeOnboarding();
        router.replace('/(main)/chat');
      } else {
        router.replace('/(auth)/onboarding-role');
      }
    } catch (e: any) {
      if (e instanceof AuthCancelled) return;
      setErr(e.message ?? 'Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <LinearGradient
      colors={[BG_START[idx][0], BG_START[idx][1]]}
      style={styles.gradient}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <LegalBridgeLogo size="lg" dark />
          <Text style={styles.tagline}>Bridging Nigerians to Justice</Text>
        </View>

        {/* Cycling phrase */}
        <Animated.Text style={[styles.phrase, { opacity: fade }]}>
          {PHRASES[idx]}
        </Animated.Text>

        {/* Feature pills */}
        <View style={styles.pills}>
          {['Draft legal documents', 'Know your rights', 'Find a lawyer', 'Ask any legal question'].map((f) => (
            <View key={f} style={styles.pill}>
              <Text style={styles.pillText}>{f}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <View style={styles.cta}>
          {err && <Text style={styles.errText}>{err}</Text>}

          <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle} disabled={busy} activeOpacity={0.85}>
            {busy ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleLabel}>
                  {lastGoogle ? 'Continue with Google' : 'Continue with Google'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.emailBtn} onPress={() => router.push('/(auth)/login')} activeOpacity={0.85}>
            <Text style={styles.emailLabel}>Sign in with Email</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.registerLink}>
            <Text style={styles.registerText}>
              New to LegalBridge? <Text style={styles.registerHighlight}>Create account</Text>
            </Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => router.push('/(legal)/terms')}>Terms</Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={() => router.push('/(legal)/privacy')}>Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  logoWrap: { alignItems: 'center', marginBottom: 16 },
  tagline: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6, letterSpacing: 0.3 },
  phrase: {
    fontSize: 20, fontWeight: '600', color: '#ffffff',
    textAlign: 'center', lineHeight: 28, marginVertical: 24,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 32 },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  pillText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  cta: { gap: 12 },
  errText: {
    color: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.12)',
    borderRadius: 10, padding: 12, fontSize: 13.5, textAlign: 'center',
  },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderRadius: 14, paddingVertical: 15, gap: 10,
  },
  googleIcon: { fontSize: 17, fontWeight: '700', color: '#4285F4' },
  googleLabel: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  emailBtn: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },
  emailLabel: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  registerLink: { alignItems: 'center', paddingVertical: 6 },
  registerText: { color: 'rgba(255,255,255,0.65)', fontSize: 14 },
  registerHighlight: { color: COLORS.accent, fontWeight: '700' },
  legal: { color: 'rgba(255,255,255,0.4)', fontSize: 11.5, textAlign: 'center', lineHeight: 17 },
  legalLink: { color: 'rgba(255,255,255,0.65)', textDecorationLine: 'underline' },
});
