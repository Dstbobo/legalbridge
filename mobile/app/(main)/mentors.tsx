import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert,
  ActivityIndicator, Modal, Pressable, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import {
  listActiveMentors, requestMentorship, myRequests,
  type MentorProfile, type MentorshipRequest,
} from '@/services/mentorship.service';

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: '#b45309', icon: 'clock-outline' },
  accepted: { label: 'Accepted 🎉', color: '#15803d', icon: 'check-circle-outline' },
  declined: { label: 'Declined', color: COLORS.error, icon: 'close-circle-outline' },
};

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export default function MentorsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [mentors, setMentors] = useState<MentorProfile[]>([]);
  const [requests, setRequests] = useState<MentorshipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [asking, setAsking] = useState<MentorProfile | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    try {
      const [m, r] = await Promise.all([listActiveMentors(), myRequests()]);
      setMentors(m); setRequests(r);
    } catch { /* keep last */ }
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const requestByMentor = new Map(requests.map((r) => [r.mentor_id, r]));

  async function send() {
    if (!asking || !message.trim()) return;
    setSending(true);
    try {
      await requestMentorship(asking.user_id, user?.fullName ?? user?.email ?? 'Law student', message);
      setAsking(null); setMessage('');
      await load();
      Alert.alert('Request sent ✓', 'Your mentorship request has been sent. You will see the mentor\'s response here.');
    } catch (e: any) {
      Alert.alert('Could not send', String(e?.message ?? e));
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find a Mentor</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.primary} />
        }
      >
        {loading ? (
          <ActivityIndicator style={{ paddingVertical: 40 }} size="large" color={COLORS.primary} />
        ) : (
          <>
            {/* My requests */}
            {requests.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>MY REQUESTS</Text>
                {requests.map((r) => {
                  const meta = STATUS_META[r.status];
                  const mentor = mentors.find((m) => m.user_id === r.mentor_id);
                  return (
                    <View key={r.id} style={styles.requestCard}>
                      <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.requestMentor}>{mentor?.full_name ?? 'Mentor'}</Text>
                        <Text style={[styles.requestStatus, { color: meta.color }]}>{meta.label}</Text>
                        {!!r.mentor_note && <Text style={styles.requestNote}>"{r.mentor_note}"</Text>}
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            <Text style={styles.sectionTitle}>AVAILABLE MENTORS</Text>
            {mentors.map((m) => {
              const existing = requestByMentor.get(m.user_id);
              return (
                <View key={m.user_id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{initialsOf(m.full_name)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mentorName}>{m.full_name}</Text>
                      <View style={styles.verifiedBadge}>
                        <MaterialCommunityIcons name="check-decagram" size={11} color="#2ecc71" />
                        <Text style={styles.verifiedText}>Verified Lawyer · Mentor</Text>
                      </View>
                    </View>
                  </View>
                  {m.focus_areas?.length > 0 && (
                    <View style={styles.tagRow}>
                      {m.focus_areas.map((f) => <View key={f} style={styles.tag}><Text style={styles.tagText}>{f}</Text></View>)}
                    </View>
                  )}
                  {!!m.bio && <Text style={styles.bio} numberOfLines={3}>{m.bio}</Text>}
                  {existing ? (
                    <View style={[styles.requestedBtn]}>
                      <MaterialCommunityIcons name={STATUS_META[existing.status].icon as any} size={15} color={STATUS_META[existing.status].color} />
                      <Text style={[styles.requestedBtnText, { color: STATUS_META[existing.status].color }]}>
                        {STATUS_META[existing.status].label}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.askBtn} onPress={() => setAsking(m)}>
                      <Text style={styles.askBtnText}>Request Mentorship</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {!mentors.length && (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="account-tie-outline" size={44} color={COLORS.border} />
                <Text style={styles.emptyText}>
                  Mentors will appear here as verified lawyers join the mentorship programme. Check back soon.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Request modal */}
      <Modal visible={!!asking} transparent animationType="slide" onRequestClose={() => setAsking(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAsking(null)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Request {asking?.full_name}</Text>
            <Text style={styles.modalSub}>Introduce yourself — school, level, and what you hope to learn.</Text>
            <TextInput
              style={styles.msgInput}
              value={message}
              onChangeText={setMessage}
              placeholder="e.g. I'm a 400-level law student at UNILAG interested in property law. I would love guidance on…"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              maxLength={600}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.askBtn, (!message.trim() || sending) && { opacity: 0.5 }]}
              onPress={send}
              disabled={!message.trim() || sending}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.askBtnText}>Send Request</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAsking(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.6, marginTop: 6 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 13, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  mentorName: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    backgroundColor: 'rgba(46,204,113,0.1)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  verifiedText: { fontSize: 10, color: '#2ecc71', fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: `${COLORS.primary}18`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  bio: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  askBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  askBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  requestedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  requestedBtnText: { fontWeight: '700', fontSize: 13.5 },
  requestCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 13,
  },
  requestMentor: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  requestStatus: { fontSize: 12.5, fontWeight: '700', marginTop: 2 },
  requestNote: { fontSize: 12.5, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 4, lineHeight: 17 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  modalSub: { fontSize: 13.5, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },
  msgInput: {
    backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14, fontSize: 14, color: COLORS.text, minHeight: 110,
  },
  cancelBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
});
