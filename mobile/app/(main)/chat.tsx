import React, { useState, useRef } from 'react';
import {
  View, FlatList, StyleSheet, Text, TextInput,
  TouchableOpacity, Platform, Alert, Modal, Pressable, ScrollView,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useChatStore, type Message } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { streamChat, streamDocument } from '@/services/chat.service';
import { isLegalPro } from '@/constants/roles';
import { COLORS } from '@/constants/theme';

// ── Markdown styles ───────────────────────────────────────────────────────
const mdStyles = {
  body: { color: COLORS.text, fontSize: 15, lineHeight: 24 },
  paragraph: { marginTop: 0, marginBottom: 10 },
  heading1: { fontSize: 21, fontWeight: '700' as const, color: COLORS.text, marginBottom: 8, marginTop: 14 },
  heading2: { fontSize: 18, fontWeight: '700' as const, color: COLORS.text, marginBottom: 6, marginTop: 12 },
  heading3: { fontSize: 16, fontWeight: '700' as const, color: COLORS.text, marginBottom: 4, marginTop: 10 },
  strong: { fontWeight: '700' as const, color: COLORS.text },
  em: { fontStyle: 'italic' as const },
  bullet_list: { marginBottom: 10 },
  ordered_list: { marginBottom: 10 },
  list_item: { marginBottom: 5 },
  bullet_list_icon: { color: COLORS.primary, marginRight: 8, lineHeight: 24 },
  ordered_list_icon: { color: COLORS.primary, marginRight: 8, lineHeight: 24, fontWeight: '700' as const },
  code_inline: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13, backgroundColor: COLORS.secondary,
    color: COLORS.primary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  fence: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13, backgroundColor: '#1a1a2e', color: '#e2e8f0',
    padding: 14, borderRadius: 10, marginVertical: 10,
  },
  blockquote: {
    backgroundColor: COLORS.secondary, borderLeftWidth: 3, borderLeftColor: COLORS.primary,
    paddingLeft: 12, paddingVertical: 6, marginVertical: 6, borderRadius: 4,
  },
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginVertical: 10 },
  thead: { backgroundColor: COLORS.secondary },
  th: { padding: 10, fontWeight: '700' as const, color: COLORS.text, fontSize: 13 },
  td: { padding: 10, color: COLORS.text, fontSize: 13 },
  tr: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  link: { color: COLORS.primary, textDecorationLine: 'underline' as const },
  hr: { backgroundColor: COLORS.border, height: 1, marginVertical: 12 },
};

type Tab = 'chat' | 'mentorship' | 'messages' | 'profile';

// ── Message bubble ────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.aiRow}>
      {message.isStreaming && !message.content ? (
        <View style={styles.typingDots}>
          <View style={[styles.dot, { opacity: 0.3 }]} />
          <View style={[styles.dot, { opacity: 0.6 }]} />
          <View style={styles.dot} />
        </View>
      ) : (
        <Markdown style={mdStyles}>
          {message.content + (message.isStreaming ? '▋' : '')}
        </Markdown>
      )}
      {message.isDocument && !message.isStreaming && (
        <View style={styles.docTag}>
          <MaterialCommunityIcons name="file-document-outline" size={12} color={COLORS.accent} />
          <Text style={styles.docTagText}>Legal Document</Text>
        </View>
      )}
    </View>
  );
}

// ── Home screen (empty chat state) ────────────────────────────────────────
function HomeScreen({ onSend, user }: { onSend: (t: string) => void; user: any }) {
  const pro = isLegalPro(user?.role);
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const proCards = [
    { cat: 'CASE SUMMARY', text: 'Summarise this judgement for my studies' },
    { cat: 'MOOT COURT', text: 'Help me prepare moot court argument' },
    { cat: 'LEGAL PRINCIPLE', text: 'Explain this legal principle in simple terms' },
    { cat: 'STATUTE GUIDE', text: 'Help me understand this statute' },
  ];
  const generalCards = [
    { cat: 'TENANT RIGHTS', text: 'My landlord is trying to evict me without notice' },
    { cat: 'BUSINESS LAW', text: 'How do I register my business in Nigeria?' },
    { cat: 'EMPLOYMENT', text: 'My employer owes me unpaid salary. What can I do?' },
    { cat: 'FAMILY LAW', text: 'What are the steps for legal separation in Nigeria?' },
  ];
  const cards = pro ? proCards : generalCards;

  return (
    <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
      {/* LB Logo */}
      <View style={styles.lbLogo}>
        <Text style={styles.lbLogoText}>LB</Text>
      </View>

      <Text style={styles.homeGreeting}>{greeting}, {user?.fullName?.split(' ')[0] ?? 'Counselor'}.</Text>
      <Text style={styles.homeSub}>Your Nigerian law research companion, built for Nigerian law.</Text>

      <View style={styles.quickCards}>
        {cards.map((c) => (
          <TouchableOpacity key={c.cat} style={styles.quickCard} onPress={() => onSend(c.text)} activeOpacity={0.8}>
            <View style={styles.quickCardInner}>
              <Text style={styles.quickCat}>{c.cat}</Text>
              <Text style={styles.quickText}>{c.text}</Text>
            </View>
            <MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Side drawer ───────────────────────────────────────────────────────────
const RECENT_CASES = [
  'Landlord Eviction — Lagos 2024',
  'Employment Termination Review',
  'Contract Breach — Okonkwo v. DST',
];

function SideDrawer({ visible, onClose, onNavigate }: {
  visible: boolean; onClose: () => void; onNavigate: (r: string) => void;
}) {
  const { clearChat } = useChatStore();
  const menuItems = [
    { icon: 'briefcase-outline', label: 'My Cases', route: 'history' },
    { icon: 'file-document-multiple-outline', label: 'Documents', route: 'documents' },
    { icon: 'check-decagram-outline', label: 'Registrations & Compliance', route: 'documents' },
    { icon: 'magnify', label: 'Research Tools', route: 'history' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.drawerOverlay} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={() => {}}>
          {/* Wordmark */}
          <View style={styles.drawerWordmark}>
            <Text style={styles.drawerWordmarkLegal}>Legal</Text>
            <Text style={styles.drawerWordmarkBridge}>Bridge</Text>
          </View>

          {/* + New case */}
          <TouchableOpacity
            style={styles.newCaseBtn}
            onPress={() => { clearChat(); onClose(); }}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
            <Text style={styles.newCaseBtnText}>New case</Text>
          </TouchableOpacity>

          <View style={styles.drawerDivider} />

          {menuItems.map((item) => (
            <TouchableOpacity key={item.label} style={styles.drawerItem} onPress={() => onNavigate(item.route)} activeOpacity={0.7}>
              <MaterialCommunityIcons name={item.icon as any} size={20} color={COLORS.primary} />
              <Text style={styles.drawerLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}

          {/* Recent */}
          <View style={styles.drawerDivider} />
          <Text style={styles.recentLabel}>RECENT</Text>
          {RECENT_CASES.map((c) => (
            <TouchableOpacity key={c} style={styles.recentItem} onPress={onClose} activeOpacity={0.7}>
              <MaterialCommunityIcons name="file-document-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.recentText} numberOfLines={1}>{c}</Text>
            </TouchableOpacity>
          ))}

          {/* Settings at bottom */}
          <View style={{ flex: 1 }} />
          <View style={styles.drawerDivider} />
          <TouchableOpacity style={styles.drawerItem} onPress={() => onNavigate('settings')} activeOpacity={0.7}>
            <MaterialCommunityIcons name="cog-outline" size={20} color={COLORS.textSecondary} />
            <Text style={[styles.drawerLabel, { color: COLORS.textSecondary }]}>Settings</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Plus sheet ────────────────────────────────────────────────────────────
function PlusSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const soon = () => { Alert.alert('Coming Soon', 'Available in the next update.'); onClose(); };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Attach</Text>
          {[
            { icon: 'camera-outline', label: 'Take a Photo' },
            { icon: 'image-outline', label: 'Choose from Gallery' },
            { icon: 'file-pdf-box', label: 'Upload PDF Document' },
          ].map((item) => (
            <TouchableOpacity key={item.label} style={styles.sheetItem} onPress={soon} activeOpacity={0.7}>
              <View style={styles.sheetIcon}>
                <MaterialCommunityIcons name={item.icon as any} size={24} color={COLORS.primary} />
              </View>
              <Text style={styles.sheetLabel}>{item.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.border} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.sheetCancel} onPress={onClose}>
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Bottom nav ────────────────────────────────────────────────────────────
const NAV_ITEMS: { id: Tab; icon: string; activeIcon: string; label: string }[] = [
  { id: 'chat', icon: 'chat-outline', activeIcon: 'chat', label: 'AI Chat' },
  { id: 'mentorship', icon: 'account-tie-outline', activeIcon: 'account-tie', label: 'Mentorship' },
  { id: 'messages', icon: 'message-outline', activeIcon: 'message', label: 'Messages' },
  { id: 'profile', icon: 'account-outline', activeIcon: 'account', label: 'Profile' },
];

function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <View style={styles.bottomNav}>
      {NAV_ITEMS.map((item) => {
        const active = tab === item.id;
        return (
          <TouchableOpacity key={item.id} style={styles.navItem} onPress={() => onTab(item.id)} activeOpacity={0.8}>
            <View style={[styles.navPill, active && styles.navPillActive]}>
              <MaterialCommunityIcons
                name={(active ? item.activeIcon : item.icon) as any}
                size={22}
                color={active ? '#fff' : COLORS.textSecondary}
              />
            </View>
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Mentorship tab ────────────────────────────────────────────────────────
function MentorshipTab({ user }: { user: any }) {
  const router = useRouter();
  const pro = isLegalPro(user?.role);

  if (!pro) {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}>
        <Text style={styles.tabHeading}>Find a Lawyer</Text>
        <Text style={styles.tabSub}>Connect with verified Nigerian legal professionals for consultation or representation.</Text>
        <TouchableOpacity style={styles.tabCTA} onPress={() => router.push('/(main)/lawyers')} activeOpacity={0.85}>
          <MaterialCommunityIcons name="account-search-outline" size={22} color="#fff" />
          <Text style={styles.tabCTAText}>Browse Available Lawyers</Text>
        </TouchableOpacity>
        <View style={styles.tabCards}>
          {[
            { icon: 'clock-fast', title: 'Quick Consultation', desc: '30-min session with a verified lawyer' },
            { icon: 'handshake-outline', title: 'Full Representation', desc: 'Hire a lawyer to handle your case' },
            { icon: 'chat-question-outline', title: 'Ask a Question', desc: 'Get a written legal opinion' },
          ].map((c) => (
            <TouchableOpacity key={c.title} style={styles.featureCard} onPress={() => router.push('/(main)/lawyers')} activeOpacity={0.8}>
              <MaterialCommunityIcons name={c.icon as any} size={26} color={COLORS.primary} />
              <Text style={styles.featureCardTitle}>{c.title}</Text>
              <Text style={styles.featureCardDesc}>{c.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.tabHeading}>Mentorship</Text>
      <Text style={styles.tabSub}>Connect with senior lawyers, find pupillage opportunities, and grow your legal career.</Text>
      <View style={styles.tabCards}>
        {[
          { icon: 'school-outline', title: 'Find a Mentor', desc: 'Connect with senior legal practitioners' },
          { icon: 'briefcase-check-outline', title: 'Pupillage Board', desc: 'Discover chambers accepting pupils' },
          { icon: 'calendar-check-outline', title: 'Career Events', desc: 'Seminars, moots, and bar dinners' },
        ].map((c) => (
          <TouchableOpacity key={c.title} style={styles.featureCard} activeOpacity={0.8}
            onPress={() => Alert.alert('Coming Soon', 'This feature is being built.')}>
            <MaterialCommunityIcons name={c.icon as any} size={26} color={COLORS.primary} />
            <Text style={styles.featureCardTitle}>{c.title}</Text>
            <Text style={styles.featureCardDesc}>{c.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Messages tab ──────────────────────────────────────────────────────────
function MessagesTab() {
  return (
    <View style={styles.emptyTab}>
      <MaterialCommunityIcons name="message-text-outline" size={52} color={COLORS.border} />
      <Text style={styles.emptyTitle}>No messages yet</Text>
      <Text style={styles.emptySub}>Direct messages with lawyers and your LegalBridge team will appear here.</Text>
    </View>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────
function ProfileTab({ user }: { user: any }) {
  const router = useRouter();
  const { clearAuth } = useAuthStore();
  const { supabase } = require('@/services/auth.service');

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure?', [
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

  const initials = (user?.fullName ?? user?.email ?? 'U').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <ScrollView contentContainerStyle={styles.profileContent}>
      <View style={styles.profileAvatar}>
        <Text style={styles.profileInitials}>{initials}</Text>
      </View>
      <Text style={styles.profileName}>{user?.fullName ?? 'User'}</Text>
      <Text style={styles.profileEmail}>{user?.email}</Text>
      <View style={styles.profileBadge}>
        <Text style={styles.profileBadgeText}>{isLegalPro(user?.role) ? 'Legal Professional' : 'General User'}</Text>
      </View>

      <View style={styles.profileMenu}>
        {[
          { icon: 'account-edit-outline', label: 'Edit Profile', onPress: () => router.push('/(main)/settings') },
          { icon: 'history', label: 'Chat History', onPress: () => router.push('/(main)/history') },
          { icon: 'file-document-multiple-outline', label: 'My Documents', onPress: () => router.push('/(main)/documents') },
          { icon: 'shield-outline', label: 'Privacy Policy', onPress: () => router.push('/(legal)/privacy') },
          { icon: 'file-document-outline', label: 'Terms of Service', onPress: () => router.push('/(legal)/terms') },
        ].map((item) => (
          <TouchableOpacity key={item.label} style={styles.profileRow} onPress={item.onPress} activeOpacity={0.7}>
            <MaterialCommunityIcons name={item.icon as any} size={20} color={COLORS.primary} />
            <Text style={styles.profileRowLabel}>{item.label}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.border} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <MaterialCommunityIcons name="logout" size={18} color={COLORS.error} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
      <Text style={styles.version}>LegalBridge v1.0 · DST Global Innovative Nigeria Ltd</Text>
    </ScrollView>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    messages, isLoading,
    addUserMessage, startStreaming, appendStream, finaliseStream,
    setLoading, setMode, clearChat,
  } = useChatStore();
  const { user } = useAuthStore();

  const [tab, setTab] = useState<Tab>('chat');
  const [inputText, setInputText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const chatIdRef = useRef(`chat_${Date.now()}`);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList>(null);

  function scrollToBottom() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }

  function navigate(route: string) {
    setDrawerOpen(false);
    router.push(`/(main)/${route}` as any);
  }

  async function sendMessage(text?: string) {
    const content = (text ?? inputText).trim();
    if (!content || isLoading) return;
    setInputText('');
    setLoading(true);
    addUserMessage(content);
    const aiMsgId = Math.random().toString(36).slice(2);
    startStreaming(aiMsgId, false);
    scrollToBottom();

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      await streamChat(content, chatIdRef.current, (chunk) => {
        appendStream(chunk);
        scrollToBottom();
      }, abort.signal);
    } catch (e: any) {
      if (e?.name !== 'AbortError') appendStream(`\n\n_Error: ${e?.message ?? e}_`);
    } finally {
      finaliseStream(aiMsgId);
      abortRef.current = null;
      setLoading(false);
      scrollToBottom();
    }
  }

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  const inputState = isLoading ? 'generating' : inputText.trim() ? 'typing' : 'idle';
  const showChat = tab === 'chat';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setDrawerOpen(true)}>
          <MaterialCommunityIcons name="menu" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerWordmark}>
          <Text style={{ color: COLORS.text }}>Legal</Text>
          <Text style={{ color: COLORS.accent, fontStyle: 'italic' }}>Bridge</Text>
        </Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => { clearChat(); setTab('chat'); }}>
          <MaterialCommunityIcons name="square-edit-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {tab === 'chat' && (
          <>
            {messages.length === 0 ? (
              <HomeScreen onSend={(t) => sendMessage(t)} user={user} />
            ) : (
              <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => <MessageBubble message={item} />}
                contentContainerStyle={styles.messageList}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={scrollToBottom}
              />
            )}

            {/* Input bar */}
            <View style={styles.inputBar}>
              <View style={styles.inputRow}>
                <TouchableOpacity style={styles.plusBtn} onPress={() => setPlusOpen(true)} disabled={isLoading}>
                  <MaterialCommunityIcons name="plus" size={22} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Reply to LegalBridge…"
                  placeholderTextColor={COLORS.textSecondary}
                  multiline
                  maxLength={2000}
                  editable={!isLoading}
                />
                {inputState === 'generating' ? (
                  <TouchableOpacity style={styles.sendBtn} onPress={stopGeneration}>
                    <View style={styles.stopIcon} />
                  </TouchableOpacity>
                ) : inputState === 'typing' ? (
                  <TouchableOpacity style={styles.sendBtn} onPress={() => sendMessage()}>
                    <MaterialCommunityIcons name="arrow-up" size={20} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.micBtn} onPress={() => Alert.alert('Voice Input', 'Coming in the next update.')}>
                    <MaterialCommunityIcons name="microphone-outline" size={22} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}
        {tab === 'mentorship' && <MentorshipTab user={user} />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'profile' && <ProfileTab user={user} />}
      </View>

      {/* Bottom nav */}
      <View style={{ paddingBottom: insets.bottom }}>
        <BottomNav tab={tab} onTab={setTab} />
      </View>

      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} />
      <PlusSheet visible={plusOpen} onClose={() => setPlusOpen(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerWordmark: { fontSize: 20, fontWeight: '700' },

  // Home screen
  homeScroll: { flex: 1 },
  homeContent: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 24 },
  lbLogo: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  lbLogoText: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -1 },
  homeGreeting: { fontSize: 26, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  homeSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 32 },
  quickCards: { width: '100%', gap: 10 },
  quickCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, gap: 12,
  },
  quickCardInner: { flex: 1 },
  quickCat: { fontSize: 10, fontWeight: '800', color: COLORS.primary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  quickText: { fontSize: 14, color: COLORS.text, fontWeight: '500', lineHeight: 20 },

  // Messages
  messageList: { paddingVertical: 16 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, marginBottom: 16 },
  userBubble: {
    backgroundColor: COLORS.primary, borderRadius: 20, borderBottomRightRadius: 4,
    paddingHorizontal: 16, paddingVertical: 10, maxWidth: '82%',
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  aiRow: { paddingHorizontal: 16, marginBottom: 20 },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.textSecondary },
  docTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  docTagText: { fontSize: 11, color: COLORS.accent, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Input bar
  inputBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  plusBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 1,
  },
  textInput: {
    flex: 1, minHeight: 40, maxHeight: 140,
    backgroundColor: COLORS.background, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 1,
  },
  stopIcon: { width: 13, height: 13, borderRadius: 2, backgroundColor: '#fff' },
  micBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 1,
  },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
    paddingVertical: 8, paddingHorizontal: 8,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navPill: { width: 48, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  navPillActive: { backgroundColor: COLORS.primary },
  navLabel: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '500' },
  navLabelActive: { color: COLORS.primary, fontWeight: '700' },

  // Side drawer
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', flexDirection: 'row' },
  drawer: { width: 290, backgroundColor: COLORS.surface, paddingTop: 56, paddingBottom: 24 },
  drawerWordmark: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20 },
  drawerWordmarkLegal: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  drawerWordmarkBridge: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: COLORS.accent },
  newCaseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: 16, marginBottom: 12,
  },
  newCaseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, flex: 1 },
  drawerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: 8 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 20 },
  drawerLabel: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  recentLabel: {
    fontSize: 10, fontWeight: '800', color: COLORS.textSecondary,
    letterSpacing: 1.2, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8,
  },
  recentItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 20 },
  recentText: { fontSize: 13, color: COLORS.text, flex: 1 },

  // Plus sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  sheetIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  sheetLabel: { flex: 1, fontSize: 16, color: COLORS.text, fontWeight: '500' },
  sheetCancel: { marginTop: 8, alignItems: 'center', paddingVertical: 14 },
  sheetCancelText: { fontSize: 16, color: COLORS.error, fontWeight: '600' },

  // Tab shared
  tabContent: { padding: 24, paddingBottom: 40 },
  tabHeading: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  tabSub: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 21, marginBottom: 24 },
  tabCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20, marginBottom: 24,
  },
  tabCTAText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tabCards: { gap: 12 },
  featureCard: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, gap: 6,
  },
  featureCardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  featureCardDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },

  // Empty tab
  emptyTab: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },

  // Profile tab
  profileContent: { alignItems: 'center', padding: 24, paddingBottom: 40 },
  profileAvatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  profileInitials: { color: '#fff', fontSize: 30, fontWeight: '800' },
  profileName: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  profileEmail: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 10 },
  profileBadge: {
    backgroundColor: COLORS.secondary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 28,
  },
  profileBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  profileMenu: {
    width: '100%', backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 20,
  },
  profileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  profileRowLabel: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '500' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 20, marginBottom: 16,
  },
  logoutText: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
  version: { fontSize: 11, color: COLORS.textTertiary, textAlign: 'center' },
});
