import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  FlatList, RefreshControl, ActivityIndicator, Image, Modal, TextInput, Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import SecureMarkdown from '@/components/SecureMarkdown';
import { COLORS } from '@/constants/theme';
import { streamChat } from '@/services/chat.service';

/** Open an article INSIDE the app (Perplexity-style sheet), not external Chrome. */
function openInApp(url: string) {
  WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    toolbarColor: COLORS.surface,
    controlsColor: COLORS.primary,
    enableBarCollapsing: true,
    showTitle: true,
  }).catch(() => Linking.openURL(url).catch(() => {}));
}
import {
  fetchNews, fetchForYou, fetchOpportunities, fetchBookmarkIds, toggleBookmark,
  fetchBookmarkedArticles, fetchAiSummary, PAGE_SIZE,
  type NewsArticle, type Opportunity,
} from '@/services/news.service';
import { useAuthStore } from '@/stores/auth.store';

type TabId = 'foryou' | 'all' | 'legal' | 'government' | 'business' | 'economy' | 'opportunities' | 'saved';

const TABS: { id: TabId; label: string }[] = [
  { id: 'foryou', label: 'For You' },
  { id: 'all', label: 'Top Stories' },
  { id: 'legal', label: 'Legal' },
  { id: 'government', label: 'Government' },
  { id: 'business', label: 'Business' },
  { id: 'economy', label: 'Economy' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'saved', label: 'Saved' },
];

const CAT_META: Record<string, { label: string; color: string; icon: string }> = {
  legal: { label: 'LEGAL', color: '#7b2d8b', icon: 'gavel' },
  government: { label: 'GOVERNMENT', color: '#b45309', icon: 'bank-outline' },
  business: { label: 'BUSINESS', color: '#0e7490', icon: 'briefcase-outline' },
  economy: { label: 'ECONOMY', color: '#15803d', icon: 'chart-line' },
  general: { label: 'NIGERIA', color: COLORS.primary, icon: 'newspaper-variant-outline' },
};

const KIND_META: Record<string, { label: string; color: string; icon: string }> = {
  grant: { label: 'GRANT', color: '#15803d', icon: 'hand-coin-outline' },
  job: { label: 'JOB', color: '#0e7490', icon: 'briefcase-outline' },
  scholarship: { label: 'SCHOLARSHIP', color: '#7b2d8b', icon: 'school-outline' },
  tender: { label: 'TENDER', color: '#b45309', icon: 'file-sign' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  if (d < 7 * 86400) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function deadlineLabel(deadline: string | null): { text: string; urgent: boolean } {
  if (!deadline) return { text: 'Ongoing', urgent: false };
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: 'Closed', urgent: false };
  if (days === 0) return { text: 'Closes today', urgent: true };
  if (days <= 7) return { text: `${days} day${days > 1 ? 's' : ''} left`, urgent: true };
  return { text: `Deadline: ${new Date(deadline).toLocaleDateString()}`, urgent: false };
}

// ── Perplexity-style in-app article reader ──────────────────────────────────
interface FollowUp { q: string; a: string; streaming: boolean }

function ArticleReader({ article, onClose, bookmarked, onBookmark }: {
  article: NewsArticle; onClose: () => void; bookmarked: boolean; onBookmark: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [question, setQuestion] = useState('');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [mode, setMode] = useState<'summary' | 'report'>('summary');
  const [askOpen, setAskOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const meta = CAT_META[article.category] ?? CAT_META.general;

  // The AI returns "summary ---FULL REPORT--- full report" in one cached blob.
  const [summaryPart, reportPart] = React.useMemo(() => {
    const i = report.indexOf('---FULL REPORT---');
    if (i === -1) return [report, ''] as const;
    return [report.slice(0, i).trim(), report.slice(i + 17).trim()] as const;
  }, [report]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(''); setReport(''); setFollowUps([]);
    fetchAiSummary(article.id)
      .then((s) => { if (!cancelled) { setReport(s); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setLoadError(String(e?.message ?? e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [article.id]);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setQuestion('');
    setFollowUps((prev) => [...prev, { q, a: '', streaming: true }]);
    const idx = followUps.length;

    const prior = followUps.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n');
    const message =
      `I am reading this news article in LegalBridge:\n` +
      `Title: "${article.title}" (Source: ${article.source})\n` +
      `Report:\n${report.slice(0, 2500)}\n` +
      (prior ? `Our discussion so far:\n${prior}\n` : '') +
      `\nMy question about this article: ${q}\n` +
      `Answer clearly and simply, based on the article context. If the question goes beyond the article, say what is known and be careful not to invent facts.`;

    try {
      await streamChat(message, `news_${article.id}`, (chunk) => {
        setFollowUps((prev) => {
          const next = prev.slice();
          if (next[idx]) next[idx] = { ...next[idx], a: next[idx].a + chunk };
          return next;
        });
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    } catch {
      setFollowUps((prev) => {
        const next = prev.slice();
        if (next[idx] && !next[idx].a) next[idx] = { ...next[idx], a: 'Sorry — could not get an answer. Please try again.' };
        return next;
      });
    } finally {
      setFollowUps((prev) => {
        const next = prev.slice();
        if (next[idx]) next[idx] = { ...next[idx], streaming: false };
        return next;
      });
    }
  }, [question, followUps, article, report]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={[styles.readerRoot, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.readerHeader}>
            <TouchableOpacity onPress={onClose} style={styles.readerHeaderBtn} hitSlop={8}>
              <MaterialCommunityIcons name="chevron-down" size={28} color={COLORS.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onBookmark} style={styles.readerHeaderBtn} hitSlop={8}>
              <MaterialCommunityIcons
                name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={bookmarked ? COLORS.primary : COLORS.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => openInApp(article.article_url)}
              style={styles.readerHeaderBtn}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="open-in-new" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {!!article.image_url && (
              <Image source={{ uri: article.image_url }} style={styles.readerImage} resizeMode="cover" />
            )}
            <View style={styles.readerBody}>
              <View style={styles.sourceRow}>
                <SourceAvatar source={article.source} color={meta.color} />
                <Text style={styles.sourceName} numberOfLines={1}>{article.source}</Text>
                <Text style={styles.sourceDot}>·</Text>
                <Text style={styles.sourceTime}>{timeAgo(article.published_at)}</Text>
              </View>
              <Text style={styles.readerTitle}>{article.title}</Text>

              {loading ? (
                <View style={styles.readerLoading}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.readerLoadingText}>Preparing your report…</Text>
                </View>
              ) : loadError ? (
                <View style={styles.readerLoading}>
                  <Text style={styles.readerLoadingText}>
                    Could not prepare the report. You can still read the original article.
                  </Text>
                </View>
              ) : (
                <SecureMarkdown style={readerMd}>
                  {mode === 'report' && reportPart ? reportPart : summaryPart}
                </SecureMarkdown>
              )}

              <TouchableOpacity style={styles.readOriginalBtn} onPress={() => openInApp(article.article_url)}>
                <MaterialCommunityIcons name="newspaper-variant-outline" size={17} color={COLORS.primary} />
                <Text style={styles.readOriginalText}>Read the original on {article.source}</Text>
                <MaterialCommunityIcons name="open-in-new" size={15} color={COLORS.primary} />
              </TouchableOpacity>

              {/* Follow-up conversation */}
              {followUps.map((f, i) => (
                <View key={i} style={styles.followUpBlock}>
                  <View style={styles.followUpQ}>
                    <Text style={styles.followUpQText}>{f.q}</Text>
                  </View>
                  {f.a ? (
                    <SecureMarkdown style={readerMd}>{f.a + (f.streaming ? ' ▋' : '')}</SecureMarkdown>
                  ) : (
                    <ActivityIndicator style={{ alignSelf: 'flex-start', marginTop: 8 }} color={COLORS.primary} />
                  )}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Bottom bar: floating pills, or the ask input when open */}
          {askOpen ? (
            <View style={[styles.askSheet, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <View style={styles.askChip}>
                {!!article.image_url && (
                  <Image source={{ uri: article.image_url }} style={styles.askChipImg} />
                )}
                <Text style={styles.askChipText} numberOfLines={2}>{article.title}</Text>
                <TouchableOpacity onPress={() => { setAskOpen(false); setQuestion(''); }} hitSlop={8}>
                  <MaterialCommunityIcons name="close" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.followUpBarInner}>
                <TextInput
                  ref={inputRef}
                  style={styles.followUpInput}
                  value={question}
                  onChangeText={setQuestion}
                  placeholder="Ask a follow up"
                  placeholderTextColor={COLORS.textSecondary}
                  multiline
                  maxLength={500}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.followUpSend, !question.trim() && { opacity: 0.4 }]}
                  onPress={ask}
                  disabled={!question.trim()}
                >
                  <MaterialCommunityIcons name="arrow-up" size={19} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.pillBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <TouchableOpacity style={styles.pillBtn} onPress={() => setAskOpen(true)} activeOpacity={0.85}>
                {!!article.image_url && (
                  <Image source={{ uri: article.image_url }} style={styles.pillBtnImg} />
                )}
                <Text style={styles.pillBtnText}>Ask a follow up</Text>
              </TouchableOpacity>
              {!!reportPart && !loading && (
                <TouchableOpacity
                  style={styles.pillBtn}
                  onPress={() => setMode(mode === 'summary' ? 'report' : 'summary')}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons
                    name={mode === 'summary' ? 'text-box-outline' : 'format-list-bulleted'}
                    size={17}
                    color={COLORS.text}
                  />
                  <Text style={styles.pillBtnText}>{mode === 'summary' ? 'Full report' : 'Summary'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SourceAvatar({ source, color }: { source: string; color: string }) {
  return (
    <View style={[styles.sourceAvatar, { backgroundColor: color }]}>
      <Text style={styles.sourceAvatarText}>{source.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function NewsCard({ item, bookmarked, onBookmark, onOpen }: {
  item: NewsArticle; bookmarked: boolean; onBookmark: () => void; onOpen: () => void;
}) {
  const meta = CAT_META[item.category] ?? CAT_META.general;
  const [imgFailed, setImgFailed] = React.useState(false);
  const hasImage = !!item.image_url && !imgFailed;

  return (
    <TouchableOpacity style={styles.flatCard} activeOpacity={0.9} onPress={onOpen}>
      {hasImage && (
        <View>
          <Image
            source={{ uri: item.image_url! }}
            style={styles.flatImage}
            resizeMode="cover"
            onError={() => setImgFailed(true)}
          />
          {/* Source chip overlaid on the photo, Perplexity-style */}
          <View style={styles.imageSourceChip}>
            <Text style={styles.imageSourceChipText} numberOfLines={1}>
              {item.source}
            </Text>
          </View>
        </View>
      )}
      <Text style={styles.flatTitle} numberOfLines={3}>{item.title}</Text>
      {!!item.summary && (
        <Text style={styles.flatSummary} numberOfLines={2}>
          {item.summary} <Text style={styles.seeMore}>See more</Text>
        </Text>
      )}
      <View style={styles.flatMetaRow}>
        <Text style={styles.sourceTime}>{timeAgo(item.published_at)}</Text>
        {!hasImage && (
          <>
            <Text style={styles.sourceDot}>·</Text>
            <Text style={styles.sourceName} numberOfLines={1}>{item.source}</Text>
          </>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onBookmark} hitSlop={12}>
          <MaterialCommunityIcons
            name={bookmarked ? 'bookmark' : 'bookmark-outline'}
            size={21}
            color={bookmarked ? COLORS.primary : COLORS.textSecondary}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.flatDivider} />
    </TouchableOpacity>
  );
}

function OpportunityCard({ item }: { item: Opportunity }) {
  const meta = KIND_META[item.kind] ?? KIND_META.grant;
  const dl = deadlineLabel(item.deadline);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.categoryBadge, { backgroundColor: `${meta.color}18` }]}>
          <MaterialCommunityIcons name={meta.icon as any} size={12} color={meta.color} />
          <Text style={[styles.categoryLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={[styles.cardDate, dl.urgent && { color: COLORS.error, fontWeight: '700' }]}>
          {dl.text}
        </Text>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardSource}>{item.organization}</Text>
      {!!item.summary && <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>}
      {!!item.amount && (
        <View style={styles.amountRow}>
          <MaterialCommunityIcons name="cash-multiple" size={15} color="#15803d" />
          <Text style={styles.amountText}>{item.amount}</Text>
        </View>
      )}
      {!!item.eligibility && (
        <Text style={styles.eligibility} numberOfLines={2}>Eligibility: {item.eligibility}</Text>
      )}
      <TouchableOpacity
        style={styles.applyBtn}
        onPress={() => openInApp(item.apply_url)}
        activeOpacity={0.85}
      >
        <Text style={styles.applyBtnText}>Apply / Learn more</Text>
        <MaterialCommunityIcons name="open-in-new" size={15} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

export default function DiscoveryScreen({ embedded, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
  const insets = useSafeAreaInsets();
  const userRole = useAuthStore((s) => s.user?.role);
  const [tab, setTab] = useState<TabId>('foryou');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [reading, setReading] = useState<NewsArticle | null>(null);

  const isOpps = tab === 'opportunities';
  const isSaved = tab === 'saved';

  const load = useCallback(async (reset: boolean, targetTab: TabId, targetPage: number) => {
    try {
      setErrorMsg('');
      if (targetTab === 'opportunities') {
        const data = await fetchOpportunities();
        setOpps(data);
        setHasMore(false);
      } else if (targetTab === 'saved') {
        const data = await fetchBookmarkedArticles();
        setArticles(data);
        setHasMore(false);
      } else if (targetTab === 'foryou') {
        const data = await fetchForYou(userRole, targetPage);
        setArticles((prev) => (reset ? data : [...prev, ...data]));
        setHasMore(data.length >= PAGE_SIZE - 2);
      } else {
        const data = await fetchNews(targetTab, targetPage);
        setArticles((prev) => (reset ? data : [...prev, ...data]));
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (e: any) {
      setErrorMsg('Could not load the feed. Check your connection and pull to refresh.');
    }
  }, [userRole]);

  // Initial + tab change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPage(0);
      await load(true, tab, 0);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tab, load]);

  // Bookmarks once
  useEffect(() => {
    fetchBookmarkIds().then(setBookmarks).catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(0);
    await load(true, tab, 0);
    fetchBookmarkIds().then(setBookmarks).catch(() => {});
    setRefreshing(false);
  }, [tab, load]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || !hasMore || isOpps || isSaved || loading) return;
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    await load(false, tab, next);
    setLoadingMore(false);
  }, [loadingMore, hasMore, isOpps, isSaved, loading, page, tab, load]);

  const onBookmark = useCallback(async (id: string) => {
    const had = bookmarks.has(id);
    setBookmarks((prev) => {
      const next = new Set(prev);
      had ? next.delete(id) : next.add(id);
      return next;
    });
    toggleBookmark(id, had).catch(() => {});
  }, [bookmarks]);

  const emptyText = isSaved
    ? 'No saved articles yet. Tap the bookmark icon on any article to save it.'
    : isOpps
      ? 'No opportunities published yet — new grants, jobs and scholarships appear here once verified.'
      : errorMsg || 'No articles yet. Pull down to refresh.';

  return (
    <View style={[styles.root, !embedded && { paddingTop: insets.top }]}>
      {/* Floating glass top: header + chips stay fixed, feed scrolls underneath */}
      <View style={[styles.floatingTop, !onBack && styles.floatingTopStatic, !!onBack && { paddingTop: insets.top }]}>
        {!!onBack && (
          <LinearGradient
            colors={[
              'rgba(240,242,247,0.98)',
              'rgba(240,242,247,0.94)',
              'rgba(240,242,247,0.75)',
              'rgba(240,242,247,0)',
            ]}
            locations={[0, 0.55, 0.8, 1]}
            style={styles.floatingTopFade}
            pointerEvents="none"
          />
        )}
        {!!onBack && (
          <View style={styles.pageHeader}>
            <TouchableOpacity style={styles.pageHeaderBtn} onPress={onBack} hitSlop={6}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.pageHeaderTitle}>Discover</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.pageHeaderBtn} onPress={() => setTab('saved')} hitSlop={6}>
              <MaterialCommunityIcons
                name={tab === 'saved' ? 'bookmark' : 'bookmark-multiple-outline'}
                size={22}
                color={tab === 'saved' ? COLORS.primary : COLORS.text}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterBar}
        >
          {TABS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, tab === f.id && styles.filterChipActive]}
              onPress={() => setTab(f.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, tab === f.id && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={isOpps ? (opps as any[]) : (articles as any[])}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            isOpps ? (
              <OpportunityCard item={item} />
            ) : (
              <NewsCard
                item={item}
                bookmarked={bookmarks.has(item.id)}
                onBookmark={() => onBookmark(item.id)}
                onOpen={() => setReading(item)}
              />
            )
          }
          contentContainerStyle={[styles.feedContent, !!onBack && { paddingTop: 108 + insets.top }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              progressViewOffset={onBack ? 108 + insets.top : 0}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={44} color={COLORS.border} />
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: 16 }} color={COLORS.primary} />
            ) : (
              <View style={styles.endNote}>
                <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.endNoteText}>
                  Headlines link to their original publishers. LegalBridge is independent and not
                  affiliated with any government entity or news organisation.
                </Text>
              </View>
            )
          }
        />
      )}

      {!!reading && (
        <ArticleReader
          article={reading}
          onClose={() => setReading(null)}
          bookmarked={bookmarks.has(reading.id)}
          onBookmark={() => onBookmark(reading.id)}
        />
      )}
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
  feedContent: { paddingHorizontal: 16, paddingTop: 8, gap: 16, paddingBottom: 40, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, gap: 8,
  },
  // ── Floating glass top (frosted panel; feed scrolls underneath) ──
  floatingTop: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    paddingBottom: 4,
  },
  floatingTopStatic: { position: 'relative' },
  // Gradient that melts into the feed — no hard bottom edge.
  floatingTopFade: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: -34,
  },
  // ── Discover page header ──
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2,
  },
  pageHeaderBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border,
  },
  pageHeaderTitle: { fontSize: 21, fontWeight: '800', color: COLORS.text },
  // ── Perplexity-style flat news card ──
  flatCard: { gap: 10 },
  flatImage: {
    width: '100%', height: 210, borderRadius: 18,
    backgroundColor: COLORS.surface,
  },
  imageSourceChip: {
    position: 'absolute', right: 10, bottom: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 4, maxWidth: '60%',
  },
  imageSourceChipText: { color: '#fff', fontSize: 11.5, fontWeight: '600' },
  flatTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, lineHeight: 27 },
  flatSummary: { fontSize: 14.5, color: COLORS.textSecondary, lineHeight: 21 },
  seeMore: { color: COLORS.textSecondary, fontWeight: '700' },
  flatMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flatDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border,
    marginTop: 12,
  },
  // (legacy hero card styles kept for reader)
  heroCard: {
    backgroundColor: COLORS.surface, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  heroImage: { width: '100%', height: 200, backgroundColor: COLORS.background },
  heroBody: { padding: 16, gap: 10 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sourceAvatar: {
    width: 20, height: 20, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  sourceAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  sourceName: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, maxWidth: '55%' },
  sourceDot: { fontSize: 13, color: COLORS.textSecondary },
  sourceTime: { fontSize: 13, color: COLORS.textSecondary },
  heroTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, lineHeight: 25 },
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
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amountText: { fontSize: 13.5, fontWeight: '800', color: '#15803d' },
  eligibility: { fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 18, fontStyle: 'italic' },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 11, marginTop: 4,
  },
  applyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  endNote: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    gap: 6, paddingVertical: 16, paddingHorizontal: 8,
  },
  endNoteText: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 16, flex: 1 },
  // ── Article reader ──
  readerRoot: { flex: 1, backgroundColor: COLORS.background },
  readerHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, gap: 4,
  },
  readerHeaderBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  readerImage: { width: '100%', height: 230, backgroundColor: COLORS.surface },
  readerBody: { paddingHorizontal: 18, paddingTop: 14, gap: 12 },
  readerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, lineHeight: 30 },
  readerLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 18 },
  readerLoadingText: { fontSize: 14, color: COLORS.textSecondary, flex: 1, lineHeight: 20 },
  readOriginalBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    borderRadius: 12, paddingVertical: 12, marginTop: 4,
  },
  readOriginalText: { fontSize: 13.5, fontWeight: '700', color: COLORS.primary, flexShrink: 1 },
  followUpBlock: { marginTop: 8, gap: 4 },
  followUpQ: {
    alignSelf: 'flex-end', backgroundColor: COLORS.primary,
    borderRadius: 16, borderBottomRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 9, maxWidth: '88%',
  },
  followUpQText: { color: '#fff', fontSize: 14.5, lineHeight: 20 },
  followUpBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  followUpInput: {
    flex: 1, minHeight: 40, maxHeight: 110,
    backgroundColor: COLORS.background, borderRadius: 20,
    paddingHorizontal: 15, paddingVertical: 9,
    fontSize: 14.5, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  followUpSend: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  // Floating pill bar (Perplexity style)
  pillBar: {
    flexDirection: 'row', justifyContent: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
  },
  pillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 11,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  pillBtnImg: { width: 22, height: 22, borderRadius: 11 },
  pillBtnText: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  // Ask sheet with article chip
  askSheet: {
    backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingTop: 10, gap: 8,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 }, elevation: 8,
  },
  askChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.background, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  askChipImg: { width: 28, height: 28, borderRadius: 8 },
  askChipText: { flex: 1, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 17 },
  followUpBarInner: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
});

const readerMd = {
  body: { color: COLORS.text, fontSize: 15.5, lineHeight: 25 },
  heading2: { fontSize: 17, fontWeight: '800' as const, color: COLORS.text, marginTop: 14, marginBottom: 6 },
  paragraph: { marginTop: 0, marginBottom: 10 },
  bullet_list: { marginBottom: 10 },
  list_item: { marginBottom: 6 },
  bullet_list_icon: { color: COLORS.primary, marginRight: 8, lineHeight: 25 },
  strong: { fontWeight: '700' as const, color: COLORS.text },
};
