import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/constants/theme';

type FeedCategory = 'all' | 'court' | 'legal' | 'government';

const FEED_ITEMS = [
  {
    id: '1',
    category: 'court',
    categoryLabel: 'COURT RULING',
    categoryColor: '#7b2d8b',
    title: 'Supreme Court Upholds Right to Peaceful Protest in Landmark Ruling',
    summary: 'The Supreme Court of Nigeria in a 5-2 majority decision affirmed that Section 40 of the 1999 Constitution guarantees the right to peaceful assembly and cannot be limited by state governors.',
    date: 'Jun 28, 2026',
    source: 'Supreme Court of Nigeria',
    icon: 'gavel',
  },
  {
    id: '2',
    category: 'legal',
    categoryLabel: 'LEGAL NEWS',
    categoryColor: COLORS.primary,
    title: 'NBA Announces New Mandatory CLE Requirements for 2026',
    summary: 'The Nigerian Bar Association has updated its Continuing Legal Education requirements. All practising lawyers must complete 20 CLE hours by December 2026, including 5 hours of ethics training.',
    date: 'Jun 27, 2026',
    source: 'Nigerian Bar Association',
    icon: 'scale-balance',
  },
  {
    id: '3',
    category: 'government',
    categoryLabel: 'GOVERNMENT',
    categoryColor: '#b45309',
    title: 'President Signs New Companies and Allied Matters Act Amendment',
    summary: 'The President has signed into law the CAMA Amendment Act 2026, reducing business registration timelines from 14 days to 48 hours and introducing single-member company provisions.',
    date: 'Jun 26, 2026',
    source: 'State House, Abuja',
    icon: 'bank-outline',
  },
  {
    id: '4',
    category: 'court',
    categoryLabel: 'COURT RULING',
    categoryColor: '#7b2d8b',
    title: 'Court of Appeal: Landlords Cannot Evict Without 6 Months Notice in Lagos',
    summary: 'The Lagos Division of the Court of Appeal has ruled that the Lagos State Tenancy Law 2011 requires a minimum of 6 months written notice before eviction proceedings, regardless of rent arrears.',
    date: 'Jun 25, 2026',
    source: 'Court of Appeal, Lagos',
    icon: 'gavel',
  },
  {
    id: '5',
    category: 'legal',
    categoryLabel: 'LEGAL NEWS',
    categoryColor: COLORS.primary,
    title: 'NCC Issues New Data Protection Compliance Guidelines',
    summary: 'The Nigerian Communications Commission has released updated guidelines requiring all telecoms and fintech companies to achieve full NDPA compliance by Q3 2026 or face fines of up to ₦10 million.',
    date: 'Jun 24, 2026',
    source: 'Nigerian Communications Commission',
    icon: 'shield-check-outline',
  },
  {
    id: '6',
    category: 'government',
    categoryLabel: 'GOVERNMENT',
    categoryColor: '#b45309',
    title: 'National Assembly Passes Electoral Amendment Bill — Third Reading',
    summary: 'The National Assembly has passed the Electoral Act Amendment Bill 2026 at third reading. Key provisions include mandatory electronic transmission of results and a 72-hour window for pre-election matter hearings.',
    date: 'Jun 23, 2026',
    source: 'National Assembly, Abuja',
    icon: 'bank-outline',
  },
  {
    id: '7',
    category: 'court',
    categoryLabel: 'COURT RULING',
    categoryColor: '#7b2d8b',
    title: 'Federal High Court: Crypto Exchanges Must Register with SEC',
    summary: 'Justice Taiwo of the Federal High Court Abuja has held that virtual asset service providers operating in Nigeria must register with the Securities and Exchange Commission under the Investments and Securities Act.',
    date: 'Jun 22, 2026',
    source: 'Federal High Court, Abuja',
    icon: 'gavel',
  },
  {
    id: '8',
    category: 'legal',
    categoryLabel: 'LEGAL NEWS',
    categoryColor: COLORS.primary,
    title: 'EFCC Secures Record ₦4.2 Billion Fraud Recovery in Q2 2026',
    summary: 'The Economic and Financial Crimes Commission has announced a record ₦4.2 billion asset recovery in Q2 2026, with 847 convictions secured across its Lagos, Abuja, and Port Harcourt zonal offices.',
    date: 'Jun 21, 2026',
    source: 'EFCC',
    icon: 'scale-balance',
  },
];

const FILTERS: { id: FeedCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'court', label: 'Court Rulings' },
  { id: 'legal', label: 'Legal News' },
  { id: 'government', label: 'Government' },
];

export default function DiscoveryScreen({ embedded }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FeedCategory>('all');

  const items = filter === 'all' ? FEED_ITEMS : FEED_ITEMS.filter((i) => i.category === filter);

  return (
    <View style={[styles.root, !embedded && { paddingTop: insets.top }]}>
      {/* Filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterBar}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            onPress={() => setFilter(f.id)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Feed */}
      <ScrollView
        style={styles.feed}
        contentContainerStyle={styles.feedContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => {}}
          >
            <View style={styles.cardTop}>
              <View style={[styles.categoryBadge, { backgroundColor: `${item.categoryColor}18` }]}>
                <MaterialCommunityIcons name={item.icon as any} size={12} color={item.categoryColor} />
                <Text style={[styles.categoryLabel, { color: item.categoryColor }]}>{item.categoryLabel}</Text>
              </View>
              <Text style={styles.cardDate}>{item.date}</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>
            <View style={styles.cardFooter}>
              <MaterialCommunityIcons name="source-repository" size={13} color={COLORS.textSecondary} />
              <Text style={styles.cardSource}>{item.source}</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.readMore}>Read more</Text>
              <MaterialCommunityIcons name="arrow-right" size={14} color={COLORS.primary} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.endNote}>
          <MaterialCommunityIcons name="update" size={16} color={COLORS.textSecondary} />
          <Text style={styles.endNoteText}>Updated daily · Nigerian law sources only</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterBar: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
    gap: 8, alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignSelf: 'flex-start',
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600', lineHeight: 18 },
  filterTextActive: { color: '#fff' },
  feed: { flex: 1 },
  feedContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, gap: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  categoryLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  cardDate: { fontSize: 11, color: COLORS.textSecondary },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, lineHeight: 22 },
  cardSummary: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  cardSource: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  readMore: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  endNote: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 16,
  },
  endNoteText: { fontSize: 12, color: COLORS.textSecondary },
});
