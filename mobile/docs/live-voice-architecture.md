# Live Voice + Video Assistant — Implementation Brief (LegalBridge)

Real-time, hands-free voice conversation with the AI (you talk, it talks back),
with live camera video ("point and talk" — the AI sees what the camera sees) and
live transcription of both sides. Built on Google **Gemini Live API**
(`BidiGenerateContent` bidirectional WebSocket).

## Architecture

```
[Phone app] ⇄ WebSocket ⇄ [backend proxy /ws/live] ⇄ WebSocket ⇄ [Gemini Live API]
```

The phone never talks to Google directly — it talks to our proxy, which holds the
Gemini key server-side. In LegalBridge the proxy is the Supabase Edge Function
`functions/v1/live`.

## Libraries

Client (React Native / Expo):
- `react-native-live-audio-stream` — streams mic as raw PCM16 @16 kHz (native module → needs an EAS build, not Expo Go)
- Audio playback + mic permission — AboyAI uses `expo-av`; **LegalBridge uses `expo-audio`** (expo-av has no SDK 56 build)
- `expo-camera` (`CameraView`) — grabs JPEG frames for live video
- `expo-file-system` — writes the AI's audio to a temp WAV for playback

Backend: thin WebSocket proxy. Gemini model: `models/gemini-2.5-flash-native-audio-latest`.

## Proxy (≈50 lines)
1. Accept the phone's WebSocket.
2. Open a WebSocket to Gemini `...BidiGenerateContent?key=API_KEY`.
3. Relay both directions. **Critical transform:** Gemini sends JSON in *binary*
   frames; RN can't read binary WS frames → decode bytes→UTF-8 text before
   forwarding to the phone.

## Client session flow
1. Request mic permission; route playback to loudspeaker (not earpiece).
2. Open WebSocket to the proxy.
3. On open, wait ~50 ms, then send `setup` (model, `responseModalities:['AUDIO']`,
   system instruction, `inputAudioTranscription` + `outputAudioTranscription`).
4. Wait for `setupComplete` — only THEN start the mic.
5. Voice in: stream mic PCM16 @16 kHz as base64 in
   `realtimeInput.mediaChunks` (`audio/pcm;rate=16000`).
6. Video in: camera frames as base64 JPEG (`image/jpeg`), one every 1–2 s.
7. Voice out: Gemini streams PCM16 @24 kHz; buffer per turn, wrap in WAV header, play.
8. Transcription: `inputTranscription` (user) + `outputTranscription` (AI) → live captions.
9. On `turnComplete` / `interrupted`, flush or drop the audio buffer.

## Hard-won gotchas
1. **Half-duplex echo control:** while AI audio plays, gate the outgoing mic.
   Otherwise Gemini hears itself and self-interrupts. Resume mic when playback ends.
2. Android `audioSource: 6` (VOICE_RECOGNITION) for hardware echo cancellation.
3. Never send a duplicate `setup` on the same socket → Gemini kills it (1007).
   If no `setupComplete` in ~5 s, reconnect.
4. Don't send audio/video before `setupComplete` — breaks the handshake.
5. Defer the `setup` send by a tick after `onopen` (synchronous sends drop on RN Android).
6. Audio out is 24 kHz, mic in is 16 kHz — don't mix them up.
7. Set `ws.binaryType = 'arraybuffer'` on the client as a fallback decoder.
8. Needs a native build (mic module) → ships via `eas build`, not OTA.

## LegalBridge specifics
- System instruction is the legal tone map (see `buildLiveSystemInstruction` in
  `services/geminiLive.ts`), with the disclaimer that this is general information,
  not legal advice.
- Everything else (proxy, audio plumbing, video frames, transcription) is identical.

## Status notes (LegalBridge)
- All of the above is implemented in `services/geminiLive.ts` + `components/VoiceConversation.tsx`.
- On SDK 56 New Architecture the open question is whether
  `react-native-live-audio-stream` actually streams mic data. The on-screen
  **LIVE DIAGNOSTICS** panel reports `mic chunks sent` to confirm this on device.
</content>
