import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

/**
 * On-device speech-to-text dictation.
 *
 * Tap to start: spoken words are appended to whatever is already in the field
 * (via `onText`) so the user can keep typing/editing afterwards. Tap again to
 * stop. Fully on-device — no AI round-trip, and independent of the live-audio
 * mic path used by the voice conversation.
 *
 * Maturity details:
 *  - Final phrases are committed to a running base, so each new phrase is
 *    appended rather than overwriting the last one.
 *  - The recogniser naturally ends after a pause; while the user still wants to
 *    dictate we transparently restart it, so a breath or a comma never ends the
 *    session. Only an explicit stop (or an error) ends dictation.
 */
// Map the user's chosen answer-language to a speech-recognition locale.
// Pidgin has no official voice code — the English (Nigeria) recogniser handles
// it best, since Pidgin is English-based.
function langToLocale(language?: string): string {
  switch ((language || 'en').toLowerCase()) {
    case 'ha': return 'ha-NG';
    case 'yo': return 'yo-NG';
    case 'ig': return 'ig-NG';
    case 'pcm':
    case 'en':
    default:   return 'en-NG';
  }
}

export function useDictation(onText: (full: string) => void, language?: string) {
  const [listening, setListening] = useState(false);
  // Everything already committed (text before this session + finished phrases).
  const baseRef = useRef('');
  // Whether the user still wants to dictate (vs. the engine auto-ending on pause).
  const wantRef = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Locale actually in use — may fall back to en-NG if the phone can't do the
  // chosen language. Kept in a ref so restarts after a pause reuse it.
  const localeRef = useRef(langToLocale(language));
  // So we only warn the user once per session about a fallback.
  const warnedFallbackRef = useRef(false);

  const clearRestart = () => {
    if (restartTimer.current) { clearTimeout(restartTimer.current); restartTimer.current = null; }
  };

  const join = (base: string, phrase: string) =>
    base ? `${base.replace(/\s+$/, '')} ${phrase}` : phrase;

  const beginRecognition = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.start({
        lang: localeRef.current,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
      });
    } catch {
      wantRef.current = false;
      setListening(false);
      Alert.alert('Voice input', 'Speech recognition is unavailable on this device.');
    }
  }, []);

  useSpeechRecognitionEvent('start', () => setListening(true));

  useSpeechRecognitionEvent('end', () => {
    // The engine stops itself after a pause. If the user hasn't tapped stop,
    // restart so dictation feels continuous.
    if (wantRef.current) {
      clearRestart();
      restartTimer.current = setTimeout(beginRecognition, 150);
    } else {
      setListening(false);
    }
  });

  useSpeechRecognitionEvent('result', (e) => {
    const res = e.results?.[0];
    const phrase = res?.transcript ?? '';
    if (!phrase) return;
    onText(join(baseRef.current, phrase));
    // Commit final phrases to the base so the next phrase appends after them.
    if (e.isFinal) {
      baseRef.current = join(baseRef.current, phrase);
    }
  });

  useSpeechRecognitionEvent('error', (e) => {
    // "no-speech" just means a silent stretch — keep going if still wanted.
    if ((e.error === 'no-speech' || e.error === 'aborted') && wantRef.current) return;

    // The library doesn't expose a dedicated "language not supported" code, so
    // an unavailable Nigerian-language pack surfaces as a generic error. If a
    // non-English session fails before producing any text, fall back to English
    // (Nigeria) ONCE — keeping the session alive and warning the user a single
    // time. The one-shot guard prevents any restart loop.
    const err = String(e.error);
    const couldBeLanguage = err === 'client' || err === 'unknown' || err === 'service-not-allowed' || err === 'network';
    const gotNoTextYet = baseRef.current === '' ;
    if (couldBeLanguage && wantRef.current && localeRef.current !== 'en-NG' && !warnedFallbackRef.current && gotNoTextYet) {
      localeRef.current = 'en-NG';
      warnedFallbackRef.current = true;
      Alert.alert('Voice input', 'This phone cannot yet transcribe that language, so voice typing will use English. Your answers will still come back in your chosen language.');
      clearRestart();
      restartTimer.current = setTimeout(beginRecognition, 150);
      return;
    }

    wantRef.current = false;
    clearRestart();
    setListening(false);
    if (e.error === 'aborted') return;
    Alert.alert('Voice input', `Could not capture speech (${e.error}). Please try again.`);
  });

  const stop = useCallback(() => {
    wantRef.current = false;
    clearRestart();
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setListening(false);
  }, []);

  const start = useCallback(async (currentText: string) => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Microphone needed',
        'Please allow microphone and speech recognition access to dictate messages.',
      );
      return;
    }
    baseRef.current = currentText ?? '';
    wantRef.current = true;
    // Start from the user's currently chosen language each session.
    localeRef.current = langToLocale(language);
    warnedFallbackRef.current = false;
    beginRecognition();
  }, [beginRecognition, language]);

  const toggle = useCallback(
    (currentText: string) => {
      if (wantRef.current) stop();
      else start(currentText);
    },
    [start, stop],
  );

  return { listening, toggle, stop };
}
