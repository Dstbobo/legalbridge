import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth.store';
import { listMessages, sendChatMessage, type ChatMessage } from '@/services/messaging.service';

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const user = useAuthStore((s) => s.user);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const msgs = await listMessages(id);
      setMessages(msgs);
    } catch { /* keep last */ }
  }, [id]);

  // Initial load + poll every 4s so replies appear without a manual refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => { await load(); if (!cancelled) setLoading(false); })();
    const t = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [load]);

  useEffect(() => {
    if (messages.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  async function send() {
    const content = text.trim();
    if (!content || !id) return;
    setText('');
    setSending(true);
    // Optimistic append
    const tempId = `tmp_${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId, conversation_id: id, sender_id: user?.id ?? 'me',
      content, created_at: new Date().toISOString(),
    }]);
    try {
      await sendChatMessage(id, content);
      await load();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(content);
    } finally {
      setSending(false);
    }
  }

  function timeOf(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{name || 'Conversation'}</Text>
            <Text style={styles.headerSub}>Messages stay inside LegalBridge for your safety</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;
              return (
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{item.content}</Text>
                  <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>
                    {timeOf(item.created_at)}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.center}>
                <MaterialCommunityIcons name="message-text-outline" size={44} color={COLORS.border} />
                <Text style={styles.emptyText}>Say hello — describe your matter briefly and clearly.</Text>
              </View>
            }
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={1500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={send}
            disabled={!text.trim() || sending}
          >
            <MaterialCommunityIcons name="send" size={19} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 10, backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    alignSelf: 'flex-start', backgroundColor: COLORS.surface, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleText: { fontSize: 14.5, color: COLORS.text, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: COLORS.textSecondary, marginTop: 3, alignSelf: 'flex-end' },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 110,
    backgroundColor: COLORS.background, borderRadius: 20,
    paddingHorizontal: 15, paddingVertical: 9, fontSize: 14.5, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
