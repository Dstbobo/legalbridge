import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/theme';

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.date}>Last updated: June 2026</Text>
        <Text style={styles.body}>
          By using LegalBridge you agree to these terms.{'\n\n'}
          LegalBridge AI provides general legal information about Nigerian law. It does not constitute legal advice and does not create an attorney-client relationship.{'\n\n'}
          Generated legal documents are templates. You should have documents reviewed by a licensed Nigerian lawyer before use in formal proceedings.{'\n\n'}
          You must not use LegalBridge for any illegal purpose or to harass others.{'\n\n'}
          DST Global Innovative Nigeria Ltd reserves the right to suspend accounts that violate these terms.{'\n\n'}
          Contact: support@legalbridge.ng
        </Text>
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
  scroll: { padding: 24 },
  date: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 },
  body: { fontSize: 15, color: COLORS.text, lineHeight: 24 },
});
