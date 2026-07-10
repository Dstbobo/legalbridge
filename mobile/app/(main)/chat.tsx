import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, FlatList, StyleSheet, Text, TextInput,
  TouchableOpacity, Platform, Alert, Modal, Pressable, ScrollView,
  Keyboard, Share, Linking, Animated,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Markdown from 'react-native-markdown-display';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useChatStore, type Message } from '@/stores/chat.store';
import { useAuthStore } from '@/stores/auth.store';
import { useDocumentsStore, deriveDocTitle } from '@/stores/documents.store';
import { streamChat, streamDocument, streamVision } from '@/services/chat.service';
import { copyDocument, shareDocumentPdf, printDocument } from '@/services/documentActions';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';

const RECENT_SESSIONS_KEY = 'lb_recent_sessions';
const MAX_RECENT = 12;

type RecentSession = { id: string; title: string; ts: number };

async function loadRecentSessions(): Promise<RecentSession[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveSessionMessages(id: string, messages: Message[]) {
  try {
    await AsyncStorage.setItem(`lb_session_${id}`, JSON.stringify(messages));
  } catch {}
}

async function loadSessionMessages(id: string): Promise<Message[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`lb_session_${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp), isStreaming: false }));
  } catch { return null; }
}

async function saveRecentSession(session: RecentSession) {
  try {
    const existing = await loadRecentSessions();
    const filtered = existing.filter((s) => s.id !== session.id);
    const next = [session, ...filtered].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(next));
  } catch {}
}

type StagedAttachment = {
  id: string;
  label: string;
  thumbUri?: string;
  base64: string;
  mimeType: string;
};
import { isLawyer, isLawStudent, type UserRole } from '@/constants/roles';
import DiscoveryScreen from './discovery';
import ClientsScreen from './clients';
import VoiceConversation from '@/components/VoiceConversation';
import { listConversations, type Conversation } from '@/services/messaging.service';
import { ActivityIndicator } from 'react-native';
import { useDictation } from '@/hooks/useDictation';

type ChatMode = 'assistant' | 'draft';

const LB_LOGO = require('@/assets/logo.png');
import { COLORS } from '@/constants/theme';

// ── Markdown styles ───────────────────────────────────────────────────────
const mdStyles = {
  body: { color: COLORS.text, fontSize: 16, lineHeight: 23, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia' },
  paragraph: { marginTop: 0, marginBottom: 8 },
  heading1: { fontSize: 20, fontWeight: '700' as const, color: COLORS.text, marginBottom: 6, marginTop: 12 },
  heading2: { fontSize: 17.5, fontWeight: '700' as const, color: COLORS.text, marginBottom: 5, marginTop: 10 },
  heading3: { fontSize: 16, fontWeight: '700' as const, color: COLORS.text, marginBottom: 4, marginTop: 8 },
  strong: { fontWeight: '700' as const, color: COLORS.text },
  em: { fontStyle: 'italic' as const },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
  list_item: { marginBottom: 3 },
  bullet_list_icon: { color: COLORS.text, marginRight: 8, lineHeight: 23 },
  ordered_list_icon: { color: COLORS.text, marginRight: 8, lineHeight: 23, fontWeight: '700' as const },
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

function HomeScreen({ onSend, user, hasHistory, topInset = 0, bottomInset = 0 }: { onSend: (t: string) => void; user: any; hasHistory: boolean; topInset?: number; bottomInset?: number }) {
  const firstName = user?.fullName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';
  // Pick a stable variant for this screen open (not on every keystroke/re-render).
  const variant = React.useMemo(() => Math.floor(Math.random() * 3), []);
  const greetingLine = `${getTimeGreeting()}, ${firstName}.`;
  const followUp = getFollowUp(user?.role, hasHistory, variant);

  return (
    <View style={[styles.homeMinimal, { paddingTop: topInset + 96 }]}>
      <Image source={LB_LOGO} style={styles.lbLogoImg} resizeMode="contain" />
      <Text style={styles.homeGreeting}>{greetingLine}</Text>
      <Text style={styles.homeSubGreeting}>{followUp}</Text>
      <Text style={styles.homeDisclaimer}>
        Independent app — not affiliated with or representing any government entity.
        Provides general legal information, not legal advice.
      </Text>
    </View>
  );
}

// ── Smart "thinking" status ───────────────────────────────────────────────
// Instead of a dumb spinner, we narrate what the AI is actually doing. The
// phases match the request type (question / draft / file) and the user's role,
// and once the normal phases play out (slow network) it rolls into reassuring
// "still working" messages — so a long wait feels intelligent, not broken.
type ThinkKind = 'chat' | 'draft' | 'vision';

function thinkingPhases(kind: ThinkKind, group: 'lawyer' | 'student' | 'general'): string[] {
  if (kind === 'draft') {
    return [
      'Understanding your request',
      'Structuring the document',
      group === 'lawyer' ? 'Applying the right clauses' : 'Drafting the clauses',
      'Polishing the wording',
    ];
  }
  if (kind === 'vision') {
    return [
      'Opening your file',
      'Reading through the details',
      'Analysing it under Nigerian law',
      'Preparing your explanation',
    ];
  }
  return [
    'Reading your question',
    group === 'lawyer'
      ? 'Reviewing the legal position'
      : group === 'student'
        ? 'Checking the principles'
        : 'Thinking it through',
    'Checking Nigerian law',
    'Composing your answer',
  ];
}

// Shown after the normal phases if the response is still not back (slow network).
const THINKING_SLOW = [
  'Taking a little longer than usual',
  'Still working — hang tight',
  'Fetching you the best answer',
  'Almost there',
];

function ThinkingStatus({ kind, userRole }: { kind?: ThinkKind; userRole?: UserRole | null }) {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTicks((n) => n + 1), 550);
    return () => clearInterval(t);
  }, []);

  const group = isLawyer(userRole) ? 'lawyer' : isLawStudent(userRole) ? 'student' : 'general';
  const phases = React.useMemo(() => thinkingPhases(kind ?? 'chat', group), [kind, group]);
  const step = Math.floor(ticks / 4); // ~2.2s per phase
  const label = step < phases.length ? phases[step] : THINKING_SLOW[(step - phases.length) % THINKING_SLOW.length];
  const activeDot = ticks % 3;

  return (
    <View style={styles.thinkingRow}>
      <Text style={styles.thinkingText}>{label}</Text>
      <View style={styles.thinkingDots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, { opacity: activeDot === i ? 1 : 0.3 }]} />
        ))}
      </View>
    </View>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────
function MessageBubble({ message, userRole }: { message: Message; userRole?: UserRole | null }) {
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
        <ThinkingStatus kind={message.kind} userRole={userRole} />
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
      onPress: async () => {
        if (!content || !content.trim()) { Alert.alert('Nothing to save', 'This document is still empty.'); return; }
        await saveDocument(title, content);
        setSaved(true);
        Alert.alert('Saved', 'Document saved to My Documents.');
      } },
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
function SideDrawer({ visible, onClose, onNavigate, recentSessions, onOpenSession }: {
  visible: boolean; onClose: () => void; onNavigate: (r: string) => void;
  recentSessions: RecentSession[];
  onOpenSession: (s: RecentSession) => void;
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
            {recentSessions.length === 0 ? (
              <Text style={styles.recentEmpty}>Your recent chats will appear here.</Text>
            ) : recentSessions.map((s) => (
              <TouchableOpacity key={s.id} style={styles.recentItem} onPress={() => onOpenSession(s)} activeOpacity={0.7}>
                <MaterialCommunityIcons name="message-text-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.recentText} numberOfLines={1}>{s.title}</Text>
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
function PlusSheet({ visible, onClose, onTakePhoto, onGallery, onFile }: {
  visible: boolean; onClose: () => void;
  onTakePhoto: () => void; onGallery: () => void; onFile: () => void;
}) {
  const items = [
    { icon: 'camera-outline', label: 'Take a Photo', sub: 'Snap a document and analyse it', onPress: onTakePhoto },
    { icon: 'image-outline', label: 'Choose from Gallery', sub: 'Pick an image to analyse', onPress: onGallery },
    { icon: 'file-pdf-box', label: 'Upload PDF or File', sub: 'Analyse a PDF document', onPress: onFile },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Attach</Text>
          {items.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.sheetItem}
              onPress={() => { onClose(); setTimeout(item.onPress, 250); }}
              activeOpacity={0.7}
            >
              <View style={styles.sheetIcon}>
                <MaterialCommunityIcons name={item.icon as any} size={24} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetLabel}>{item.label}</Text>
                <Text style={styles.sheetSub}>{item.sub}</Text>
              </View>
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
  inputText, setInputText, inputState, onSend, onStop, onPlus, onLive, inputRef, hasAttachments, modeLabel, onModePress, language,
}: {
  inputText: string;
  setInputText: (t: string) => void;
  inputState: 'idle' | 'typing' | 'generating';
  onSend: () => void;
  onStop: () => void;
  onPlus: () => void;
  onLive: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  hasAttachments?: boolean;
  modeLabel?: string;
  onModePress?: () => void;
  language?: string;
}) {
  const canSend = inputState === 'typing' || (inputState === 'idle' && !!hasAttachments);
  const { listening, toggle: toggleDictation } = useDictation(setInputText, language);
  return (
    <View style={styles.composerCard}>
      {/* Row 1: the text field */}
      <TextInput
        ref={inputRef}
        style={styles.composerInput}
        value={inputText}
        onChangeText={setInputText}
        placeholder={hasAttachments ? 'Add a message or send…' : 'Reply to LegalBridge…'}
        placeholderTextColor={COLORS.textSecondary}
        multiline
        maxLength={2000}
        editable={inputState !== 'generating'}
      />

      {/* Row 2: controls — + | mode pill | … | mic | wave/send */}
      <View style={styles.composerRow}>
        <TouchableOpacity style={styles.composerCircle} onPress={onPlus} disabled={inputState === 'generating'}>
          <MaterialCommunityIcons name="plus" size={22} color={COLORS.text} />
        </TouchableOpacity>

        {!!onModePress && (
          <TouchableOpacity style={styles.composerModePill} onPress={onModePress} activeOpacity={0.8}>
            <MaterialCommunityIcons
              name={modeLabel === 'Draft' ? 'file-document-edit-outline' : 'message-text-outline'}
              size={15}
              color={COLORS.text}
            />
            <Text style={styles.composerModeText}>{modeLabel}</Text>
            <MaterialCommunityIcons name="chevron-down" size={15} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[styles.composerCircle, listening && styles.composerCircleRec]}
          onPress={() => toggleDictation(inputText)}
        >
          <MaterialCommunityIcons
            name={listening ? 'microphone' : 'microphone-outline'}
            size={21}
            color={listening ? '#fff' : COLORS.text}
          />
        </TouchableOpacity>

        {inputState === 'generating' ? (
          <TouchableOpacity style={styles.composerDark} onPress={onStop}>
            <View style={styles.stopIcon} />
          </TouchableOpacity>
        ) : canSend ? (
          <TouchableOpacity style={styles.composerDark} onPress={onSend}>
            <MaterialCommunityIcons name="arrow-up" size={21} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.composerDark} onPress={onLive} activeOpacity={0.8}>
            <MaterialCommunityIcons name="waveform" size={21} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
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
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.tabHeading}>Mentorship</Text>
      <Text style={styles.tabSub}>Connect with senior lawyers, find pupillage opportunities, and grow your legal career.</Text>
      <View style={styles.tabCards}>
        {[
          { icon: 'school-outline', title: 'Find a Mentor', desc: 'Connect with verified senior legal practitioners in your area of interest', route: '/(main)/mentors' },
          { icon: 'briefcase-check-outline', title: 'Pupillage Board', desc: 'Browse chambers and law firms accepting pupils right now' },
          { icon: 'calendar-check-outline', title: 'Career Events', desc: 'Seminars, moots, bar dinners, and networking events' },
          { icon: 'book-open-outline', title: 'Study Groups', desc: 'Join active law student study and moot prep groups' },
        ].map((c) => (
          <TouchableOpacity key={c.title} style={styles.featureCard} activeOpacity={0.8}
            onPress={() => (c as any).route ? router.push((c as any).route) : Alert.alert('Coming Soon', 'This feature is being built.')}>
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
  const router = useRouter();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [myId, setMyId] = useState('');
  const [loadingConvos, setLoadingConvos] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listConversations()
        .then(({ mine, myId: id }) => { if (!cancelled) { setConvos(mine); setMyId(id); } })
        .catch(() => {});
    load().finally?.(() => {});
    Promise.resolve(load()).finally(() => { if (!cancelled) setLoadingConvos(false); });
    const t = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (loadingConvos) {
    return <View style={styles.emptyTab}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }
  if (!convos.length) {
    return (
      <View style={styles.emptyTab}>
        <MaterialCommunityIcons name="message-text-outline" size={52} color={COLORS.border} />
        <Text style={styles.emptyTitle}>No messages yet</Text>
        <Text style={styles.emptySub}>When you book or message a lawyer, the conversation appears here — everything stays inside LegalBridge.</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      {convos.map((c) => {
        const other = c.client_id === myId ? c.lawyer_name : c.client_name;
        const initials = other.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
        const when = new Date(c.last_at);
        const timeLabel = Date.now() - when.getTime() < 86400000
          ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : when.toLocaleDateString();
        return (
          <TouchableOpacity
            key={c.id}
            style={styles.convoRow}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/(main)/conversation', params: { id: c.id, name: other } } as any)}
          >
            <View style={styles.convoAvatar}><Text style={styles.convoAvatarText}>{initials || '?'}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.convoName} numberOfLines={1}>{other}</Text>
                <Text style={styles.convoTime}>{timeLabel}</Text>
              </View>
              <Text style={styles.convoPreview} numberOfLines={1}>
                {c.last_sender === myId ? 'You: ' : ''}{c.last_message ?? 'Start the conversation'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
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
    setLoading, clearChat, setMessages,
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
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const params = useLocalSearchParams<{ intent?: string; t?: string }>();

  // "Start free consultation" (LegalBridge Counsel) lands here with intent=counsel.
  useEffect(() => {
    if (params.intent === 'counsel') setTab('chat');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.t]);

  // Persist the conversation on device after each completed turn, so RECENT can reopen it.
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      saveSessionMessages(chatIdRef.current, messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, messages.length]);

  async function openRecentSession(sess: RecentSession) {
    const msgs = await loadSessionMessages(sess.id);
    if (msgs && msgs.length) {
      chatIdRef.current = sess.id;
      setMessages(msgs);
      setTab('chat');
    } else {
      Alert.alert('Chat unavailable', 'This conversation is no longer stored on this device.');
    }
    setDrawerOpen(false);
  }
  const inputRef = useRef<TextInput>(null);
  const chatIdRef = useRef(`chat_${Date.now()}`);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    loadRecentSessions().then(setRecentSessions);
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
    setStaged([]);
    setTab('chat');
  }

  async function sendMessage(text?: string) {
    const content = (text ?? inputText).trim();
    const attachmentsToSend = [...staged];
    const hasAttachments = attachmentsToSend.length > 0;
    if (!content && !hasAttachments || isLoading) return;

    setInputText('');
    setStaged([]);
    setLoading(true);
    setTab('chat');

    // Save to recent sessions on first message of a chat.
    const firstMessage = messages.length === 0;
    const sessionTitle = content || attachmentsToSend[0]?.label || 'Untitled chat';
    if (firstMessage) {
      const session: RecentSession = { id: chatIdRef.current, title: sessionTitle.slice(0, 60), ts: Date.now() };
      saveRecentSession(session);
      setRecentSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)].slice(0, MAX_RECENT));
    }

    if (hasAttachments) {
      // Vision path: one or more files attached.
      const attachLabel = attachmentsToSend.map((a) => a.label).join(', ');
      const userLabel = content ? `${content}\n\n${attachLabel}` : attachLabel;
      addUserMessage(userLabel);
      const aiMsgId = Math.random().toString(36).slice(2);
      startStreaming(aiMsgId, false, 'vision');
      scrollToBottom();

      const abort = new AbortController();
      abortRef.current = abort;
      const userType = isLawyer(user?.role) ? 'lawyer' : isLawStudent(user?.role) ? 'student' : (user?.subRole ?? 'other');
      const question = content || 'Analyse this under Nigerian law. Identify the document type, read all the text, and explain it clearly.';
      const images = attachmentsToSend.filter((a) => a.mimeType.startsWith('image/')).map((a) => ({ data: a.base64, mimeType: a.mimeType }));
      const documents = attachmentsToSend.filter((a) => !a.mimeType.startsWith('image/')).map((a) => ({ data: a.base64, mimeType: a.mimeType }));
      try {
        await streamVision(question, { images, documents }, (chunk) => { appendStream(chunk); scrollToBottom(); }, abort.signal, { userType, language: user?.language ?? 'en' });
      } catch (e: any) {
        const isAbort = e?.name === 'AbortError' || /abort|cancel/i.test(e?.message ?? '');
        if (!isAbort) appendStream('\n\n_Could not analyse that file. Please try a clearer photo or a smaller PDF._');
      } finally {
        finaliseStream(aiMsgId);
        abortRef.current = null;
        setLoading(false);
        scrollToBottom();
      }
      return;
    }

    // Normal text message.
    addUserMessage(content);
    const isDraft = mode === 'draft';
    const aiMsgId = Math.random().toString(36).slice(2);
    startStreaming(aiMsgId, isDraft, isDraft ? 'draft' : 'chat');
    scrollToBottom();

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const onChunk = (chunk: string) => { appendStream(chunk); scrollToBottom(); };
      if (isDraft) {
        const userType = isLawyer(user?.role) ? 'lawyer' : isLawStudent(user?.role) ? 'student' : (user?.subRole ?? 'other');
        await streamDocument(content, chatIdRef.current, onChunk, abort.signal, { userType, language: user?.language ?? 'en' });
      } else {
        await streamChat(content, chatIdRef.current, onChunk, abort.signal, { language: user?.language ?? 'en' });
      }
    } catch (e: any) {
      const isAbort =
        e?.name === 'AbortError' ||
        e?.name === 'CanceledError' ||
        (typeof e?.message === 'string' &&
          (e.message.toLowerCase().includes('aborted') ||
           e.message.toLowerCase().includes('canceled') ||
           e.message.toLowerCase().includes('cancelled')));
      if (!isAbort) {
        appendStream(`\n\n_Something went wrong. Please check your connection and try again._`);
        console.error('[chat] stream error:', e?.message ?? String(e));
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

  // ── Attachments → stage for send ──
  async function stageImageUri(uri: string, label: string) {
    try {
      const scaled = await ImageManipulator.manipulateAsync(
        uri, [{ resize: { width: 1280 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!scaled.base64) return;
      setStaged((prev) => [...prev, {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        label,
        thumbUri: scaled.uri,
        base64: scaled.base64!,
        mimeType: 'image/jpeg',
      }]);
    } catch {
      Alert.alert('Could not read image', 'Please try again with a clearer photo.');
    }
  }

  async function handleTakePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera access needed', 'Enable camera access in Settings to take a photo.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    await stageImageUri(res.assets[0].uri, '📷 Photo');
  }

  async function handleGallery() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    await stageImageUri(res.assets[0].uri, '🖼️ Image');
  }

  async function handleFile() {
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const mime = asset.mimeType || '';
    if (mime.startsWith('image/')) { await stageImageUri(asset.uri, `🖼️ ${asset.name || 'Image'}`); return; }
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (b64.length > 28_000_000) { Alert.alert('File too large', 'Please choose a PDF under about 20 MB.'); return; }
      setStaged((prev) => [...prev, {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        label: `📄 ${asset.name || 'PDF'}`,
        base64: b64,
        mimeType: mime || 'application/pdf',
      }]);
    } catch {
      Alert.alert('Could not read file', 'Please try a different file.');
    }
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
  const hasAttachments = staged.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header — floats over edge-to-edge content, positioned by the safe area.
          Hidden entirely on Discovery (it has its own). */}
      {tab === 'chat' ? (
      <View style={[styles.header, { top: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setDrawerOpen(true)}>
          <MaterialCommunityIcons name="menu" size={24} color={COLORS.text} />
        </TouchableOpacity>
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
      ) : tab !== 'discovery' ? (
      // Clean page header for Lawyers / Mentorship / Messages / Clients:
      // just a back arrow + page title — no menu, no new-chat, no dots.
      <View style={[styles.header, { top: insets.top + 12 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setTab('chat')}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>
          {tab === 'lawyers' ? 'Lawyers' : tab === 'mentorship' ? 'Mentorship' : tab === 'messages' ? 'Messages' : 'Clients'}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      ) : null}

      {/* Content — fills edge-to-edge; scrollable content is padded so it starts
          below the floating header buttons and scrolls up behind them. Non-chat
          tabs (which aren't glass-behind) get a plain top inset instead. */}
      <View style={[
        styles.content,
        tab === 'chat' && styles.contentFloat,
        tab !== 'chat' && tab !== 'discovery' && { paddingTop: insets.top + 60 },
      ]}>
        {tab === 'chat' && (
          messages.length === 0
            ? <HomeScreen onSend={(t) => { setTab('chat'); sendMessage(t); }} user={user} hasHistory={recentSessions.length > 0} topInset={insets.top} bottomInset={insets.bottom} />
            : <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(m) => m.id}
                renderItem={({ item }) => <MessageBubble message={item} userRole={user?.role} />}
                contentContainerStyle={[styles.messageList, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 180 }]}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={scrollToBottom}
              />
        )}
        {tab === 'lawyers' && <LawyersTab />}
        {tab === 'mentorship' && <MentorshipTab />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'discovery' && (
          <DiscoveryScreen embedded onBack={() => setTab(getDefaultTab(user?.role))} />
        )}
        {tab === 'clients' && <ClientsScreen embedded />}
      </View>

      {/* Input bar — independent from nav, floats above keyboard. Same on home & in conversation. */}
      {/* Staged attachment preview chips */}
      {showChatInput && hasAttachments && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.stagedRow}
          contentContainerStyle={styles.stagedContent}
        >
          {staged.map((att) => (
            <View key={att.id} style={styles.stagedChip}>
              {att.thumbUri
                ? <Image source={{ uri: att.thumbUri }} style={styles.stagedThumb} />
                : <MaterialCommunityIcons name="file-pdf-box" size={26} color={COLORS.primary} style={{ margin: 4 }} />
              }
              <Text style={styles.stagedChipLabel} numberOfLines={1}>{att.label}</Text>
              <TouchableOpacity onPress={() => setStaged((prev) => prev.filter((a) => a.id !== att.id))} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

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
          hasAttachments={hasAttachments}
          modeLabel={mode === 'draft' ? 'Draft' : 'Assistant'}
          onModePress={() => setModeMenuOpen(true)}
          language={user?.language ?? 'en'}
        />
      )}

      {/* Bottom nav — hides when keyboard is open. Inset lives inside the nav so its surface reaches the screen edge. */}
      {!keyboardVisible && tab !== 'discovery' && (
        <BottomNav tab={tab} onTab={setTab} role={user?.role} bottomInset={insets.bottom} />
      )}

      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} onNavigate={navigate} recentSessions={recentSessions} onOpenSession={openRecentSession} />
      <PlusSheet
        visible={plusOpen}
        onClose={() => setPlusOpen(false)}
        onTakePhoto={handleTakePhoto}
        onGallery={handleGallery}
        onFile={handleFile}
      />
      <MoreMenu
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        onAction={handleMoreAction}
        topOffset={insets.top + 60}
      />
      <VoiceConversation visible={liveMode} onClose={() => setLiveMode(false)} />

      {/* Mode switcher dropdown — Assistant vs Draft Document */}
      <Modal visible={modeMenuOpen} transparent animationType="slide" onRequestClose={() => setModeMenuOpen(false)}>
        <Pressable style={styles.modeOverlay} onPress={() => setModeMenuOpen(false)}>
          <Pressable style={[styles.modeSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.modeSheetHandle} />
            <View style={styles.modeSheetHeader}>
              <TouchableOpacity onPress={() => setModeMenuOpen(false)} hitSlop={10} style={styles.modeSheetClose}>
                <MaterialCommunityIcons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
              <Text style={styles.modeSheetTitle}>Select mode</Text>
              <View style={{ width: 32 }} />
            </View>
            {([
              { id: 'assistant' as ChatMode, title: 'Assistant', desc: 'Ask questions, get legal guidance' },
              { id: 'draft' as ChatMode, title: 'Draft Document', desc: 'Generate contracts, letters, affidavits' },
            ]).map((m) => {
              const active = mode === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={styles.modeSheetItem}
                  onPress={() => { setMode(m.id); setModeMenuOpen(false); }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modeSheetItemTitle}>{m.title}</Text>
                    <Text style={styles.modeSheetItemDesc}>{m.desc}</Text>
                  </View>
                  {active && <MaterialCommunityIcons name="check" size={20} color={COLORS.text} />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'flex-end' },
  content: { flex: 1 },
  // On the chat tab the content fills the whole screen so messages scroll behind
  // the floating composer + nav; the transparent gaps around/between the two
  // solid pills let the conversation show through.
  contentFloat: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  header: {
    position: 'absolute', left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22,
    backgroundColor: 'transparent',
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
  pageTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: COLORS.text },
  // Mode switcher (Assistant / Draft)
  headerCenter: { flex: 1, alignItems: 'center' },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.surface, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  modePillText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  modeOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
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
  modeSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 8,
  },
  modeSheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: 12,
  },
  modeSheetHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 14,
  },
  modeSheetClose: { width: 32, alignItems: 'flex-start' },
  modeSheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: COLORS.text },
  modeSheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14,
  },
  modeSheetItemTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  modeSheetItemDesc: { fontSize: 13.5, color: COLORS.textSecondary, marginTop: 3 },
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
  homeMinimal: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 32 },
  lbLogoImg: { width: 110, height: 110 },
  homeGreeting: { fontSize: 19, fontWeight: '700', color: COLORS.text, lineHeight: 26, marginTop: 20, textAlign: 'center' },
  homeSubGreeting: { fontSize: 15, fontWeight: '500', color: COLORS.textSecondary, lineHeight: 22, marginTop: 6, textAlign: 'center' },
  homeDisclaimer: {
    position: 'absolute', bottom: 14, left: 24, right: 24,
    fontSize: 10.5, lineHeight: 15, color: COLORS.textSecondary, opacity: 0.55, textAlign: 'center',
  },

  // Messages
  messageList: { paddingVertical: 16 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, marginBottom: 10 },
  userBubble: {
    backgroundColor: COLORS.primary, borderRadius: 18, borderBottomRightRadius: 5,
    paddingHorizontal: 14, paddingVertical: 8, maxWidth: '82%',
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  aiRow: { paddingHorizontal: 18, marginBottom: 12 },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.textSecondary },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  thinkingText: { fontSize: 14.5, fontWeight: '500', color: COLORS.textSecondary, fontStyle: 'italic' },
  thinkingDots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  pillSideBtnActive: { backgroundColor: COLORS.error },
  // ── Claude-style two-row composer ──
  composerCard: {
    marginHorizontal: 10, marginBottom: 10,
    // Solid white floating pill — matches the nav. The gap below it (marginBottom)
    // stays transparent so content scrolls through the space between the two pills.
    backgroundColor: COLORS.surface, borderRadius: 26,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  composerInput: {
    fontSize: 16.5, color: COLORS.text, lineHeight: 22,
    paddingHorizontal: 8, paddingTop: 10, paddingBottom: 6,
    maxHeight: 130,
  },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composerCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  composerCircleRec: { backgroundColor: COLORS.error },
  composerModePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.background, borderRadius: 20,
    paddingHorizontal: 13, paddingVertical: 10,
  },
  composerModeText: { fontSize: 13.5, fontWeight: '600', color: COLORS.text },
  composerDark: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#16181d',
    alignItems: 'center', justifyContent: 'center',
  },
  convoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, padding: 13,
  },
  convoAvatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  convoAvatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  convoName: { flex: 1, fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  convoTime: { fontSize: 11, color: COLORS.textSecondary },
  convoPreview: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
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
    // Clean SOLID pill — obviously a different, separate piece from the
    // see-through frosted composer above it.
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
  recentEmpty: { fontSize: 13, color: COLORS.textSecondary, paddingHorizontal: 20, paddingBottom: 8, fontStyle: 'italic' },

  // Staged attachment preview row above input bar
  stagedRow: { maxHeight: 80, marginHorizontal: 12, marginBottom: 4 },
  stagedContent: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4 },
  stagedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 8, paddingVertical: 4, maxWidth: 180,
  },
  stagedThumb: { width: 36, height: 36, borderRadius: 8 },
  stagedChipLabel: { fontSize: 12, color: COLORS.text, fontWeight: '600', flex: 1 },

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
  sheetLabel: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  sheetSub: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 1 },
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
