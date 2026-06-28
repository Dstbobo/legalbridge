import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { signIn, setLastAuthMethod } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';
import { LegalBridgeLogo } from '@/components/brand/LegalBridgeLogo';
import type { UserRole } from '@/constants/roles';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const router = useRouter();

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { user, token } = await signIn(email.trim(), password);
      await setAuth(
        { id: user.id, email: user.email, role: user.role as UserRole, fullName: user.fullName },
        token,
      );
      // AuthGuard will redirect to onboarding or chat
    } catch (e: any) {
      setError(e.message ?? 'Sign in failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <LegalBridgeLogo size="lg" />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            mode="outlined"
            style={styles.input}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword((v) => !v)}
              />
            }
          />
          {!!error && <HelperText type="error">{error}</HelperText>}

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Sign In
          </Button>

          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.link}>
            <Text style={styles.linkText}>
              No account? <Text style={{ color: COLORS.primary, fontWeight: '700' }}>Create one</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.link}>
            <Text style={styles.linkText}>← Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 36 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  form: { gap: 4 },
  input: { marginBottom: 8 },
  button: { marginTop: 12, borderRadius: 8 },
  buttonContent: { paddingVertical: 6 },
  link: { alignItems: 'center', paddingVertical: 10 },
  linkText: { fontSize: 14, color: COLORS.textSecondary },
});
