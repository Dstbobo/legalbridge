import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/theme';

const REQUESTS = [
  {
    id: '1',
    name: 'Emeka Okafor',
    issue: 'Land dispute with neighbour over boundary in Lekki. Need legal advice urgently.',
    time: '2 min ago',
    status: 'new',
  },
  {
    id: '2',
    name: 'Fatima Bello',
    issue: 'Employer terminated my contract without notice. Seeking representation.',
    time: '18 min ago',
    status: 'new',
  },
  {
    id: '3',
    name: 'Chukwudi Nwachukwu',
    issue: 'Business partner dispute. Need NDA and partnership dissolution agreement.',
    time: '1 hr ago',
    status: 'pending',
  },
];

const ACTIVE_CLIENTS = [
  { id: '4', name: 'Adaeze Mba', matter: 'Property Conveyancing — Ikeja', lastActive: 'Today' },
  { id: '5', name: 'Tunde Adeyemi', matter: 'Employment Tribunal — NLRC', lastActive: 'Yesterday' },
  { id: '6', name: 'Grace Okonkwo', matter: 'Company Incorporation — Lagos', lastActive: '3 days ago' },
];

export default function ClientsScreen({ embedded }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, !embedded && { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          <Text style={{ color: COLORS.text }}>Legal</Text>
          <Text style={{ color: COLORS.accent, fontStyle: 'italic' }}>Bridge</Text>
        </Text>
        <Text style={styles.headerSub}>My Clients</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* New requests */}
        <Text style={styles.sectionLabel}>NEW REQUESTS</Text>
        {REQUESTS.map((r) => (
          <View key={r.id} style={styles.requestCard}>
            <View style={styles.requestTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{r.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.requestHeader}>
                  <Text style={styles.requestName}>{r.name}</Text>
                  <View style={[styles.statusBadge, r.status === 'new' && styles.statusNew]}>
                    <Text style={[styles.statusText, r.status === 'new' && styles.statusNewText]}>
                      {r.status === 'new' ? 'New' : 'Pending'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.requestTime}>{r.time}</Text>
              </View>
            </View>
            <Text style={styles.requestIssue} numberOfLines={2}>{r.issue}</Text>
            <View style={styles.requestActions}>
              <TouchableOpacity
                style={styles.acceptBtn}
                activeOpacity={0.85}
                onPress={() => Alert.alert('Request Accepted', `You have accepted ${r.name}'s consultation request. They will be notified.`)}
              >
                <MaterialCommunityIcons name="check" size={16} color="#fff" />
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.declineBtn}
                activeOpacity={0.85}
                onPress={() => Alert.alert('Request Declined', 'The client will be notified.')}
              >
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewBtn}
                activeOpacity={0.85}
                onPress={() => Alert.alert('View Details', r.issue)}
              >
                <Text style={styles.viewText}>Details</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Active clients */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ACTIVE CLIENTS</Text>
        {ACTIVE_CLIENTS.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={styles.clientRow}
            activeOpacity={0.8}
            onPress={() => Alert.alert(c.name, c.matter)}
          >
            <View style={[styles.avatar, styles.avatarSmall]}>
              <Text style={[styles.avatarText, { fontSize: 13 }]}>{c.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clientName}>{c.name}</Text>
              <Text style={styles.clientMatter} numberOfLines={1}>{c.matter}</Text>
            </View>
            <View style={styles.clientMeta}>
              <Text style={styles.clientLast}>{c.lastActive}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.border} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.registerNote}>
          <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.primary} />
          <Text style={styles.registerNoteText}>
            Make sure your lawyer profile is listed so clients can find and book you.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: COLORS.textSecondary,
    letterSpacing: 1.2, paddingBottom: 6,
  },
  requestCard: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 14, gap: 10,
  },
  requestTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarSmall: { width: 38, height: 38, borderRadius: 19 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  requestHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  requestName: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, backgroundColor: COLORS.secondary,
  },
  statusNew: { backgroundColor: '#fef3c7' },
  statusText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  statusNewText: { color: '#b45309' },
  requestTime: { fontSize: 11, color: COLORS.textSecondary },
  requestIssue: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  declineBtn: {
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 8, paddingHorizontal: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  declineText: { color: COLORS.error, fontWeight: '600', fontSize: 13 },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginLeft: 'auto' as any, paddingVertical: 8,
  },
  viewText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 14,
  },
  clientName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  clientMatter: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  clientMeta: { alignItems: 'flex-end', gap: 2 },
  clientLast: { fontSize: 11, color: COLORS.textSecondary },
  registerNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: `${COLORS.primary}0d`, borderRadius: 12,
    borderWidth: 1, borderColor: `${COLORS.primary}30`,
    padding: 14, marginTop: 8,
  },
  registerNoteText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },
});
