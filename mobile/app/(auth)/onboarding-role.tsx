import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { ALL_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

const ROLE_META: Record<UserRole, { icon: string; color: string; tags: string[] }> = {
  legal_professional: {
    icon: 'scale-balance',
    color: COLORS.primary,
    tags: ['Lawyers', 'Law Students'],
  },
  general_user: {
    icon: 'account-group-outline',
    color: '#2e7d32',
    tags: ['Individuals', 'Businesses', 'Journalists', 'Others'],
  },
};

export default function OnboardingRoleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updateProfile, completeOnboarding } = useAuthStore();
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!selected) return;
    setSaving(true);
    try { await api.patch('/api/v1/profile', { role: selected }); } catch {}
    await updateProfile({ role: selected });
    await completeOnboarding();
    setSaving(false);
    router.replace('/(main)/chat');
  }

  async function handleSkip() {
    setSaving(true);
    try { await api.patch('/api/v1/profile', { role: 'general_user' }); } catch {}
    await updateProfile({ role: 'general_user' });
    await completeOnboarding();
    setSaving(false);
    router.replace('/(main)/chat');
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 32 }]}>
      <View style={styles.header}>
        <View style={styles.lbMark}>
          <Text style={styles.lbText}>LB</Text>
        </View>
        <Text style={styles.title}>Who are you?</Text>
        <Text style={styles.subtitle}>
          Choose the category that best describes you. This shapes your experience on LegalBridge.
        </Text>
      </View>

      <View style={styles.cards}>
        {ALL_ROLES.map((role) => {
          const meta = ROLE_META[role];
          const active = selected === role;
          return (
            <TouchableOpacity
              key={role}
              style={[styles.card, active && { borderColor: meta.color, backgroundColor: `${meta.color}10` }]}
              onPress={() => setSelected(role)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconWrap, { backgroundColor: active ? meta.color : COLORS.secondary }]}>
                <MaterialCommunityIcons name={meta.icon as any} size={28} color={active ? '#fff' : meta.color} />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <Text style={[styles.roleLabel, active && { color: meta.color }]}>{ROLE_LABELS[role]}</Text>
                  {active && <MaterialCommunityIcons name="check-circle" size={20} color={meta.color} />}
                </View>
                <Text style={styles.roleDesc}>{ROLE_DESCRIPTIONS[role]}</Text>
                <View style={styles.tags}>
                  {meta.tags.map((t) => (
                    <View key={t} style={[styles.tag, active && { borderColor: meta.color }]}>
                      <Text style={[styles.tagText, active && { color: meta.color }]}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          mode="contained"
          onPress={handleContinue}
          disabled={!selected || saving}
          loading={saving}
          style={styles.continueBtn}
          contentStyle={{ paddingVertical: 6 }}
        >
          Continue
        </Button>
        <TouchableOpacity onPress={handleSkip} disabled={saving} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 20 },
  header: { alignItems: 'center', marginBottom: 32 },
  lbMark: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  lbText: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  cards: { gap: 14, flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: COLORS.surface, borderRadius: 18,
    borderWidth: 1.5, borderColor: COLORS.border, padding: 18,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  roleLabel: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  roleDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  tagText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  footer: { paddingTop: 20 },
  continueBtn: { borderRadius: 12, marginBottom: 4 },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
});
