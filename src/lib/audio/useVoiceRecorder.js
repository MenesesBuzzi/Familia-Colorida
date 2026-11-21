import { useCallback, useRef, useState } from 'react';
import { AudioQuality, IOSOutputFormat, requestRecordingPermissionsAsync, useAudioRecorder } from 'expo-audio';
import { applyAudioMode } from './mode';

// Voz curta e leve: m4a/AAC mono 32 kbps (~4 KB por segundo). Funciona no Expo Go.
export const VOICE_PRESET = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

const MIN_MS = 500;

/**
 * Gravador de "segurar para falar".
 * start() pede a permissão do microfone na primeira vez; stop() devolve { uri, durationMs } ou null (curto demais).
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(VOICE_PRESET);
  const [recording, setRecording] = useState(false);
  const startedAt = useRef(0);
  const starting = useRef(null);
  const active = useRef(false);

  const start = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    starting.current = (async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error('Permita o uso do microfone nas configurações do celular.');
      await applyAudioMode({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setRecording(true);
    })();
    try {
      await starting.current;
    } catch (e) {
      active.current = false;
      setRecording(false);
      await applyAudioMode();
      throw e;
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    if (!active.current) return null;
    try {
      await starting.current;
    } catch {
      return null;
    }
    active.current = false;
    const ms = Date.now() - startedAt.current;
    try {
      await recorder.stop();
    } finally {
      setRecording(false);
      await applyAudioMode();
    }
    if (ms < MIN_MS || !recorder.uri) return null;
    return { uri: recorder.uri, durationMs: ms };
  }, [recorder]);

  return { recording, start, stop };
}
