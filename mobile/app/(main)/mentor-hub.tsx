import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert,
  ActivityIndicator, Switch, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import {
  getMyMentorProfile, saveMentorProfile, incomingRequests, respondToRequest,
  type MentorshipRequest,
} from '@/services/mentorship.service';

const FOCUS_AREAS = [
  'Litigation', 'Corporate Practice', 'Property Law', 'Criminal Practice',
  'Family Law', 'Human Rights', 'Moot & Advocacy', 'Law School Prep', 'Pupillage Guidance',
];

export default function MentorHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [requests, setRequests] = useState<MentorshipRequest[]>([]);

  async function load() {
    try {
      const [p, r] = await Promise.all([getMyMentorProfile(), incomingRequests()]);
      if (p) {
        setHasProfile(true);
        setIsActive(p.is_active);
        setAreas(p.focus_areas ?? []);
        setBio(p.bio ?? '');
      }
      setRequests(r);
    } catch { /* keep */ }
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  function toggleArea(a: string) {
    setAreas((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  }

  async function save(nextActive?: boolean) {
    const active = nextActive ?? isActive;
    setSaving(true);
    try {
      await saveMentorProfile({
        fullName: user?.fullName ?? user?.email ?? 'Lawyer',
        focusAreas: areas,
        bio,
        isActive: active,
      });
      setHasProfile(true);
      setIsActive(active);
      Alert.alert('Saved ✓', active
        ? 'You are now visible to law students looking for mentors.'
        : 'Your mentor profile is hidden. Students can no longer send you requests.');
    } catch (e: any) {
      Alert.alert('Could not save', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function respond(r: MentorshipRequest, accept: boolean) {
    try {
      await respondToRequest(r.id, accept);
      await load();
      if (accept) {
        Alert.alert('Accepted 🎉', `${r.student_name} has been notified. Reach out to them to begin the mentorship.`);
      }
    } catch (e: any) {
      Alert.alert('Failed', String(e?.message ?? e));
    }
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const past = requests.filter((r) => r.status !== 'pending');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mentor Hub</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.primary} />
          }
        >
          {/* Availability toggle */}
          <View style={styles.toggleCard}>
            <MaterialCommunityIcons name="account-tie-outline" size={24} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Available as a mentor</Text>
              <Text style={styles.toggleSub}>
                Give back to the profession — guide the next generation of Nigerian lawyers.
              </Text>
            </View>
            <Switch
              value={isActive && hasProfile}
              onValueChange={(v) => save(v)}
              trackColor={{ true: COLORS.primary, false: COLORS.border }}
              thumbColor="#fff"
              disabled={saving}
            />
          </View>

          <Text style={styles.label}>Mentorship focus areas</Text>
          <View style={styles.areaRow}>
            {FOCUS_AREAS.map((a) => {
              const on = areas.includes(a);
              return (
                <TouchableOpacity key={a} style={[styles.areaChip, on && styles.areaChipOn]} onPress={() => toggleArea(a)}>
                  <Text style={[styles.areaChipText, on && { color: '#fff' }]}>{a}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Message to students</Text>
          <TextInput
            style={styles.bioInput}
            value={bio}
            onChangeText={setBio}
            placeholder="e.g. 12 years in commercial litigation. Happy to guide students on advocacy, law school and starting practice…"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={() => save()} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save mentor profile</Text>}
          </TouchableOpacity>

          {/* Requests */}
          <Text style={styles.sectionTitle}>MENTORSHIP REQUESTS {pending.length > 0 ? `(${pending.length} new)` : ''}</Text>
          {pending.map((r) => (
            <View key={r.id} style={styles.requestCard}>
              <Text style={styles.reqName}>{r.student_name}</Text>
              <Text style={styles.reqMsg}>"{r.message}"</Text>
              <View style={styles.reqActions}>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => respond(r, true)}>
                  <MaterialCommunityIcons name="check" size={15} color="#fff" />
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineBtn} onPress={() => respond(r, false)}>
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {!pending.length && (
            <Text style={styles.noRequests}>
              {isActive && hasProfile
                ? 'No new requests yet — students will find you here.'
                : 'Turn on availability above to start receiving requests.'}
            </Text>
          )}

          {past.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>PAST</Text>
              {past.map((r) => (
                <View key={r.id} style={styles.pastRow}>
                  <MaterialCommunityIcons
                    name={r.status === 'accepted' ? 'check-circle-outline' : 'close-circle-outline'}
                    size={16}
                    color={r.status === 'accepted' ? '#15803d' : COLORS.textSecondary}
                  />
                  <Text style={styles.pastText}>{r.student_name} — {r.status}</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16,
  },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  toggleSub: { fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 17, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  areaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  areaChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  areaChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  areaChipText: { fontSize: 12.5, color: COLORS.textSecondary, fontWeight: '600' },
  bioInput: {
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, fontSize: 14, color: COLORS.text, minHeight: 90,
  },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.6, marginTop: 10 },
  requestCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, gap: 8,
  },
  reqName: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  reqMsg: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, fontStyle: 'italic' },
  reqActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center',
    backgroundColor: '#15803d', borderRadius: 10, paddingVertical: 10,
  },
  acceptBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  declineBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  declineBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 13.5 },
  noRequests: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, textAlign: 'center', paddingVertical: 10 },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pastText: { fontSize: 13, color: COLORS.textSecondary },
});
