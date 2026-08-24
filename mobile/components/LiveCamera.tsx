import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { ROLE_LABELS } from '@/constants/roles';
import { LiveSession, type LiveStatus } from '@/services/geminiLive';
import { COLORS } from '@/constants/theme';

interface Turn { role: 'user' | 'assistant'; text: string }

export default function LiveCamera({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const messages = useChatStore((s) => s.messages);
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const frameTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [muted, setMuted] = useState(false);

  const pushTranscript = useCallback((role: 'user' | 'assistant', text: string) => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        const copy = prev.slice();
        copy[copy.length - 1] = { role, text: (last.text + ' ' + text).trim() };
        return copy;
      }
      return [...prev, { role, text }];
    });
  }, []);

  const startStreaming = useCallback(() => {
    if (frameTimer.current) return;
    // One frame per second to the Live session.
    frameTimer.current = setInterval(async () => {
      try {
        const cam = cameraRef.current;
        const session = sessionRef.current;
        if (!cam || !session || !session.isReady) return;
        const photo = await cam.takePictureAsync({
          base64: false, quality: 0.4, skipProcessing: true, shutterSound: false,
        });
        if (!photo?.uri) return;
        const scaled = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 480 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (scaled.base64) session.sendImageFrame(scaled.base64);
      } catch {
        // skip this frame
      }
    }, 1000);
  }, []);

  const stopStreaming = useCallback(() => {
    if (frameTimer.current) { clearInterval(frameTimer.current); frameTimer.current = null; }
  }, []);

  const handleClose = useCallback(async () => {
    stopStreaming();
    await sessionRef.current?.close();
    sessionRef.current = null;
    setTranscript([]);
    setStatus('connecting');
    setMuted(false);
    onClose();
  }, [onClose, stopStreaming]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      sessionRef.current?.setMicMuted(next);
      return next;
    });
  }, []);

  // Open the Live session once shown and camera is permitted.
  useEffect(() => {
    if (!visible || !permission?.granted) return;
    const history = messages
      .slice(-8)
      .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content }));
    const session = new LiveSession(
      {
        userId: user?.id ?? null,
        role: user?.role ?? null,
        roleLabel: user?.role ? ROLE_LABELS[user.role] : null,
        history,
      },
      {
        onStatus: (s) => {
          setStatus(s);
          if (s === 'listening') startStreaming();
        },
        onTranscript: pushTranscript,
      },
    );
    sessionRef.current = session;
    session.connect().catch(() => setStatus('error'));
    return () => {
      stopStreaming();
      session.close();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, permission?.granted]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [transcript]);

  if (!visible) return null;

  if (!permission?.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
        <View style={[styles.permRoot, { paddingTop: insets.top + 40 }]}>
          <MaterialCommunityIcons name="camera-outline" size={56} color={COLORS.primary} />
          <Text style={styles.permTitle}>Camera access</Text>
          <Text style={styles.permBody}>
            Allow camera access to point at documents, contracts, court notices or notes and talk
            them through with LegalBridge AI in real time.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={{ marginTop: 14 }}>
            <Text style={styles.permCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const statusText =
    status === 'connecting' ? 'Connecting…'
    : status === 'reconnecting' ? 'Reconnecting…'
    : status === 'rate_limited' ? 'Busy — retrying…'
    : status === 'speaking' ? 'Speaking…'
    : status === 'error' ? 'Connection error'
    : 'Live — point and talk';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.root}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{statusText}</Text>
          </View>
          <TouchableOpacity onPress={handleClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {transcript.length > 0 && (
          <View style={[styles.panel, { paddingBottom: insets.bottom + 90 }]}>
            <ScrollView ref={scrollRef} style={styles.panelScroll}>
              {transcript.map((t, i) => (
                <Text key={i} style={t.role === 'user' ? styles.userLine : styles.aiLine}>
                  {t.role === 'user' ? 'You: ' : 'LegalBridge: '}{t.text}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Bottom controls */}
        <View style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.controlBtn, muted && styles.controlBtnActive]}
            onPress={toggleMute}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name={muted ? 'microphone-off' : 'microphone'} size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.controlBtn, styles.endBtn]} onPress={handleClose} activeOpacity={0.85}>
            <MaterialCommunityIcons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.error },
  liveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '42%',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 18, paddingTop: 14,
  },
  panelScroll: { maxHeight: 200 },
  userLine: { color: '#cfe0f5', fontSize: 14, lineHeight: 21, marginBottom: 4 },
  aiLine: { color: '#fff', fontSize: 14, lineHeight: 21, marginBottom: 8 },
  controls: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28,
    paddingTop: 14,
  },
  controlBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  controlBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  endBtn: { backgroundColor: COLORS.error, borderColor: COLORS.error },
  permRoot: { flex: 1, alignItems: 'center', paddingHorizontal: 32, backgroundColor: COLORS.background },
  permTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  permBody: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: 10 },
  permBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 24 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  permCancel: { color: COLORS.textSecondary, fontSize: 15 },
});
