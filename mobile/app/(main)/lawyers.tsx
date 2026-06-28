import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Pressable, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/theme';

const SPECIALTIES = ['All', 'Land & Property', 'Criminal', 'Corporate', 'Family Law', 'Employment', 'Human Rights'];

interface Lawyer {
  id: string; initials: string; name: string; firm: string;
  location: string; experience: string; rate: string;
  rating: number; reviews: number; specialties: string[];
  bio: string; verified: boolean; featured?: boolean; online?: boolean;
  whatsapp?: string; avatarColor: string;
}

const LAWYERS: Lawyer[] = [
  {
    id: 'adaeze', initials: 'AO', name: 'Barr. Adaeze Okonkwo',
    firm: 'Senior Partner, Okonkwo & Associates',
    location: 'Lagos Island, Lagos', experience: '14 years', rate: '₦50,000',
    rating: 4.9, reviews: 127, specialties: ['Land & Property', 'Tenancy Law'],
    bio: 'Specialist in property rights enforcement and unlawful eviction cases. Recovered over ₦2.4B in compensation for clients in the past 3 years. Former Lagos State Ministry of Justice counsel.',
    verified: true, featured: true, online: true, whatsapp: '+2348012345678', avatarColor: COLORS.primary,
  },
  {
    id: 'emeka', initials: 'EI', name: 'Barr. Emeka Ijeoma',
    firm: 'Principal Counsel, Ijeoma Chambers',
    location: 'Abuja, FCT', experience: '11 years', rate: '₦75,000',
    rating: 4.8, reviews: 89, specialties: ['Criminal', 'Human Rights'],
    bio: 'Expert in criminal defense, EFCC prosecutions, and fundamental rights enforcement. Successfully discharged over 340 criminal cases. Called to bar at the Nigerian Law School, Lagos.',
    verified: true, avatarColor: '#c0392b',
  },
  {
    id: 'chioma', initials: 'CN', name: 'Barr. Chioma Nwosu',
    firm: 'Managing Partner, Nwosu Legal',
    location: 'Port Harcourt, Rivers', experience: '9 years', rate: '₦45,000',
    rating: 4.7, reviews: 63, specialties: ['Family Law', 'Employment'],
    bio: 'Family law specialist handling divorce, custody, and matrimonial property matters. Also practices employment law with a focus on wrongful termination.',
    verified: true, avatarColor: '#7d3c98',
  },
  {
    id: 'tunde', initials: 'TA', name: 'Barr. Tunde Adeyemi',
    firm: 'CEO, Adeyemi & Co.',
    location: 'Ibadan, Oyo', experience: '17 years', rate: '₦90,000',
    rating: 4.9, reviews: 201, specialties: ['Corporate', 'Land & Property'],
    bio: 'Corporate law expert with deep expertise in mergers, acquisitions, and commercial contracts. Advises major conglomerates and multinationals across West Africa.',
    verified: true, featured: true, avatarColor: '#1a7a3c',
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.stars}>
      {[1,2,3,4,5].map((i) => (
        <MaterialCommunityIcons key={i} name="star" size={12} color={i <= Math.round(rating) ? COLORS.accent : COLORS.border} />
      ))}
    </View>
  );
}

function LawyerCard({ lawyer, onView }: { lawyer: Lawyer; onView: (l: Lawyer) => void }) {
  return (
    <TouchableOpacity style={[styles.card, lawyer.featured && styles.cardFeatured]} onPress={() => onView(lawyer)} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: lawyer.avatarColor }]}>
          <Text style={styles.avatarText}>{lawyer.initials}</Text>
          {lawyer.online && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.lawyerName} numberOfLines={1}>{lawyer.name}</Text>
            {lawyer.verified && (
              <View style={styles.verifiedBadge}>
                <MaterialCommunityIcons name="check" size={9} color="#2ecc71" />
                <Text style={styles.verifiedText}>NBA</Text>
              </View>
            )}
          </View>
          <Text style={styles.lawyerFirm} numberOfLines={1}>{lawyer.firm}</Text>
        </View>
      </View>

      <View style={styles.tagRow}>
        {lawyer.specialties.map((s) => <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>)}
        {lawyer.featured && <View style={styles.featuredTag}><Text style={styles.featuredTagText}>★ Featured</Text></View>}
      </View>

      <View style={styles.metaRow}>
        {[
          { icon: 'map-marker-outline', text: lawyer.location },
          { icon: 'briefcase-outline', text: lawyer.experience },
          { icon: 'cash', text: lawyer.rate + '/session' },
        ].map((m) => (
          <View key={m.text} style={styles.metaItem}>
            <MaterialCommunityIcons name={m.icon as any} size={12} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{m.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.cardDivider} />
      <Text style={styles.bio} numberOfLines={2}>{lawyer.bio}</Text>

      <View style={styles.cardBottom}>
        <View style={styles.ratingRow}>
          <StarRating rating={lawyer.rating} />
          <Text style={styles.ratingNum}>{lawyer.rating} ({lawyer.reviews})</Text>
        </View>
        <View style={styles.cardActions}>
          {lawyer.whatsapp && (
            <TouchableOpacity
              style={styles.waBtn}
              onPress={(e) => { e.stopPropagation?.(); Linking.openURL(`https://wa.me/${lawyer.whatsapp!.replace(/\D/g,'')}`); }}
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

function LawyerModal({ lawyer, onClose, onBook }: { lawyer: Lawyer | null; onClose: () => void; onBook: (l: Lawyer) => void }) {
  if (!lawyer) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHandle} />
            <View style={[styles.modalAvatar, { backgroundColor: lawyer.avatarColor }]}>
              <Text style={styles.modalAvatarText}>{lawyer.initials}</Text>
            </View>
            <Text style={styles.modalName}>{lawyer.name}</Text>
            <Text style={styles.modalSub}>{lawyer.firm}</Text>

            <View style={styles.modalStats}>
              {[
                { num: lawyer.rating.toString(), label: 'Rating' },
                { num: lawyer.reviews.toString(), label: 'Reviews' },
                { num: lawyer.experience, label: 'Experience' },
              ].map((s) => (
                <View key={s.label} style={styles.modalStat}>
                  <Text style={styles.modalStatNum}>{s.num}</Text>
                  <Text style={styles.modalStatLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.modalSectionTitle}>Specialties</Text>
            <View style={[styles.tagRow, { marginBottom: 14 }]}>
              {lawyer.specialties.map((s) => <View key={s} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>)}
            </View>

            <Text style={styles.modalSectionTitle}>About</Text>
            <Text style={styles.modalBio}>{lawyer.bio}</Text>

            <Text style={styles.modalSectionTitle}>Details</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="map-marker-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{lawyer.location}</Text>
              </View>
              <View style={styles.metaItem}>
                <MaterialCommunityIcons name="cash" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{lawyer.rate} per session</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.bookBtn} onPress={() => onBook(lawyer)}>
                <Text style={styles.bookBtnText}>Book Consultation</Text>
              </TouchableOpacity>
              {lawyer.whatsapp && (
                <TouchableOpacity style={styles.waBtnFull} onPress={() => Linking.openURL(`https://wa.me/${lawyer.whatsapp!.replace(/\D/g,'')}`)} >
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

function BookingModal({ lawyer, onClose }: { lawyer: Lawyer | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  if (!lawyer) return null;

  function submit() {
    Alert.alert(
      'Request Sent ✓',
      `Your request has been sent to ${lawyer.name}. They will contact you within 24 hours via the Messages tab.`,
      [{ text: 'OK', onPress: onClose }],
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalName}>Book {lawyer.name}</Text>
          <Text style={styles.modalSub}>{lawyer.rate} per session</Text>

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
            <TouchableOpacity style={[styles.bookBtn, !note.trim() && { opacity: 0.45 }]} onPress={submit} disabled={!note.trim()}>
              <Text style={styles.bookBtnText}>Send Request</Text>
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
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [profileLawyer, setProfileLawyer] = useState<Lawyer | null>(null);
  const [bookingLawyer, setBookingLawyer] = useState<Lawyer | null>(null);

  const filtered = LAWYERS.filter((l) => {
    const byFilter = filter === 'All' || l.specialties.some((s) => s === filter);
    const bySearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.specialties.join(' ').toLowerCase().includes(search.toLowerCase());
    return byFilter && bySearch;
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find a Lawyer</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={18} color={COLORS.textSecondary} />
            <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search by name or specialty…" placeholderTextColor={COLORS.textSecondary} />
          </View>
        </View>

        <View style={styles.statsBar}>
          {[{ num: '247', label: 'Lawyers' }, { num: '36', label: 'States' }, { num: '4.8★', label: 'Avg Rating' }].map((s, i) => (
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
          {filtered.map((l) => <LawyerCard key={l.id} lawyer={l} onView={setProfileLawyer} />)}
          {!filtered.length && (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-search-outline" size={44} color={COLORS.border} />
              <Text style={styles.emptyText}>No lawyers match your search</Text>
            </View>
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
  cardFeatured: { borderColor: `${COLORS.accent}50` },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  onlineDot: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#2ecc71', borderWidth: 2, borderColor: COLORS.surface },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 2 },
  lawyerName: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(46,204,113,0.1)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(46,204,113,0.25)' },
  verifiedText: { fontSize: 10, color: '#2ecc71', fontWeight: '700' },
  lawyerFirm: { fontSize: 12, color: COLORS.textSecondary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  tag: { backgroundColor: `${COLORS.primary}18`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.primary}30` },
  tagText: { fontSize: 11, color: COLORS.primary, fontWeight: '600' },
  featuredTag: { backgroundColor: `${COLORS.accent}18`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.accent}35` },
  featuredTagText: { fontSize: 11, color: COLORS.accent, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.textSecondary },
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginBottom: 10 },
  bio: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 12 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stars: { flexDirection: 'row', gap: 1 },
  ratingNum: { fontSize: 12, color: COLORS.textSecondary },
  cardActions: { flexDirection: 'row', gap: 8 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(37,211,102,0.1)', borderWidth: 1, borderColor: 'rgba(37,211,102,0.25)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  waBtnText: { fontSize: 12, color: '#25d366', fontWeight: '600' },
  viewBtn: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  viewBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 15, color: COLORS.textSecondary },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 20 },
  modalAvatar: { width: 72, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  modalAvatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  modalName: { fontSize: 21, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 4 },
  modalSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16 },
  modalStats: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 12, overflow: 'hidden', marginBottom: 18 },
  modalStat: { flex: 1, padding: 12, alignItems: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: COLORS.border },
  modalStatNum: { fontSize: 17, fontWeight: '800', color: COLORS.primary },
  modalStatLabel: { fontSize: 10, color: COLORS.textSecondary, textTransform: 'uppercase' },
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
