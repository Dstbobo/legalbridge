import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/theme';

/**
 * Google Sign-In lands here for a split second while WebBrowser.openAuthSessionAsync
 * (in auth.service.ts) captures the redirect and the caller (landing.tsx) navigates
 * onward. Without this screen, Expo Router briefly shows its "Unmatched Route" page.
 */
export default function AuthCallbackScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
});
