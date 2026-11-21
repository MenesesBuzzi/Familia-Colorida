import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useVoiceRecorder } from '../../lib/audio/useVoiceRecorder';
import { useAudio } from '../../lib/audio/context';
import { MAX_VOICE_SEC } from '../../lib/radio/queue';
import { palette } from '../../theme';

/**
 * Botão "segure para falar" (walkie-talkie e mensagens de voz).
 * onSend({ uri, durationMs }) -> Promise (envia o áudio). onError(texto).
 */
export default function HoldToTalk({
  onSend,
  onError,
  label = '🎙️ Segure para FALAR',
  color = palette.coral,
  compact = false,
  maxSec = MAX_VOICE_SEC,
  disabled,
}) {
  const { recording, start, stop } = useVoiceRecorder();
  const { setDuck } = useAudio();
  const [sending, setSending] = useState(false);
  const [secs, setSecs] = useState(0);
  const timer = useRef(null);
  const auto = useRef(null);

  useEffect(() => {
    setDuck('gravando', recording);
    if (!recording) return undefined;
    const t0 = Date.now();
    setSecs(0);
    timer.current = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(timer.current);
  }, [recording, setDuck]);

  useEffect(() => () => setDuck('gravando', false), [setDuck]);

  const release = async () => {
    clearTimeout(auto.current);
    let clip = null;
    try {
      clip = await stop();
    } catch (e) {
      onError?.(e?.message || String(e));
      return;
    }
    if (!clip) return;
    setSending(true);
    try {
      await onSend(clip);
    } catch (e) {
      onError?.(e?.message || String(e));
    } finally {
      setSending(false);
    }
  };

  const press = async () => {
    if (disabled || sending) return;
    try {
      await start();
      auto.current = setTimeout(release, maxSec * 1000);
    } catch (e) {
      onError?.(e?.message || String(e));
    }
  };

  const size = compact ? 44 : undefined;
  const bg = recording ? palette.coral : sending ? '#999' : color;
  return (
    <Pressable
      onPressIn={press}
      onPressOut={release}
      disabled={disabled}
      accessibilityLabel="Segure para gravar"
      style={({ pressed }) => [
        compact
          ? { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }
          : { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginVertical: 6 },
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        (pressed || recording) && { transform: [{ scale: 1.05 }] },
      ]}
    >
      {compact ? (
        <Text style={{ fontSize: 20 }}>{recording ? '⏺️' : sending ? '⏳' : '🎤'}</Text>
      ) : (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>
            {recording ? `🔴 Gravando... ${secs}s (solte para enviar)` : sending ? '⏳ Enviando...' : label}
          </Text>
          {!recording && !sending ? (
            <Text style={{ color: '#ffffffCC', fontSize: 12, marginTop: 2 }}>até {maxSec} segundos</Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
