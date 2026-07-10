import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/services/auth.service';
import { ROLE_LABELS, isLawyer, isLawStudent } from '@/constants/roles';

const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta',
  'Ebonyi','Edo','Ekiti','Enugu','FCT Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi',
  'Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
  'Taraba','Yobe','Zamfara',
];

const SUB_ROLES: { id: string; label: string }[] = [
  { id: 'individual', label: 'Individual' },
  { id: 'business_owner', label: 'Business Owner' },
  { id: 'real_estate', label: 'Real Estate Agent' },
  { id: 'journalist', label: 'Journalist' },
  { id: 'civil_servant', label: 'Civil Servant' },
  { id: 'student', label: 'Student (non-law)' },
];

// Languages the AI can answer in. `native` is how speakers name their own
// language, so the choice feels personal.
const LANGUAGES: { id: string; label: string; native: string }[] = [
  { id: 'en',  label: 'English',          native: 'English' },
  { id: 'pcm', label: 'Nigerian Pidgin',  native: 'Naija' },
  { id: 'ha',  label: 'Hausa',            native: 'Hausa' },
  { id: 'yo',  label: 'Yoruba',           native: 'Yorùbá' },
  { id: 'ig',  label: 'Igbo',             native: 'Igbo' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateProfile } = useAuthStore();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [state, setState] = useState(user?.state ?? '');
  const [phone, setPhone] = useState((user as any)?.phone ?? '');
  const [subRole, setSubRole] = useState(user?.subRole ?? 'individual');
  const [language, setLanguage] = useState(user?.language ?? 'en');
  const [stateOpen, setStateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Language applies instantly so the user can go straight to chat and test it.
  function pickLanguage(id: string) {
    setLanguage(id);
    updateProfile({ language: id });
  }

  const roleLabel = user?.role ? ROLE_LABELS[user.role] : 'General User';
  const isGeneral = !isLawyer(user?.role) && !isLawStudent(user?.role);

  async function save() {
    if (!fullName.trim()) { Alert.alert('Name required', 'Please enter your full name.'); return; }
    setSaving(true);
    try {
      // Server copy (the AI reads this) — best-effort.
      if (user?.id) {
        await supabase.from('profiles').upsert({
          id: user.id,
          full_name: fullName.trim(),
          state: state || null,
          phone: phone.trim() || null,
          sub_role: isGeneral ? subRole : (user?.subRole ?? null),
        }).then(({ error }) => { if (error) console.log('profile upsert:', error.message); });
      }
      // Local copy (drives the app immediately).
      await updateProfile({
        fullName: fullName.trim(),
        state: state || undefined,
        subRole: isGeneral ? subRole : user?.subRole,
      });
      Alert.alert('Saved ✓', 'Your profile has been updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Could not save', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* Identity summary */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(fullName || user?.email || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.identityEmail}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <MaterialCommunityIcons name="account-check-outline" size={13} color={COLORS.primary} />
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        {/* Answer language — the AI replies in whatever the user picks */}
        <Text style={styles.label}>Answer language</Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((l) => {
            const on = language === l.id;
            return (
              <TouchableOpacity key={l.id} style={[styles.langChip, on && styles.langChipOn]} onPress={() => pickLanguage(l.id)} activeOpacity={0.8}>
                {on && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
                <Text style={[styles.langChipText, on && { color: '#fff' }]}>{l.native}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>LegalBridge will reply in this language. Legal documents stay in English for validity, but are explained in your language.</Text>

        <Text style={styles.label}>Full name</Text>
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Your full name" placeholderTextColor={COLORS.textSecondary} />

        <Text style={styles.label}>State</Text>
        <TouchableOpacity style={styles.input} onPress={() => setStateOpen(!stateOpen)} activeOpacity={0.7}>
          <View style={styles.selectRow}>
            <Text style={[styles.selectText, !state && { color: COLORS.textSecondary }]}>{state || 'Select your state'}</Text>
            <MaterialCommunityIcons name={stateOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textSecondary} />
          </View>
        </TouchableOpacity>
        {stateOpen && (
          <View style={styles.stateList}>
            {NIGERIAN_STATES.map((s) => (
              <TouchableOpacity key={s} style={[styles.stateChip, state === s && styles.stateChipOn]} onPress={() => { setState(s); setStateOpen(false); }}>
                <Text style={[styles.stateChipText, state === s && { color: '#fff' }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Phone / WhatsApp</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+234..." placeholderTextColor={COLORS.textSecondary} keyboardType="phone-pad" />

        {isGeneral && (
          <>
            <Text style={styles.label}>I am a…</Text>
            <View style={styles.subRoleRow}>
              {SUB_ROLES.map((s) => {
                const on = subRole === s.id;
                return (
                  <TouchableOpacity key={s.id} style={[styles.subChip, on && styles.subChipOn]} onPress={() => setSubRole(s.id)}>
                    <Text style={[styles.subChipText, on && { color: '#fff' }]}>{s.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hint}>This shapes your AI answers, documents and news feed.</Text>
          </>
        )}

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  avatar: {
    width: 54, height: 54, borderRadius: 16, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 19, fontWeight: '800' },
  identityEmail: { fontSize: 13.5, color: COLORS.text, fontWeight: '600', marginBottom: 5 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: `${COLORS.primary}12`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  roleBadgeText: { fontSize: 11.5, color: COLORS.primary, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14.5, color: COLORS.text,
  },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 14.5, color: COLORS.text },
  stateList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  stateChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  stateChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stateChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  subRoleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subChip: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  subChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  subChipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  langChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  langChipText: { fontSize: 13.5, color: COLORS.text, fontWeight: '700' },
  hint: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15.5 },
});
