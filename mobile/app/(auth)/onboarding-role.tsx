import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';

const LB_LOGO = require('@/assets/logo.png');
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth.store';
import { supabase, sendWelcomeEmail } from '@/services/auth.service';
import { api } from '@/services/api';
import { type UserRole } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

type Step = 'category' | 'legal_sub' | 'general_sub';
type Category = 'legal' | 'general';

/** Specific audiences on the general side — each gets its own AI tone. */
const GENERAL_SUBROLES: { id: string; label: string; desc: string; icon: string }[] = [
  { id: 'individual', label: 'Individual', desc: 'Personal legal questions — rights, family, tenancy, disputes.', icon: 'account-outline' },
  { id: 'business_owner', label: 'Business Owner', desc: 'Contracts, CAC registration, tax, compliance and employees.', icon: 'store-outline' },
  { id: 'real_estate', label: 'Real Estate Agent', desc: 'Property law, tenancy agreements, deeds, land documentation.', icon: 'home-city-outline' },
  { id: 'journalist', label: 'Journalist', desc: 'Press freedom, FOI requests, defamation, verifying legal claims.', icon: 'newspaper-variant-outline' },
  { id: 'civil_servant', label: 'Civil Servant', desc: 'Public service rules, pensions, workplace rights and procedure.', icon: 'office-building-outline' },
  { id: 'student', label: 'Student (non-law)', desc: 'School matters, internships, rights as a young Nigerian.', icon: 'school-outline' },
];

export default function OnboardingRoleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updateProfile, completeOnboarding } = useAuthStore();
  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<Category | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [subRole, setSubRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(r: UserRole, sub?: string | null) {
    setSaving(true);
    try { await api.patch('/api/v1/profile', { role: r, subRole: sub ?? undefined }); } catch {}
    await updateProfile({ role: r, subRole: sub ?? undefined });
    await completeOnboarding();
    // Fire-and-forget: the welcome email must never delay entering the app.
    sendWelcomeEmail();
    setSaving(false);
    router.replace('/(main)/chat');
  }

  function pickCategory(cat: Category) {
    setCategory(cat);
    setRole(null);
    setSubRole(null);
  }

  // Leaving onboarding means signing out — there's no other account state to
  // return to, so this lets the user try a different email/Google account.
  async function backToLogin() {
    try { await supabase.auth.signOut(); } catch {}
    await useAuthStore.getState().clearAuth();
    router.replace('/(auth)/landing');
  }

  // ── Step 1: Category ──────────────────────────────────────────────────
  if (step === 'category') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={backToLogin}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text} />
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>

        <View style={[styles.header, { marginTop: 12 }]}>
          <Image source={LB_LOGO} style={styles.lbLogoImg} resizeMode="contain" />
          <Text style={styles.title}>Who are you?</Text>
          <Text style={styles.subtitle}>
            Choose the category that best describes you. LegalBridge is built differently for each.
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
                <Text style={[styles.roleLabel, category === 'general' && { color: '#2e7d32' }]}>Everyday User</Text>
                {category === 'general' && <MaterialCommunityIcons name="check-circle" size={20} color="#2e7d32" />}
              </View>
              <Text style={styles.roleDesc}>Individuals, business owners, agents, journalists and civil servants seeking legal guidance.</Text>
              <View style={styles.tags}>
                {['Individuals', 'Businesses', 'Agents', 'Journalists', 'Civil Servants'].map((t) => (
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
            onPress={() => setStep(category === 'legal' ? 'legal_sub' : 'general_sub')}
            disabled={!category || saving}
            loading={saving}
            style={styles.continueBtn}
            contentStyle={{ paddingVertical: 6 }}
          >
            Continue
          </Button>
        </View>
      </View>
    );
  }

  // ── Step 2a: Legal sub-role ───────────────────────────────────────────
  if (step === 'legal_sub') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => { setStep('category'); setCategory(null); setRole(null); }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Image source={LB_LOGO} style={styles.lbLogoImgSmall} resizeMode="contain" />
          <Text style={styles.title}>Lawyer or law student?</Text>
          <Text style={styles.subtitle}>Each has its own tools, navigation and AI behaviour.</Text>
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
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={() => role && save(role, role)}
            disabled={!role || saving}
            loading={saving}
            style={styles.continueBtn}
            contentStyle={{ paddingVertical: 6 }}
          >
            Get Started
          </Button>
        </View>
      </View>
    );
  }

  // ── Step 2b: General sub-role (who exactly?) ──────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => { setStep('category'); setCategory(null); setSubRole(null); }}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Image source={LB_LOGO} style={styles.lbLogoImgSmall} resizeMode="contain" />
        <Text style={styles.title}>Tell us more about you</Text>
        <Text style={styles.subtitle}>Your answers, documents and news feed will be tailored to your world.</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {GENERAL_SUBROLES.map((s) => {
          const active = subRole === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.subCard, active && styles.cardActiveGreen]}
              onPress={() => setSubRole(s.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.subIconWrap, active && styles.iconWrapGreen]}>
                <MaterialCommunityIcons name={s.icon as any} size={22} color={active ? '#fff' : '#2e7d32'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.subLabel, active && { color: '#2e7d32' }]}>{s.label}</Text>
                <Text style={styles.subDesc}>{s.desc}</Text>
              </View>
              {active && <MaterialCommunityIcons name="check-circle" size={20} color="#2e7d32" />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={() => subRole && save('general_user', subRole)}
          disabled={!subRole || saving}
          loading={saving}
          style={styles.continueBtn}
          contentStyle={{ paddingVertical: 6 }}
        >
          Get Started
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  backText: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  header: { alignItems: 'center', marginBottom: 28 },
  lbLogoImg: { width: 80, height: 80 },
  lbLogoImgSmall: { width: 56, height: 56, marginBottom: 8 },
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
  // compact sub-role rows
  subCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.border, padding: 14,
  },
  subIconWrap: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: '#2e7d3212',
    alignItems: 'center', justifyContent: 'center',
  },
  subLabel: { fontSize: 15.5, fontWeight: '700', color: COLORS.text },
  subDesc: { fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 17, marginTop: 1 },
  footer: { paddingTop: 20 },
  continueBtn: { borderRadius: 12, marginBottom: 4 },
});
