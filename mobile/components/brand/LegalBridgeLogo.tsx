import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/theme';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  dark?: boolean;
}

const SIZES = { sm: 18, md: 24, lg: 32 };

/**
 * LegalBridge wordmark logo — "Legal*Bridge*" with italic Bridge in accent gold.
 * Single source of truth: used in header, landing, drawer.
 */
export function LegalBridgeLogo({ size = 'md', dark = false }: Props) {
  const fontSize = SIZES[size];
  const color = dark ? '#ffffff' : COLORS.text;

  return (
    <View style={styles.row}>
      <Text style={[styles.base, { fontSize, color }]}>Legal</Text>
      <Text style={[styles.italic, { fontSize, color: COLORS.accent }]}>Bridge</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline' },
  base: { fontWeight: '700', letterSpacing: -0.3 },
  italic: { fontWeight: '700', fontStyle: 'italic', letterSpacing: -0.3 },
});
