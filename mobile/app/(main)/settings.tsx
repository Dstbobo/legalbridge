import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Switch, Share, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/services/auth.service';
import { COLORS } from '@/constants/theme';
import { ROLE_LABELS, isLawyer } from '@/constants/roles';

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function SettingsRow({
  icon, label, sublabel, onPress, right, color, last,
}: {
  icon: string; label: string; sublabel?: string;
  onPress?: () => void; right?: React.ReactNode;
  color?: string; last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${color ?? COLORS.primary}18` }]}>
        <MaterialCommunityIcons name={icon as any} size={19} color={color ?? COLORS.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, color === COLORS.error && { color: COLORS.error }]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSub}>{sublabel}</Text> : null}
      </View>
      {right ?? (onPress ? <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.border} /> : null)}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifUpdates, setNotifUpdates] = useState(true);
  const [notifNews, setNotifNews] = useState(false);

  const initials = (user?.fullName ?? user?.email ?? 'U')
    .split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const roleLabel = user?.role ? ROLE_LABELS[user.role] : 'General User';

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          await clearAuth();
          router.replace('/(auth)/landing');
        },
      },
    ]);
  }

  async function handleShare() {
    try {
      await Share.share({
        message: 'Try LegalBridge — Nigerian law research and legal guidance in your pocket. Built for lawyers, law students, and everyday Nigerians.',
      });
    } catch {}
  }

  function soon(feature?: string) {
    Alert.alert('Coming Soon', `${feature ?? 'This feature'} will be available in the next update.`);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile card ─────────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitials}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.fullName ?? 'User'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.editBadge}
            onPress={() => soon('Edit profile')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="pencil-outline" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Account ──────────────────────────────────────────────── */}
        <SectionTitle label="Account" />
        <View style={styles.card}>
          <SettingsRow
            icon="account-edit-outline"
            label="Edit Profile"
            sublabel="Name, phone number, state"
            onPress={() => soon('Edit profile')}
          />
          <SettingsRow
            icon="lock-outline"
            label="Change Password"
            sublabel="Update your login password"
            onPress={() => soon('Change password')}
          />
          <SettingsRow
            icon="shield-key-outline"
            label="Two-Factor Authentication"
            sublabel="Add extra security to your account"
            onPress={() => soon('Two-factor authentication')}
          />
          <SettingsRow
            icon="map-marker-outline"
            label="Location / State"
            sublabel={user?.state ?? 'Not set'}
            onPress={() => soon('Location settings')}
            last
          />
        </View>

        {/* ── Lawyer profile (lawyers only) ─────────────────────────── */}
        {isLawyer(user?.role) && (
          <>
            <SectionTitle label="Lawyer Profile" />
            <View style={styles.card}>
              <SettingsRow
                icon="briefcase-account-outline"
                label="My Listing"
                sublabel="Edit your public lawyer profile"
                onPress={() => soon('Lawyer profile')}
              />
              <SettingsRow
                icon="certificate-outline"
                label="Bar Details"
                sublabel={user?.barNumber ? `Bar No. ${user.barNumber}` : 'Add your bar number'}
                onPress={() => soon('Bar details')}
              />
              <SettingsRow
                icon="star-outline"
                label="Boost Profile"
                sublabel="Appear at the top of search results"
                onPress={() => soon('Profile boost')}
                last
              />
            </View>
          </>
        )}

        {/* ── My content ───────────────────────────────────────────── */}
        <SectionTitle label="My Content" />
        <View style={styles.card}>
          <SettingsRow
            icon="history"
            label="Chat History"
            sublabel="All your past conversations"
            onPress={() => router.push('/(main)/history')}
          />
          <SettingsRow
            icon="file-document-multiple-outline"
            label="My Documents"
            sublabel="Drafted and saved documents"
            onPress={() => router.push('/(main)/documents')}
          />
          <SettingsRow
            icon="check-decagram-outline"
            label="Registrations & Compliance"
            sublabel="CAC, FIRS, NAFDAC and more"
            onPress={() => soon('Registrations & Compliance')}
            last
          />
        </View>

        {/* ── Notifications ─────────────────────────────────────────── */}
        <SectionTitle label="Notifications" />
        <View style={styles.card}>
          <SettingsRow
            icon="message-badge-outline"
            label="Messages"
            sublabel="New messages from lawyers"
            right={
              <Switch
                value={notifMessages}
                onValueChange={setNotifMessages}
                trackColor={{ true: COLORS.primary, false: COLORS.border }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon="bell-outline"
            label="App Updates"
            sublabel="New features and improvements"
            right={
              <Switch
                value={notifUpdates}
                onValueChange={setNotifUpdates}
                trackColor={{ true: COLORS.primary, false: COLORS.border }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon="newspaper-variant-outline"
            label="Legal News"
            sublabel="Daily Nigerian legal news digest"
            right={
              <Switch
                value={notifNews}
                onValueChange={setNotifNews}
                trackColor={{ true: COLORS.primary, false: COLORS.border }}
                thumbColor="#fff"
              />
            }
            last
          />
        </View>

        {/* ── Support ───────────────────────────────────────────────── */}
        <SectionTitle label="Support" />
        <View style={styles.card}>
          <SettingsRow
            icon="help-circle-outline"
            label="Help Center"
            sublabel="FAQs and how-to guides"
            onPress={() => soon('Help Center')}
          />
          <SettingsRow
            icon="chat-question-outline"
            label="Contact Us"
            sublabel="Reach the LegalBridge team"
            onPress={() => Linking.openURL('mailto:support@legalbridge.ng')}
          />
          <SettingsRow
            icon="star-outline"
            label="Rate the App"
            sublabel="Leave a review on Google Play"
            onPress={() => soon('Rate app')}
          />
          <SettingsRow
            icon="share-variant-outline"
            label="Share LegalBridge"
            sublabel="Tell your colleagues and friends"
            onPress={handleShare}
            last
          />
        </View>

        {/* ── Legal ─────────────────────────────────────────────────── */}
        <SectionTitle label="Legal" />
        <View style={styles.card}>
          <SettingsRow
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => router.push('/(legal)/privacy')}
          />
          <SettingsRow
            icon="file-document-outline"
            label="Terms of Service"
            onPress={() => router.push('/(legal)/terms')}
            last
          />
        </View>

        {/* ── About ─────────────────────────────────────────────────── */}
        <SectionTitle label="About" />
        <View style={styles.card}>
          <SettingsRow
            icon="information-outline"
            label="About LegalBridge"
            sublabel="Built for Nigerian law by DST Global"
            onPress={() => Alert.alert('About LegalBridge', 'LegalBridge v1.0.0\n\nBuilt by DST Global Innovative Nigeria Ltd.\n\nAI-powered legal research, document drafting, and lawyer connections for every Nigerian.')}
          />
          <SettingsRow
            icon="tag-outline"
            label="Version"
            sublabel="1.0.0 (build 9)"
            last
          />
        </View>

        {/* ── Sign out ──────────────────────────────────────────────── */}
        <View style={[styles.card, styles.logoutCard]}>
          <SettingsRow
            icon="logout"
            label="Sign Out"
            color={COLORS.error}
            onPress={handleLogout}
            last
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },

  scroll: { padding: 16 },

  // Profile card
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, marginBottom: 24,
  },
  profileAvatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  profileInitials: { color: '#fff', fontSize: 24, fontWeight: '800' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  profileEmail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, marginBottom: 6 },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.secondary, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.border,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  editBadge: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  // Section
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginTop: 4, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', marginBottom: 20,
  },
  logoutCard: { marginBottom: 8 },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rowSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
});
