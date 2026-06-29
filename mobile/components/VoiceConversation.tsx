import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Alert, Easing, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { ROLE_LABELS } from '@/constants/roles';
import { LiveSession, type LiveStatus } from '@/services/geminiLive';
import { COLORS } from '@/constants/theme';

const LB_LOGO = require('@/assets/logo.png');

export default function VoiceConversation({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const messages = useChatStore((s) => s.messages);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [aiText, setAiText] = useState('');
  const [userText, setUserText] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');

  const sessionRef = useRef<LiveSession | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const frameTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiScrollRef = useRef<ScrollView>(null);

  // Pulsing pill animation while the session is active.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  const onTranscript = useCallback((role: 'user' | 'assistant', text: string) => {
    if (role === 'assistant') {
      setAiText((prev) => (prev + ' ' + text).trim());
      setUserText('');
    } else {
      setUserText((prev) => (prev + ' ' + text).trim());
      setAiText((prev) => (prev ? '' : prev));
    }
  }, []);

  const stopFrames = useCallback(() => {
    if (frameTimer.current) { clearInterval(frameTimer.current); frameTimer.current = null; }
  }, []);

  const startFrames = useCallback(() => {
    if (frameTimer.current) return;
    frameTimer.current = setInterval(async () => {
      try {
        const cam = cameraRef.current;
        const session = sessionRef.current;
        if (!cam || !session || !session.isReady) return;
        const photo = await cam.takePictureAsync({ base64: false, quality: 0.4, skipProcessing: true, shutterSound: false } as any);
        if (!photo?.uri) return;
        const scaled = await ImageManipulator.manipulateAsync(
          photo.uri, [{ resize: { width: 480 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (scaled.base64) session.sendImageFrame(scaled.base64);
      } catch { /* skip frame */ }
    }, 1000);
  }, []);

  // Session lifecycle.
  useEffect(() => {
    if (!visible) return;
    // Keep the screen on for the whole live session.
    activateKeepAwakeAsync('voice').catch(() => {});
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
        onStatus: (s) => { setStatus(s); if (s !== 'error') setErrorDetail(''); },
        onTranscript,
        onError: setErrorDetail,
      },
    );
    sessionRef.current = session;
    session.connect().catch((e) => { setStatus('error'); setErrorDetail((prev) => prev || String(e?.message ?? e)); });
    return () => {
      deactivateKeepAwake('voice');
      stopFrames();
      session.close();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => { aiScrollRef.current?.scrollToEnd({ animated: true }); }, [aiText]);

  async function toggleCamera() {
    if (cameraOn) { stopFrames(); setCameraOn(false); return; }
    if (!camPermission?.granted) {
      const res = await requestCamPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
    setTimeout(startFrames, 800);
  }

  function toggleMute() {
    const next = !micMuted;
    setMicMuted(next);
    sessionRef.current?.setMicMuted(next);
  }

  const handleClose = useCallback(async () => {
    stopFrames();
    await sessionRef.current?.close();
    sessionRef.current = null;
    setAiText(''); setUserText(''); setMicMuted(false); setCameraOn(false); setErrorDetail('');
    setStatus('connecting');
    onClose();
  }, [onClose, stopFrames]);

  function onPillPress() {
    if (status === 'speaking') sessionRef.current?.interrupt();
  }

  if (!visible) return null;

  const firstName = (user?.fullName || user?.email || 'there').split(' ')[0].split('@')[0];
  const aiSpeaking = status === 'speaking';
  const statusLine =
    status === 'connecting' || status === 'connected' ? 'Connecting…'
    : status === 'reconnecting' ? 'Reconnecting…'
    : status === 'rate_limited' ? 'Busy — retrying…'
    : status === 'error' ? 'Connection error'
    : micMuted ? 'Mic muted'
    : aiSpeaking ? 'Speaking — tap the pill to interrupt'
    : 'Listening…';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.root, cameraOn && { backgroundColor: '#000' }]}>
        {/* Full-screen camera when enabled (point-and-talk) */}
        {cameraOn && (
          <>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} />
            <View style={styles.cameraScrim} />
            <View style={[styles.cameraBadge, { top: insets.top + 12 }]}>
              <View style={styles.liveDot} />
              <Text style={styles.cameraBadgeText}>Camera live — point & talk</Text>
            </View>
          </>
        )}

        <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
          {aiText ? (
            <ScrollView ref={aiScrollRef} style={styles.aiScroll} contentContainerStyle={styles.aiScrollContent}>
              <Text style={[styles.aiSpeech, cameraOn && styles.textOnCamera]}>{aiText}</Text>
            </ScrollView>
          ) : (
            <View style={styles.centerBlock}>
              {!cameraOn && <Image source={LB_LOGO} style={styles.logo} resizeMode="contain" />}
              <Text style={[styles.greeting, cameraOn && styles.textOnCamera]}>How can I help, {firstName}?</Text>
              <Text style={[styles.statusLine, cameraOn && styles.textOnCameraDim]}>{statusLine}</Text>
              {status === 'error' && !!errorDetail && (
                <Text style={styles.errorDetail}>{errorDetail}</Text>
              )}
            </View>
          )}

          <View style={styles.bottomArea}>
            {!!userText && (
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{userText}</Text>
              </View>
            )}
            {!!aiText && <Text style={styles.statusLineSmall}>{statusLine}</Text>}

            <View style={[styles.controls, { marginBottom: insets.bottom + 14 }]}>
              <TouchableOpacity style={[styles.sideBtn, cameraOn && styles.sideBtnActive]} onPress={toggleCamera}>
                <MaterialCommunityIcons name={cameraOn ? 'camera' : 'camera-outline'} size={24} color={cameraOn ? '#fff' : COLORS.text} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.sideBtn} onPress={() => Alert.alert('Upload', 'File upload in voice mode is coming soon.')}>
                <MaterialCommunityIcons name="plus" size={24} color={COLORS.text} />
              </TouchableOpacity>

              {/* Center pill */}
              <TouchableOpacity activeOpacity={0.8} onPress={onPillPress}>
                <Animated.View style={[styles.pill, { transform: [{ scale: pulse }] }, aiSpeaking && styles.pillSpeaking]}>
                  <MaterialCommunityIcons name={aiSpeaking ? 'volume-high' : 'waveform'} size={26} color={aiSpeaking ? '#fff' : COLORS.primary} />
                </Animated.View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.sideBtn, micMuted && styles.sideBtnMuted]} onPress={toggleMute}>
                <MaterialCommunityIcons name={micMuted ? 'microphone-off' : 'microphone'} size={24} color={micMuted ? '#fff' : COLORS.text} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.sideBtn} onPress={handleClose}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: 'space-between' },
  cameraScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  cameraBadge: {
    position: 'absolute', alignSelf: 'center', zIndex: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
  },
  cameraBadgeText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error },
  textOnCamera: { color: '#fff' },
  textOnCameraDim: { color: 'rgba(255,255,255,0.85)' },
  errorDetail: {
    fontSize: 13, color: COLORS.error, textAlign: 'center', marginTop: 14,
    paddingHorizontal: 20, lineHeight: 19,
  },
  centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { width: 96, height: 96, marginBottom: 20 },
  greeting: { fontSize: 26, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  statusLine: { fontSize: 15, color: COLORS.textSecondary, marginTop: 12 },
  statusLineSmall: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 10 },
  aiScroll: { flex: 1, marginTop: 40 },
  aiScrollContent: { paddingHorizontal: 26, paddingBottom: 16 },
  aiSpeech: { fontSize: 24, lineHeight: 34, color: COLORS.text, fontWeight: '500' },
  bottomArea: { paddingHorizontal: 16 },
  userBubble: {
    alignSelf: 'center', backgroundColor: '#e9edf3', borderRadius: 18,
    paddingHorizontal: 16, paddingVertical: 10, marginBottom: 14, maxWidth: '92%',
  },
  userBubbleText: { fontSize: 15, color: '#3a3f45', lineHeight: 21 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  sideBtn: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  sideBtnActive: { backgroundColor: COLORS.primary },
  sideBtnMuted: { backgroundColor: COLORS.error },
  pill: {
    width: 96, height: 56, borderRadius: 28, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center', elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    borderWidth: 1, borderColor: COLORS.border,
  },
  pillSpeaking: {
    backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight,
    shadowColor: COLORS.primary, shadowOpacity: 0.6,
  },
});
