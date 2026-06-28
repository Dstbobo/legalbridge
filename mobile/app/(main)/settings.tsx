import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { TextInput, Button, Divider } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { supabase } from '@/services/auth.service';
import { COLORS } from '@/constants/theme';
import { ROLE_LABELS } from '@/constants/roles';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [saving, setSaving] = useState(false);

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          await clearAuth();
          router.replace('/(auth)/landing');
        },
      },
    ]);
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

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        {/* Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(user?.fullName ?? user?.email ?? 'U')[0].toUpperCase()}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user?.fullName ?? 'User'}</Text>
                <Text style={styles.profileEmail}>{user?.email}</Text>
              </View>
            </View>
            <Divider style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Role</Text>
              <Text style={styles.infoValue}>{user?.role ? ROLE_LABELS[user.role] : '—'}</Text>
            </View>
            {user?.state && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>State</Text>
                <Text style={styles.infoValue}>{user.state}</Text>
              </View>
            )}
            {user?.barNumber && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Bar Number</Text>
                <Text style={styles.infoValue}>{user.barNumber}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Navigation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>More</Text>
          <View style={styles.card}>
            {[
              { label: 'Find a Lawyer', icon: 'account-search', route: '/(main)/lawyers' as const },
              { label: 'Privacy Policy', icon: 'shield-outline', route: '/(legal)/privacy' as const },
              { label: 'Terms of Service', icon: 'file-document-outline', route: '/(legal)/terms' as const },
            ].map(({ label, icon, route }) => (
              <TouchableOpacity key={label} style={styles.navRow} onPress={() => router.push(route)} activeOpacity={0.7}>
                <MaterialCommunityIcons name={icon as any} size={20} color={COLORS.primary} />
                <Text style={styles.navLabel}>{label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.border} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <Button
            mode="outlined"
            onPress={handleLogout}
            textColor={COLORS.error}
            style={styles.logoutBtn}
            icon="logout"
          >
            Sign Out
          </Button>
        </View>

        <Text style={styles.version}>LegalBridge v1.0.0 · DST Global Innovative Nigeria Ltd</Text>
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
  scroll: { padding: 16, gap: 0 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  profileEmail: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  divider: { marginHorizontal: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  infoLabel: { fontSize: 14, color: COLORS.textSecondary },
  infoValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  navLabel: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  logoutBtn: { borderColor: COLORS.error, borderRadius: 12 },
  version: { textAlign: 'center', fontSize: 12, color: COLORS.textTertiary, marginTop: 8 },
});
