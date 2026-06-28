import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { ROLE_LABELS, type UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT Abuja','Gombe',
  'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos',
  'Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
  'Taraba','Yobe','Zamfara',
];

export default function OnboardingDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role: string }>();
  const { updateProfile, completeOnboarding } = useAuthStore();

  const [state, setState] = useState('');
  const [barNumber, setBarNumber] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [institution, setInstitution] = useState('');
  const [saving, setSaving] = useState(false);

  const isLawyer = role === 'lawyer';
  const isStudent = role === 'student';

  async function handleFinish() {
    setSaving(true);
    const profilePatch: Record<string, string> = { state };
    if (isLawyer && barNumber.trim()) profilePatch.barNumber = barNumber.trim();
    if (isLawyer && yearsExperience.trim()) profilePatch.yearsExperience = yearsExperience.trim();
    if (isStudent && institution.trim()) profilePatch.institution = institution.trim();

    try {
      await api.patch('/api/v1/profile', profilePatch);
    } catch {}
    await updateProfile({ state, ...(isLawyer && barNumber ? { barNumber } : {}) });
    await completeOnboarding();
    setSaving(false);
    router.replace('/(main)/chat');
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.root, { paddingTop: insets.top + 20 }]}>
        <View style={styles.header}>
          <Text style={styles.step}>Step 2 of 2</Text>
          <Text style={styles.title}>A few more details</Text>
          <Text style={styles.subtitle}>
            {role ? `Setting up your ${ROLE_LABELS[role as UserRole]} profile` : 'Almost there'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Your Nigerian State</Text>
          <TextInput
            label="State (e.g. Lagos, Abuja)"
            value={state}
            onChangeText={setState}
            mode="outlined"
            style={styles.input}
            placeholder="Lagos"
          />
          <Text style={styles.fieldHint}>Used to apply state-specific laws in your documents.</Text>

          {isLawyer && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Bar Details (optional)</Text>
              <TextInput
                label="NBA Enrollment Number"
                value={barNumber}
                onChangeText={setBarNumber}
                mode="outlined"
                style={styles.input}
                placeholder="e.g. NBA/2015/12345"
              />
              <TextInput
                label="Years in Practice"
                value={yearsExperience}
                onChangeText={setYearsExperience}
                mode="outlined"
                style={styles.input}
                keyboardType="number-pad"
                placeholder="e.g. 5"
              />
            </>
          )}

          {isStudent && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Law School / University (optional)</Text>
              <TextInput
                label="Institution"
                value={institution}
                onChangeText={setInstitution}
                mode="outlined"
                style={styles.input}
                placeholder="e.g. University of Lagos"
              />
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Button
            mode="contained"
            onPress={handleFinish}
            loading={saving}
            disabled={saving}
            style={styles.btn}
            contentStyle={{ paddingVertical: 6 }}
          >
            Finish Setup
          </Button>
          <Button mode="text" onPress={handleFinish} disabled={saving} style={{ marginTop: 4 }}>
            Skip
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 22, marginBottom: 16 },
  step: { fontSize: 13, color: COLORS.primary, fontWeight: '700', marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20 },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  fieldLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  fieldHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: -4, marginBottom: 8 },
  input: { marginBottom: 12 },
  footer: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  btn: { borderRadius: 12 },
});
