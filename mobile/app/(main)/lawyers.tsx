import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Pressable, Alert, Linking, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import { isLawyer } from '@/constants/roles';
import { listDirectoryLawyers, type LawyerVerification } from '@/services/lawyers.service';
import {
  getOrCreateConversation, sendChatMessage, fetchReviewSummaries, submitReview,
  type ReviewSummary,
} from '@/services/messaging.service';

const SPECIALTIES = ['All', 'Land & Property', 'Criminal', 'Corporate', 'Family Law', 'Employment', 'Human Rights', 'Tax', 'Intellectual Property'];

const AVATAR_COLORS = [COLORS.primary, '#c0392b', '#7d3c98', '#1a7a3c', '#b45309', '#0e7490'];

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}
function colorOf(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function experienceOf(l: LawyerVerification): string {
  if (l.experience_label) return l.experience_label;
  if (!l.year_of_call) return 'Practising lawyer';
  const yrs = Math.max(0, new Date().getFullYear() - l.year_of_call);
  return yrs > 0 ? `${yrs} year${yrs > 1 ? 's' : ''} at the bar` : 'Newly called';
}

function LawyerCard({ lawyer, rating, onView }: {
  lawyer: LawyerVerification; rating?: ReviewSummary; onView: (l: LawyerVerification) => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onView(lawyer)} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: colorOf(lawyer.full_name) }]}>
          <Text style={styles.avatarText}>{initialsOf(lawyer.full_name)}</Text>
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.lawyerName} numberOfLines={1}>{lawyer.full_name}</Text>
            <View style={lawyer.status === 'verified' ? styles.verifiedBadge : styles.pendingBadge}>
              <MaterialCommunityIcons
                name={lawyer.status === 'verified' ? 'check-decagram' : 'alert-circle-outline'}
                size={11}
                color={lawyer.status === 'verified' ? '#2ecc71' : '#b45309'}
              />
              <Text style={lawyer.status === 'verified' ? styles.verifiedText : styles.pendingText}>
                {lawyer.status === 'verified' ? 'SCN Verified' : 'Not verified'}
              </Text>
            </View>
          </View>
          {!!lawyer.firm && <Text style={styles.lawyerFirm} numberOfLines={1}>{lawyer.firm}</Text>}
        </View>
      </View>

      {lawyer.specializations?.length > 0 && (
        <View style={styles.tagRow}>
          {lawyer.specializations.map((s) => <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>)}
        </View>
      )}

      <View style={styles.metaRow}>
        {!!lawyer.state && (
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="map-marker-outline" size={12} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{lawyer.state}</Text>
          </View>
        )}
        <View style={styles.metaItem}>
          <MaterialCommunityIcons name="briefcase-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{experienceOf(lawyer)}</Text>
        </View>
      </View>

      {!!lawyer.bio && (
        <>
          <View style={styles.cardDivider} />
          <Text style={styles.bio} numberOfLines={2}>{lawyer.bio}</Text>
        </>
      )}

      <View style={styles.cardBottom}>
        {rating && rating.count > 0 ? (
          <View style={styles.ratingRow}>
            <MaterialCommunityIcons name="star" size={14} color={COLORS.accent} />
            <Text style={styles.ratingText}>{rating.avg.toFixed(1)} ({rating.count})</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={styles.cardActions}>
          {!!lawyer.whatsapp && (
            <TouchableOpacity
              style={styles.waBtn}
              onPress={(e) => { e.stopPropagation?.(); Linking.openURL(`https://wa.me/${lawyer.whatsapp!.replace(/\D/g, '')}`); }}
            >
              <MaterialCommunityIcons name="whatsapp" size={14} color="#25d366" />
              <Text style={styles.waBtnText}>WhatsApp</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.viewBtn} onPress={() => onView(lawyer)}>
            <Text style={styles.viewBtnText}>View Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function LawyerModal({ lawyer, onClose, onBook }: {
  lawyer: LawyerVerification | null; onClose: () => void; onBook: (l: LawyerVerification) => void;
}) {
  if (!lawyer) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHandle} />
            <View style={[styles.modalAvatar, { backgroundColor: colorOf(lawyer.full_name) }]}>
              <Text style={styles.modalAvatarText}>{initialsOf(lawyer.full_name)}</Text>
            </View>
            <Text style={styles.modalName}>{lawyer.full_name}</Text>
            {!!lawyer.firm && <Text style={styles.modalSub}>{lawyer.firm}</Text>}

            <View style={lawyer.status === 'verified' ? styles.verifiedRow : styles.pendingRow}>
              <MaterialCommunityIcons
                name={lawyer.status === 'verified' ? 'check-decagram' : 'alert-circle-outline'}
                size={16}
                color={lawyer.status === 'verified' ? '#2ecc71' : '#b45309'}
              />
              <Text style={lawyer.status === 'verified' ? styles.verifiedRowText : styles.pendingRowText}>
                {lawyer.status === 'verified'
                  ? `Identity verified against Supreme Court enrolment (${lawyer.scn_number})`
                  : 'This lawyer account has not been verified by LegalBridge.'}
              </Text>
            </View>

            {lawyer.specializations?.length > 0 && (
              <>
                <Text style={styles.modalSectionTitle}>Specialties</Text>
                <View style={[styles.tagRow, { marginBottom: 14 }]}>
                  {lawyer.specializations.map((s) => <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>)}
                </View>
              </>
            )}

            {!!lawyer.bio && (
              <>
                <Text style={styles.modalSectionTitle}>About</Text>
                <Text style={styles.modalBio}>{lawyer.bio}</Text>
              </>
            )}

            <Text style={styles.modalSectionTitle}>Details</Text>
            <View style={styles.metaRow}>
              {!!lawyer.state && (
                <View style={styles.metaItem}>
                  <MaterialCommunityIcons name="map-marker-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>{lawyer.state}</Text>
                </View>
              )}
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="briefcase-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{experienceOf(lawyer)}</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.bookBtn} onPress={() => onBook(lawyer)}>
                <Text style={styles.bookBtnText}>Book Consultation</Text>
              </TouchableOpacity>
              {!!lawyer.whatsapp && (
                <TouchableOpacity style={styles.waBtnFull} onPress={() => Linking.openURL(`https://wa.me/${lawyer.whatsapp!.replace(/\D/g, '')}`)}>
                  <MaterialCommunityIcons name="whatsapp" size={18} color="#25d366" />
                  <Text style={styles.waBtnFullText}>Contact via WhatsApp</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BookingModal({ lawyer, onClose }: { lawyer: LawyerVerification | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  if (!lawyer) return null;
  const lawyerName = lawyer.full_name;
  const lawyerUserId = lawyer.user_id;

  async function submit() {
    setSending(true);
    try {
      const convo = await getOrCreateConversation(
        lawyerUserId, lawyerName, user?.fullName ?? user?.email ?? 'Client',
      );
      await sendChatMessage(convo.id, `📋 Consultation request:
${note.trim()}`);
      onClose();
      Alert.alert(
        'Request Sent ✓',
        `Your request is in ${lawyerName}'s Messages. Continue the conversation there — everything stays inside LegalBridge.`,
        [{ text: 'Open Conversation', onPress: () => router.push({ pathname: '/(main)/conversation', params: { id: convo.id, name: lawyerName } } as any) },
         { text: 'Later' }],
      );
    } catch (e: any) {
      Alert.alert('Could not send', String(e?.message ?? e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalName}>Book {lawyer.full_name}</Text>

          <Text style={[styles.modalSectionTitle, { marginTop: 16 }]}>Describe your legal issue</Text>
          <TextInput
            style={styles.bookingInput}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. My landlord refused to return my deposit after moving out…"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <View style={styles.bookingNote}>
            <MaterialCommunityIcons name="information-outline" size={15} color={COLORS.textSecondary} />
            <Text style={styles.bookingNoteText}>The lawyer will review your request and confirm availability. You will be notified in the Messages tab.</Text>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.bookBtn, (!note.trim() || sending) && { opacity: 0.45 }]} onPress={submit} disabled={!note.trim() || sending}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.bookBtnText}>Send Request</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function LawyersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [lawyers, setLawyers] = useState<LawyerVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileLawyer, setProfileLawyer] = useState<LawyerVerification | null>(null);
  const [bookingLawyer, setBookingLawyer] = useState<LawyerVerification | null>(null);

  const [ratings, setRatings] = useState<Map<string, ReviewSummary>>(new Map());

  async function load() {
    try {
      const list = await listDirectoryLawyers();
      setLawyers(list);
      fetchReviewSummaries(list.map((l) => l.user_id)).then(setRatings).catch(() => {});
    } catch { /* keep last list */ }
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const filtered = lawyers.filter((l) => {
    const byFilter = filter === 'All' || (l.specializations ?? []).includes(filter);
    const q = search.toLowerCase();
    const bySearch = !search
      || l.full_name.toLowerCase().includes(q)
      || (l.firm ?? '').toLowerCase().includes(q)
      || (l.state ?? '').toLowerCase().includes(q)
      || (l.specializations ?? []).join(' ').toLowerCase().includes(q);
    return byFilter && bySearch;
  });

  const states = new Set(lawyers.map((l) => l.state).filter(Boolean));
  const verifiedCount = lawyers.filter((l) => l.status === 'verified').length;
  const unverifiedCount = lawyers.filter((l) => l.status === 'unverified' || l.status === 'rejected').length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find a Lawyer</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Instant AI consultation — clearly labeled, fills the gap while the
            verified directory grows. Never presented as a human lawyer. */}
        <TouchableOpacity activeOpacity={0.9} onPress={() => router.replace({ pathname: '/(main)/chat', params: { intent: 'counsel', t: String(Date.now()) } } as any)} style={styles.counselWrap}>
          <LinearGradient
            colors={[COLORS.primary, '#1a2f5e']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.counselCard}
          >
            <View style={styles.counselTop}>
              <View style={styles.counselIcon}>
                <MaterialCommunityIcons name="scale-balance" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.counselTitle}>LegalBridge Counsel</Text>
                  <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
                </View>
                <Text style={styles.counselSub}>Instant legal guidance — no waiting for an appointment</Text>
              </View>
            </View>
            <View style={styles.counselPerks}>
              {['Available 24/7', 'Answers in seconds', 'Free'].map((perk) => (
                <View key={perk} style={styles.perk}>
                  <MaterialCommunityIcons name="check-circle" size={13} color="#7ee2a8" />
                  <Text style={styles.perkText}>{perk}</Text>
                </View>
              ))}
            </View>
            <View style={styles.counselBtn}>
              <MaterialCommunityIcons name="message-text-outline" size={17} color={COLORS.primary} />
              <Text style={styles.counselBtnText}>Start free consultation</Text>
            </View>
            <Text style={styles.counselDisclaimer}>
              AI assistant — general legal information, not a substitute for a lawyer. For representation,
              review each lawyer's verification badge before making contact.
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Lawyers see a "get verified" invitation */}
        {isLawyer(user?.role) && (
          <TouchableOpacity style={styles.verifyBanner} onPress={() => router.push('/(main)/verify-lawyer' as any)} activeOpacity={0.85}>
            <MaterialCommunityIcons name="shield-check-outline" size={22} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyBannerTitle}>Are you listed yet?</Text>
              <Text style={styles.verifyBannerText}>Verify your SCN to appear in this directory and receive client requests.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textSecondary} />
            <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search by name, state or specialty…" placeholderTextColor={COLORS.textSecondary} />
          </View>
        </View>

        <View style={styles.statsBar}>
          {[
            { num: String(lawyers.length), label: 'Lawyer Accounts' },
            { num: String(verifiedCount), label: 'SCN Verified' },
            { num: String(unverifiedCount), label: 'Not Verified' },
          ].map((s, i) => (
            <View key={s.label} style={[styles.stat, i < 2 && styles.statBorder]}>
              <Text style={styles.statNum}>{s.num}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {SPECIALTIES.map((s) => (
            <TouchableOpacity key={s} style={[styles.filterBtn, filter === s && styles.filterBtnActive]} onPress={() => setFilter(s)}>
              <Text style={[styles.filterText, filter === s && styles.filterTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.cardsList}>
          {loading ? (
            <ActivityIndicator style={{ paddingVertical: 40 }} size="large" color={COLORS.primary} />
          ) : (
            <>
              {filtered.map((l) => <LawyerCard key={l.id} lawyer={l} rating={ratings.get(l.user_id)} onView={setProfileLawyer} />)}
              {!filtered.length && (
                <View style={styles.empty}>
                  <MaterialCommunityIcons name="shield-account-outline" size={44} color={COLORS.border} />
                  <Text style={styles.emptyText}>
                    {lawyers.length === 0
                      ? 'Lawyer accounts will appear here after signup. Check each profile badge to see whether SCN verification is complete.'
                      : 'No lawyers match your search'}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <LawyerModal lawyer={profileLawyer} onClose={() => setProfileLawyer(null)} onBook={(l) => { setProfileLawyer(null); setBookingLawyer(l); }} />
      <BookingModal lawyer={bookingLawyer} onClose={() => setBookingLawyer(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  verifyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: `${COLORS.primary}0d`, borderRadius: 14,
    borderWidth: 1, borderColor: `${COLORS.primary}30`, padding: 14,
  },
  verifyBannerTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  verifyBannerText: { fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 17, marginTop: 1 },
  counselWrap: { marginHorizontal: 16, marginTop: 14 },
  counselCard: { borderRadius: 20, padding: 18, gap: 12 },
  counselTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counselIcon: {
    width: 50, height: 50, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  counselTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  aiBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 1.5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  aiBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  counselSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 17, marginTop: 2 },
  counselPerks: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  perkText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  counselBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 13, paddingVertical: 12,
  },
  counselBtnText: { fontSize: 14.5, fontWeight: '800', color: COLORS.primary },
  counselDisclaimer: { fontSize: 10.5, color: 'rgba(255,255,255,0.65)', lineHeight: 14, textAlign: 'center' },
  searchWrap: { padding: 16 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  statsBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  stat: { flex: 1, padding: 12, alignItems: 'center' },
  statBorder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: COLORS.border },
  statNum: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: 10, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterScroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  filterTextActive: { color: '#fff', fontWeight: '700' },
  cardsList: { paddingHorizontal: 16, gap: 14 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 2 },
  lawyerName: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(46,204,113,0.1)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(46,204,113,0.25)' },
  verifiedText: { fontSize: 10, color: '#2ecc71', fontWeight: '700' },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(180,83,9,0.1)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(180,83,9,0.25)' },
  pendingText: { fontSize: 10, color: '#b45309', fontWeight: '700' },
  lawyerFirm: { fontSize: 12, color: COLORS.textSecondary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  tag: { backgroundColor: `${COLORS.primary}18`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.primary}30` },
  tagText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.textSecondary },
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginBottom: 10 },
  bio: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 12 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardActions: { flexDirection: 'row', gap: 8 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(37,211,102,0.1)', borderWidth: 1, borderColor: 'rgba(37,211,102,0.25)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  waBtnText: { fontSize: 12, color: '#25d366', fontWeight: '600' },
  viewBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  viewBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  ratingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 12.5, color: COLORS.textSecondary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 20 },
  modalAvatar: { width: 72, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  modalAvatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  modalName: { fontSize: 21, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  modalSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 12 },
  verifiedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: 'rgba(46,204,113,0.08)', borderRadius: 10, padding: 10, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(46,204,113,0.2)',
  },
  verifiedRowText: { flex: 1, fontSize: 12.5, color: '#1e8449', lineHeight: 17, fontWeight: '600' },
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: 'rgba(180,83,9,0.08)', borderRadius: 10, padding: 10, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(180,83,9,0.2)',
  },
  pendingRowText: { flex: 1, fontSize: 12.5, color: '#92400e', lineHeight: 17, fontWeight: '600' },
  modalSectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  modalBio: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22, marginBottom: 14 },
  modalActions: { gap: 10, marginTop: 20 },
  bookBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  bookBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  waBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(37,211,102,0.1)', borderWidth: 1, borderColor: 'rgba(37,211,102,0.25)', borderRadius: 14, paddingVertical: 14 },
  waBtnFullText: { color: '#25d366', fontWeight: '700', fontSize: 15 },
  cancelBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
  bookingInput: { backgroundColor: COLORS.background, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14, fontSize: 14, color: COLORS.text, minHeight: 100 },
  bookingNote: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.secondary, borderRadius: 10, padding: 12, marginTop: 12 },
  bookingNoteText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
});
