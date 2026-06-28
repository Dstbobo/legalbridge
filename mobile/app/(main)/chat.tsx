import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, FlatList, StyleSheet, Text, TextInput,
  TouchableOpacity, Platform, Alert, Modal, Pressable, ScrollView,
  Keyboard, Share, Linking,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useChatStore, type Message } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { useDocumentsStore, deriveDocTitle } from '@/stores/documents.store';
import { streamChat, streamDocument } from '@/services/chat.service';
import { copyDocument, shareDocumentPdf, printDocument } from '@/services/documentActions';
import { Image } from 'react-native';
import { isLawyer, isLawStudent, type UserRole } from '@/constants/roles';
import DiscoveryScreen from './discovery';
import ClientsScreen from './clients';
import VoiceConversation from '@/components/VoiceConversation';

type ChatMode = 'assistant' | 'draft';

const LB_LOGO = require('@/assets/logo.png');
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

// ── Nav config by role ────────────────────────────────────────────────────
type TabId = 'chat' | 'lawyers' | 'mentorship' | 'messages' | 'discovery' | 'clients';

function getNavItems(role: UserRole | null | undefined) {
  if (isLawyer(role)) {
    return [
      { id: 'messages' as TabId, icon: 'message-outline', activeIcon: 'message', label: 'Messages' },
      { id: 'clients' as TabId, icon: 'account-multiple-outline', activeIcon: 'account-multiple', label: 'Clients' },
      { id: 'discovery' as TabId, icon: 'compass-outline', activeIcon: 'compass', label: 'Discovery' },
    ];
  }
  if (isLawStudent(role)) {
    return [
      { id: 'chat' as TabId, icon: 'home-outline', activeIcon: 'home', label: 'Home' },
      { id: 'mentorship' as TabId, icon: 'account-tie-outline', activeIcon: 'account-tie', label: 'Mentorship' },
      { id: 'messages' as TabId, icon: 'message-outline', activeIcon: 'message', label: 'Messages' },
      { id: 'discovery' as TabId, icon: 'compass-outline', activeIcon: 'compass', label: 'Discovery' },
    ];
  }
  // general_user (default)
  return [
    { id: 'chat' as TabId, icon: 'home-outline', activeIcon: 'home', label: 'Home' },
    { id: 'lawyers' as TabId, icon: 'account-tie-outline', activeIcon: 'account-tie', label: 'Lawyers' },
    { id: 'messages' as TabId, icon: 'message-outline', activeIcon: 'message', label: 'Messages' },
    { id: 'discovery' as TabId, icon: 'compass-outline', activeIcon: 'compass', label: 'Discovery' },
  ];
}

function getDefaultTab(role: UserRole | null | undefined): TabId {
  return isLawyer(role) ? 'messages' : 'chat';
}

// ── Smart home screen ─────────────────────────────────────────────────────
const RECENT_CASES = [
  'Landlord Eviction — Lagos 2024',
  'Employment Termination Review',
  'Contract Breach — Okonkwo v. DST',
];

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good evening';
}

// Rotating, formal "continue last session" prompts so it never feels static.
const CONTINUE_PROMPTS: Record<'lawyer' | 'law_student' | 'general', string[]> = {
  lawyer: [
    'Would you like to continue with your latest case?',
    'Shall we pick up where you left off?',
    'Ready to resume your last matter?',
  ],
  law_student: [
    'Would you like to continue where you left off?',
    'Shall we resume your last study session?',
    'Ready to pick up where you stopped?',
  ],
  general: [
    'Would you like to continue where you left off?',
    'Shall we pick up from your last session?',
    'Ready to resume your previous session?',
  ],
};

function getFollowUp(role: UserRole | null | undefined, hasHistory: boolean, variant: number): string {
  if (!hasHistory) return 'How can LegalBridge help you today?';
  const group = isLawyer(role) ? 'lawyer' : isLawStudent(role) ? 'law_student' : 'general';
  const opts = CONTINUE_PROMPTS[group];
  return opts[variant % opts.length];
}

function HomeScreen({ onSend, user }: { onSend: (t: string) => void; user: any }) {
  const hasHistory = RECENT_CASES.length > 0;
  const firstName = user?.fullName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';
  // Pick a stable variant for this screen open (not on every keystroke/re-render).
  const variant = React.useMemo(() => Math.floor(Math.random() * 3), []);
  const greetingLine = `${getTimeGreeting()}, ${firstName}.`;
  const followUp = getFollowUp(user?.role, hasHistory, variant);

  return (
    <View style={styles.homeMinimal}>
      <Image source={LB_LOGO} style={styles.lbLogoImg} resizeMode="contain" />
      <Text style={styles.homeGreeting}>{greetingLine}</Text>
      <Text style={styles.homeSubGreeting}>{followUp}</Text>
    </View>
  );
}

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
        <DocumentActions content={message.content} />
      )}
    </View>
  );
}

// ── Document action bar (under a generated legal document) ──────────────────
function DocumentActions({ content }: { content: string }) {
  const { saveDocument } = useDocumentsStore();
  const [saved, setSaved] = useState(false);
  const title = deriveDocTitle(content);

  const actions = [
    { key: 'copy', icon: 'content-copy', label: 'Copy',
      onPress: async () => { await copyDocument(content); Alert.alert('Copied', 'Document copied to clipboard.'); } },
    { key: 'share', icon: 'share-variant', label: 'Share',
      onPress: () => shareDocumentPdf(title, content) },
    { key: 'print', icon: 'printer', label: 'Print',
      onPress: () => printDocument(title, content) },
    { key: 'save', icon: saved ? 'check' : 'content-save-outline', label: saved ? 'Saved' : 'Save',
      onPress: async () => { await saveDocument(title, content); setSaved(true); } },
  ];

  return (
    <View>
      <View style={styles.docTag}>
        <MaterialCommunityIcons name="file-document-outline" size={12} color={COLORS.accent} />
        <Text style={styles.docTagText}>Legal Document</Text>
      </View>
      <View style={styles.docActions}>
        {actions.map((a) => (
          <TouchableOpacity key={a.key} style={styles.docActionBtn} onPress={a.onPress} activeOpacity={0.7}>
            <MaterialCommunityIcons name={a.icon as any} size={18} color={COLORS.primary} />
            <Text style={styles.docActionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Side drawer ───────────────────────────────────────────────────────────
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

  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.drawerOverlay} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={() => {}}>
          {/* Scrollable middle */}
          <ScrollView
            style={styles.drawerBody}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.drawerScroll, { paddingTop: insets.top + 20 }]}
          >
            <View style={styles.drawerWordmark}>
              <Text style={styles.drawerWordmarkLegal}>Legal</Text>
              <Text style={styles.drawerWordmarkBridge}>Bridge</Text>
            </View>

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

            <View style={styles.drawerDivider} />
            <Text style={styles.recentLabel}>RECENT</Text>
            {RECENT_CASES.map((c) => (
              <TouchableOpacity key={c} style={styles.recentItem} onPress={onClose} activeOpacity={0.7}>
                <MaterialCommunityIcons name="file-document-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.recentText} numberOfLines={1}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Pinned footer — always visible */}
          <View style={[styles.drawerFooter, { paddingBottom: insets.bottom + 8 }]}>
            <TouchableOpacity style={styles.drawerSettingsBtn} onPress={() => onNavigate('settings')} activeOpacity={0.7}>
              <MaterialCommunityIcons name="cog-outline" size={22} color={COLORS.primary} />
              <Text style={styles.drawerSettingsLabel}>Settings</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.border} />
            </TouchableOpacity>
          </View>
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

// ── Header "more" dropdown menu ───────────────────────────────────────────
function MoreMenu({ visible, onClose, onAction, topOffset }: {
  visible: boolean; onClose: () => void;
  onAction: (key: string) => void; topOffset: number;
}) {
  const items: { key: string; icon: string; label: string; destructive?: boolean }[] = [
    { key: 'share', icon: 'share-variant-outline', label: 'Share conversation' },
    { key: 'save', icon: 'bookmark-outline', label: 'Save to my cases' },
    { key: 'search', icon: 'magnify', label: 'Search chats' },
    { key: 'report', icon: 'flag-outline', label: 'Report a problem' },
    { key: 'clear', icon: 'trash-can-outline', label: 'Clear conversation', destructive: true },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.moreOverlay} onPress={onClose}>
        <View style={[styles.moreMenu, { top: topOffset }]}>
          {items.map((it, i) => (
            <TouchableOpacity
              key={it.key}
              style={[styles.moreItem, i === items.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => { onClose(); onAction(it.key); }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={it.icon as any}
                size={19}
                color={it.destructive ? COLORS.error : COLORS.primary}
              />
              <Text style={[styles.moreLabel, it.destructive && { color: COLORS.error }]}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Input bar ─────────────────────────────────────────────────────────────
function InputBar({
  inputText, setInputText, inputState, onSend, onStop, onPlus, onLive, inputRef,
}: {
  inputText: string;
  setInputText: (t: string) => void;
  inputState: 'idle' | 'typing' | 'generating';
  onSend: () => void;
  onStop: () => void;
  onPlus: () => void;
  onLive: () => void;
  inputRef?: React.RefObject<TextInput>;
}) {
  return (
    <View style={styles.inputBar}>
      <View style={styles.inputPill}>
        {/* + attach */}
        <TouchableOpacity style={styles.pillSideBtn} onPress={onPlus} disabled={inputState === 'generating'}>
          <MaterialCommunityIcons name="plus" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>

        {/* Text field */}
        <TextInput
          ref={inputRef}
          style={styles.pillInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Reply to LegalBridge…"
          placeholderTextColor={COLORS.textSecondary}
          multiline
          maxLength={2000}
          editable={inputState !== 'generating'}
        />

        {/* Right action: stop | send | mic */}
        {inputState === 'generating' ? (
          <TouchableOpacity style={styles.pillActionBtn} onPress={onStop}>
            <View style={styles.stopIcon} />
          </TouchableOpacity>
        ) : inputState === 'typing' ? (
          <TouchableOpacity style={styles.pillActionBtn} onPress={onSend}>
            <MaterialCommunityIcons name="arrow-up" size={18} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.pillSideBtn} onPress={() => Alert.alert('Voice Input', 'Coming in next update.')}>
            <MaterialCommunityIcons name="microphone-outline" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Waveform / live mode trigger */}
      <TouchableOpacity style={styles.waveBtn} onPress={onLive} activeOpacity={0.8}>
        <MaterialCommunityIcons name="waveform" size={20} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ── Bottom nav ────────────────────────────────────────────────────────────
function BottomNav({ tab, onTab, role, bottomInset = 0 }: { tab: TabId; onTab: (t: TabId) => void; role: UserRole | null | undefined; bottomInset?: number }) {
  const items = getNavItems(role);
  return (
    <View style={[styles.bottomNavWrap, { paddingBottom: (bottomInset > 0 ? bottomInset : 10) + 6 }]}>
      <View style={styles.bottomNav}>
      {items.map((item) => {
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
    </View>
  );
}

// ── Mentorship tab (law students) ─────────────────────────────────────────
function MentorshipTab() {
  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.tabHeading}>Mentorship</Text>
      <Text style={styles.tabSub}>Connect with senior lawyers, find pupillage opportunities, and grow your legal career.</Text>
      <View style={styles.tabCards}>
        {[
          { icon: 'school-outline', title: 'Find a Mentor', desc: 'Connect with senior legal practitioners in your area of interest' },
          { icon: 'briefcase-check-outline', title: 'Pupillage Board', desc: 'Browse chambers and law firms accepting pupils right now' },
          { icon: 'calendar-check-outline', title: 'Career Events', desc: 'Seminars, moots, bar dinners, and networking events' },
          { icon: 'book-open-outline', title: 'Study Groups', desc: 'Join active law student study and moot prep groups' },
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

// ── Lawyers tab (general users) ───────────────────────────────────────────
function LawyersTab() {
  const router = useRouter();
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
          { icon: 'clock-fast', title: 'Quick Consultation', desc: '30-min session with a verified lawyer — from ₦5,000' },
          { icon: 'handshake-outline', title: 'Full Representation', desc: 'Hire a lawyer to handle your case end-to-end' },
          { icon: 'chat-question-outline', title: 'Ask a Question', desc: 'Get a written legal opinion within 24 hours' },
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
  const roleLabel = isLawyer(user?.role) ? 'Lawyer' : isLawStudent(user?.role) ? 'Law Student' : 'General User';

  return (
    <ScrollView contentContainerStyle={styles.profileContent}>
      <View style={styles.profileAvatar}>
        <Text style={styles.profileInitials}>{initials}</Text>
      </View>
      <Text style={styles.profileName}>{user?.fullName ?? 'User'}</Text>
      <Text style={styles.profileEmail}>{user?.email}</Text>
      <View style={styles.profileBadge}>
        <Text style={styles.profileBadgeText}>{roleLabel}</Text>
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
    setLoading, clearChat,
  } = useChatStore();
  const { user } = useAuthStore();

  const [tab, setTab] = useState<TabId>(() => getDefaultTab(user?.role));
  const [inputText, setInputText] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>('assistant');
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const chatIdRef = useRef(`chat_${Date.now()}`);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  function scrollToBottom() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }

  function navigate(route: string) {
    setDrawerOpen(false);
    if (route === 'chat') { setTab('chat'); return; }
    router.push(`/(main)/${route}` as any);
  }

  function startNewCase() {
    clearChat();
    chatIdRef.current = `chat_${Date.now()}`;
    setTab('chat');
  }

  async function sendMessage(text?: string) {
    const content = (text ?? inputText).trim();
    if (!content || isLoading) return;
    setInputText('');
    setLoading(true);
    addUserMessage(content);
    const isDraft = mode === 'draft';
    const aiMsgId = Math.random().toString(36).slice(2);
    startStreaming(aiMsgId, isDraft);
    scrollToBottom();

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const stream = isDraft ? streamDocument : streamChat;
      await stream(content, chatIdRef.current, (chunk) => {
        appendStream(chunk);
        scrollToBottom();
      }, abort.signal);
    } catch (e: any) {
      const isAbort =
        e?.name === 'AbortError' ||
        e?.name === 'CanceledError' ||
        (typeof e?.message === 'string' &&
          (e.message.toLowerCase().includes('aborted') ||
           e.message.toLowerCase().includes('canceled') ||
           e.message.toLowerCase().includes('cancelled')));
      if (!isAbort) {
        const msg = e?.message ?? String(e);
        appendStream(`\n\n_Something went wrong. Please check your connection and try again._`);
        console.error('[chat] stream error:', msg);
      }
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

  async function handleMoreAction(key: string) {
    switch (key) {
      case 'share': {
        const transcript = messages.length
          ? messages.map((m) => `${m.role === 'user' ? 'You' : 'LegalBridge'}: ${m.content}`).join('\n\n')
          : 'Check out LegalBridge — Nigerian legal research and guidance in your pocket.';
        try { await Share.share({ message: transcript }); } catch {}
        break;
      }
      case 'save':
        Alert.alert('Saved', 'This conversation has been saved to My Cases.');
        break;
      case 'search':
        router.push('/(main)/history');
        break;
      case 'report':
        Linking.openURL('mailto:support@legalbridge.ng?subject=Report%20a%20problem').catch(() => {});
        break;
      case 'clear':
        Alert.alert('Clear conversation', 'This will remove the current conversation. Continue?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear', style: 'destructive', onPress: () => { clearChat(); chatIdRef.current = `chat_${Date.now()}`; } },
        ]);
        break;
    }
  }

  const inputState: 'idle' | 'typing' | 'generating' = isLoading ? 'generating' : inputText.trim() ? 'typing' : 'idle';
  const showChatInput = tab === 'chat';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header — no title when in chat tab */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setDrawerOpen(true)}>
          <MaterialCommunityIcons name="menu" size={24} color={COLORS.text} />
        </TouchableOpacity>
        {tab !== 'chat' && (
          <Text style={styles.headerWordmark}>
            <Text style={{ color: COLORS.text }}>Legal</Text>
            <Text style={{ color: COLORS.accent, fontStyle: 'italic' }}>Bridge</Text>
          </Text>
        )}
        {tab === 'chat' && (
          <View style={styles.headerCenter}>
            <TouchableOpacity
              style={styles.modePill}
              onPress={() => setModeMenuOpen(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={mode === 'draft' ? 'file-document-edit-outline' : 'message-text-outline'}
                size={16}
                color={COLORS.primary}
              />
              <Text style={styles.modePillText}>{mode === 'draft' ? 'Draft' : 'Assistant'}</Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionBtn} onPress={startNewCase}>
            <MaterialCommunityIcons name="square-edit-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerActionDivider} />
          <TouchableOpacity style={styles.headerActionBtn} onPress={() => setMoreOpen(true)}>
            <MaterialCommunityIcons name="dots-horizontal" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content — takes all remaining space */}
      <View style={styles.content}>
        {tab === 'chat' && (
          messages.length === 0
            ? <HomeScreen onSend={(t) => { setTab('chat'); sendMessage(t); }} user={user} />
            : <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => <MessageBubble message={item} />}
                contentContainerStyle={styles.messageList}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={scrollToBottom}
              />
        )}
        {tab === 'lawyers' && <LawyersTab />}
        {tab === 'mentorship' && <MentorshipTab />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'discovery' && <DiscoveryScreen embedded />}
        {tab === 'clients' && <ClientsScreen embedded />}
      </View>

      {/* Input bar — independent from nav, floats above keyboard. Same on home & in conversation. */}
      {showChatInput && (
        <InputBar
          inputText={inputText}
          setInputText={setInputText}
          inputState={inputState}
          onSend={() => sendMessage()}
          onStop={stopGeneration}
          onPlus={() => setPlusOpen(true)}
          onLive={() => setLiveMode(true)}
          inputRef={inputRef}
        />
      )}

      {/* Bottom nav — hides when keyboard is open. Inset lives inside the nav so its surface reaches the screen edge. */}
      {!keyboardVisible && (
        <BottomNav tab={tab} onTab={setTab} role={user?.role} bottomInset={insets.bottom} />
      )}

      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} />
      <PlusSheet visible={plusOpen} onClose={() => setPlusOpen(false)} />
      <MoreMenu
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        onAction={handleMoreAction}
        topOffset={insets.top + 60}
      />
      <VoiceConversation visible={liveMode} onClose={() => setLiveMode(false)} />

      {/* Mode switcher dropdown — Assistant vs Draft Document */}
      <Modal visible={modeMenuOpen} transparent animationType="fade" onRequestClose={() => setModeMenuOpen(false)}>
        <Pressable style={styles.modeOverlay} onPress={() => setModeMenuOpen(false)}>
          <View style={[styles.modeMenu, { top: insets.top + 56 }]}>
            {([
              { id: 'assistant' as ChatMode, icon: 'message-text-outline', title: 'Assistant', desc: 'Ask questions, get legal guidance' },
              { id: 'draft' as ChatMode, icon: 'file-document-edit-outline', title: 'Draft Document', desc: 'Generate contracts, letters, affidavits' },
            ]).map((m) => {
              const active = mode === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modeItem, active && styles.modeItemActive]}
                  onPress={() => { setMode(m.id); setModeMenuOpen(false); }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name={m.icon as any} size={22} color={active ? COLORS.primary : COLORS.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modeItemTitle, active && { color: COLORS.primary }]}>{m.title}</Text>
                    <Text style={styles.modeItemDesc}>{m.desc}</Text>
                  </View>
                  {active && <MaterialCommunityIcons name="check" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.background,
  },
  headerBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  // Grouped right-side actions (edit + ...) in one floating pill
  headerActions: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 4,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  headerActionBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerActionDivider: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: COLORS.border },
  // Mode switcher (Assistant / Draft)
  headerCenter: { flex: 1, alignItems: 'center' },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.surface, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  modePillText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  modeOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  modeMenu: {
    position: 'absolute', alignSelf: 'center', width: 300,
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, padding: 6,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  modeItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12,
  },
  modeItemActive: { backgroundColor: `${COLORS.primary}10` },
  modeItemTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  modeItemDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  // Document action bar
  docActions: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10,
  },
  docActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: `${COLORS.primary}0d`, borderRadius: 10,
    borderWidth: 1, borderColor: `${COLORS.primary}30`,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  docActionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  // "More" dropdown
  moreOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  moreMenu: {
    position: 'absolute', right: 16,
    minWidth: 220,
    backgroundColor: COLORS.surface, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 4,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  moreItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  moreLabel: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  headerWordmark: { fontSize: 20, fontWeight: '700' },

  // Home — clean minimal
  homeMinimal: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  lbLogoImg: { width: 110, height: 110 },
  homeGreeting: { fontSize: 19, fontWeight: '700', color: COLORS.text, lineHeight: 26, marginTop: 20, textAlign: 'center' },
  homeSubGreeting: { fontSize: 15, fontWeight: '500', color: COLORS.textSecondary, lineHeight: 22, marginTop: 6, textAlign: 'center' },

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

  // Input bar — floating, independent from nav
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputPill: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: COLORS.background,
    borderRadius: 26, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 4, paddingVertical: 4, gap: 2,
  },
  pillSideBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  pillInput: {
    flex: 1, minHeight: 36, maxHeight: 130,
    fontSize: 15, color: COLORS.text,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  pillActionBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  stopIcon: { width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff' },
  waveBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: `${COLORS.primary}18`,
    borderWidth: 1, borderColor: `${COLORS.primary}30`,
    alignItems: 'center', justifyContent: 'center',
  },

  // Live bar — floats same as input bar
  liveBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    marginHorizontal: 12, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  liveCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  liveCircleMic: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  liveCircleExit: { backgroundColor: '#fff2f2', borderColor: '#fca5a5' },
  livePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 22, paddingVertical: 12,
    shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  livePillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Bottom nav — grouped into a single floating rounded pill, spaced above the bottom edge
  bottomNavWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 30,
    paddingVertical: 8, paddingHorizontal: 6,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navPill: { width: 48, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  navPillActive: { backgroundColor: COLORS.primary },
  navLabel: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '500' },
  navLabelActive: { color: COLORS.primary, fontWeight: '700' },

  // Side drawer
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', flexDirection: 'row' },
  drawer: { width: 290, backgroundColor: COLORS.surface },
  drawerBody: { flex: 1 },
  drawerScroll: { paddingBottom: 16 },
  drawerFooter: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  drawerSettingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  drawerSettingsLabel: { flex: 1, fontSize: 16, color: COLORS.text, fontWeight: '600' },
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
