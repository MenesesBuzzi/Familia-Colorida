import React, { useEffect, useId, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { signedUrl } from '../../lib/audio/files';
import { useAudio } from '../../lib/audio/context';

/** Bolinha "▶️ 0:07" que toca uma mensagem de voz guardada no bucket privado "voz". */
export default function VoiceMessage({ path, durationMs, color = '#fff', bucket = 'voz' }) {
  const [state, setState] = useState('parado'); // parado | carregando | tocando | erro
  const player = useRef(null);
  const sub = useRef(null);
  const { setDuck } = useAudio();
  const key = useRef(`voz-${useId()}`);

  const cleanup = () => {
    try {
      sub.current?.remove();
      player.current?.remove();
    } catch {
      // ignora
    }
    sub.current = null;
    player.current = null;
  };

  useEffect(
    () => () => {
      cleanup();
      setDuck(key.current, false);
    },
    [setDuck]
  );

  const toggle = async () => {
    if (state === 'tocando') {
      cleanup();
      setDuck(key.current, false);
      setState('parado');
      return;
    }
    setState('carregando');
    try {
      const url = await signedUrl(bucket, path);
      cleanup();
      player.current = createAudioPlayer({ uri: url }, { updateInterval: 300 });
      sub.current = player.current.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish || s.error) {
          cleanup();
          setDuck(key.current, false);
          setState(s.error ? 'erro' : 'parado');
        }
      });
      setDuck(key.current, true);
      player.current.play();
      setState('tocando');
    } catch (e) {
      console.log('[voz]', e?.message || e);
      setState('erro');
    }
  };

  const secs = Math.max(1, Math.round((durationMs || 0) / 1000));
  const icon = state === 'tocando' ? '⏹️' : state === 'carregando' ? '⏳' : state === 'erro' ? '⚠️' : '▶️';
  return (
    <Pressable onPress={toggle} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={{ color, fontWeight: '800' }}>
        🎤 {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
      </Text>
    </Pressable>
  );
}
