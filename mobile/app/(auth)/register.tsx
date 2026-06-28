import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { signUp } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';
import { LegalBridgeLogo } from '@/components/brand/LegalBridgeLogo';
import type { UserRole } from '@/constants/roles';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const router = useRouter();

  async function handleRegister() {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError('All fields are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { user, token } = await signUp(email.trim(), password, fullName.trim());
      await setAuth(
        { id: user.id, email: user.email, role: user.role as UserRole, fullName: user.fullName },
        token,
      );
      router.replace('/(auth)/onboarding-role');
    } catch (e: any) {
      if (e.message?.toLowerCase().includes('email not confirmed')) {
        setError('Please disable "Confirm email" in your Supabase project settings, then try again.');
      } else {
        setError(e.message ?? 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <LegalBridgeLogo size="lg" />
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Free access to Nigerian legal help</Text>
        </View>

        <View style={styles.form}>
          <TextInput label="Full Name" value={fullName} onChangeText={setFullName} mode="outlined" style={styles.input} autoCapitalize="words" autoComplete="name" />
          <TextInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" mode="outlined" style={styles.input} />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            mode="outlined"
            style={styles.input}
            right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword((v) => !v)} />}
          />
          <TextInput label="Confirm Password" value={confirmPassword} onChangeText={setConfirm} secureTextEntry mode="outlined" style={styles.input} />

          {!!error && <HelperText type="error" style={styles.errorText}>{error}</HelperText>}

          <Button mode="contained" onPress={handleRegister} loading={loading} disabled={loading} style={styles.button} contentStyle={styles.buttonContent}>
            Create Account
          </Button>

          <TouchableOpacity onPress={() => router.back()} style={styles.link}>
            <Text style={styles.linkText}>Already have an account? <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Sign In</Text></Text>
          </TouchableOpacity>

          <Text style={styles.consent}>
            By creating an account you agree to our{' '}
            <Text style={styles.consentLink} onPress={() => router.push('/(legal)/terms')}>Terms</Text>
            {' '}and{' '}
            <Text style={styles.consentLink} onPress={() => router.push('/(legal)/privacy')}>Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  form: { gap: 4 },
  input: { marginBottom: 8 },
  errorText: { lineHeight: 18 },
  button: { marginTop: 12, borderRadius: 8 },
  buttonContent: { paddingVertical: 6 },
  link: { alignItems: 'center', paddingVertical: 10 },
  linkText: { fontSize: 14, color: COLORS.textSecondary },
  consent: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  consentLink: { color: COLORS.primary, fontWeight: '600' },
});
