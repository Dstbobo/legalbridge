import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';

const LB_LOGO = require('@/assets/logo.png');
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { type UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

type Step = 'category' | 'legal_sub';
type Category = 'legal' | 'general';

export default function OnboardingRoleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updateProfile, completeOnboarding } = useAuthStore();
  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<Category | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(r: UserRole) {
    setSaving(true);
    try { await api.patch('/api/v1/profile', { role: r }); } catch {}
    await updateProfile({ role: r });
    await completeOnboarding();
    setSaving(false);
    router.replace('/(main)/chat');
  }

  function pickCategory(cat: Category) {
    setCategory(cat);
    if (cat === 'general') {
      setRole('general_user');
    } else {
      setRole(null);
      setStep('legal_sub');
    }
  }

  // ── Step 1: Category ──────────────────────────────────────────────────
  if (step === 'category') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Image source={LB_LOGO} style={styles.lbLogoImg} resizeMode="contain" />
          <Text style={styles.title}>Who are you?</Text>
          <Text style={styles.subtitle}>
            Choose the category that best describes you. This shapes your experience on LegalBridge.
          </Text>
        </View>

        <View style={styles.cards}>
          <TouchableOpacity
            style={[styles.card, category === 'legal' && styles.cardActive]}
            onPress={() => pickCategory('legal')}
            activeOpacity={0.8}
          >
            <View style={[styles.iconWrap, category === 'legal' && styles.iconWrapActive]}>
              <MaterialCommunityIcons name="scale-balance" size={28} color={category === 'legal' ? '#fff' : COLORS.primary} />
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={[styles.roleLabel, category === 'legal' && { color: COLORS.primary }]}>Legal Professional</Text>
                {category === 'legal' && <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primary} />}
              </View>
              <Text style={styles.roleDesc}>Lawyers and law students — advanced legal tools, case research, and career tools.</Text>
              <View style={styles.tags}>
                {['Lawyers', 'Law Students'].map((t) => (
                  <View key={t} style={[styles.tag, category === 'legal' && styles.tagActive]}>
                    <Text style={[styles.tagText, category === 'legal' && { color: COLORS.primary }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, category === 'general' && styles.cardActiveGreen]}
            onPress={() => pickCategory('general')}
            activeOpacity={0.8}
          >
            <View style={[styles.iconWrap, category === 'general' && styles.iconWrapGreen]}>
              <MaterialCommunityIcons name="account-group-outline" size={28} color={category === 'general' ? '#fff' : '#2e7d32'} />
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={[styles.roleLabel, category === 'general' && { color: '#2e7d32' }]}>General User</Text>
                {category === 'general' && <MaterialCommunityIcons name="check-circle" size={20} color="#2e7d32" />}
              </View>
              <Text style={styles.roleDesc}>Individuals, businesses, journalists, and others seeking legal guidance.</Text>
              <View style={styles.tags}>
                {['Individuals', 'Businesses', 'Journalists', 'Others'].map((t) => (
                  <View key={t} style={[styles.tag, category === 'general' && styles.tagActiveGreen]}>
                    <Text style={[styles.tagText, category === 'general' && { color: '#2e7d32' }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={category === 'general' ? () => save('general_user') : () => setStep('legal_sub')}
            disabled={!category || saving}
            loading={saving}
            style={styles.continueBtn}
            contentStyle={{ paddingVertical: 6 }}
          >
            {category === 'legal' ? 'Continue' : 'Get Started'}
          </Button>
          <TouchableOpacity onPress={() => save('general_user')} disabled={saving} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Step 2: Legal sub-role ────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => { setStep('category'); setCategory(null); setRole(null); }}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <View style={styles.lbMark}><Text style={styles.lbText}>LB</Text></View>
        <Text style={styles.title}>Lawyer or law student?</Text>
        <Text style={styles.subtitle}>Your navigation and tools will be tailored to your role.</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity
          style={[styles.card, role === 'lawyer' && styles.cardActive]}
          onPress={() => setRole('lawyer')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconWrap, role === 'lawyer' && styles.iconWrapActive]}>
            <MaterialCommunityIcons name="briefcase-outline" size={28} color={role === 'lawyer' ? '#fff' : COLORS.primary} />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={[styles.roleLabel, role === 'lawyer' && { color: COLORS.primary }]}>I am a Lawyer</Text>
              {role === 'lawyer' && <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primary} />}
            </View>
            <Text style={styles.roleDesc}>Practising barrister or solicitor — manage clients, draft documents, research cases, and stay compliant.</Text>
            <View style={styles.tags}>
              {['NBA Member', 'Barrister', 'Solicitor', 'Legal Practitioner'].map((t) => (
                <View key={t} style={[styles.tag, role === 'lawyer' && styles.tagActive]}>
                  <Text style={[styles.tagText, role === 'lawyer' && { color: COLORS.primary }]}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, role === 'law_student' && styles.cardActive]}
          onPress={() => setRole('law_student')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconWrap, role === 'law_student' && styles.iconWrapActive]}>
            <MaterialCommunityIcons name="school-outline" size={28} color={role === 'law_student' ? '#fff' : COLORS.primary} />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTop}>
              <Text style={[styles.roleLabel, role === 'law_student' && { color: COLORS.primary }]}>I am a Law Student</Text>
              {role === 'law_student' && <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primary} />}
            </View>
            <Text style={styles.roleDesc}>Studying law at a Nigerian university or law school — moot prep, case summaries, mentorship, and pupillage search.</Text>
            <View style={styles.tags}>
              {['University', 'Law School', 'LLB', 'BL Student'].map((t) => (
                <View key={t} style={[styles.tag, role === 'law_student' && styles.tagActive]}>
                  <Text style={[styles.tagText, role === 'law_student' && { color: COLORS.primary }]}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={() => role && save(role)}
          disabled={!role || saving}
          loading={saving}
          style={styles.continueBtn}
          contentStyle={{ paddingVertical: 6 }}
        >
          Get Started
        </Button>
        <TouchableOpacity onPress={() => save('general_user')} disabled={saving} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  backText: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 28 },
  lbLogoWrap: {
    width: 80, height: 80, borderRadius: 20, overflow: 'hidden', marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  lbLogoImg: { width: 80, height: 80 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  cards: { gap: 14, flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: COLORS.surface, borderRadius: 18,
    borderWidth: 1.5, borderColor: COLORS.border, padding: 18,
  },
  cardActive: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}0d` },
  cardActiveGreen: { borderColor: '#2e7d32', backgroundColor: '#2e7d3210' },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconWrapActive: { backgroundColor: COLORS.primary },
  iconWrapGreen: { backgroundColor: '#2e7d32' },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  roleLabel: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  roleDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  tagActive: { borderColor: COLORS.primary },
  tagActiveGreen: { borderColor: '#2e7d32' },
  tagText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  footer: { paddingTop: 20 },
  continueBtn: { borderRadius: 12, marginBottom: 4 },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
});
