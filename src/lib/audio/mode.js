import { setAudioModeAsync } from 'expo-audio';

// Modo de áudio do app inteiro: toca no modo silencioso e continua tocando em segundo plano
// (no APK; no Expo Go o segundo plano pode parar). 'doNotMix' é exigido pelos controles da tela de bloqueio.
export const BASE_AUDIO_MODE = {
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix',
  allowsRecording: false,
  shouldRouteThroughEarpiece: false,
};

export async function applyAudioMode(extra = {}) {
  try {
    await setAudioModeAsync({ ...BASE_AUDIO_MODE, ...extra });
  } catch (e) {
    console.log('[audio] modo de áudio:', e?.message || e);
  }
}
