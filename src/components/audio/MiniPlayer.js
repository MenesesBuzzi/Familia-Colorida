import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudio } from '../../lib/audio/context';
import { useNav } from '../../lib/nav';

/**
 * Barrinha da Rádio que aparece em TODAS as telas enquanto você está ouvindo uma rádio:
 * música atual, play/pause (só o dono), abrir a rádio e parar de ouvir.
 */
export default function MiniPlayer() {
  const { radio, control, tuneOut } = useAudio();
  const nav = useNav();
  if (!radio.roomId || !radio.room) return null;
  const r = radio.room;
  const hasTrack = !!r.now_track_id;
  const playing = hasTrack && r.now_playing;
  const subtitle = radio.voiceNow
    ? `🎙️ ${radio.voiceNow.nickname} está falando...`
    : radio.suspended && playing
      ? '⏸️ Pausada enquanto o Lobisomem rola'
      : hasTrack
        ? r.now_artist || r.name
        : 'Nada tocando agora';

  return (
    <View style={styles.bar}>
      <Pressable style={styles.info} onPress={() => nav.push('RadioRoom', { roomId: r.id })} accessibilityLabel="Abrir a rádio">
        <Text style={styles.emoji}>{playing ? '🎶' : '📻'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {hasTrack ? r.now_title : r.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>
      {radio.isOwner && hasTrack ? (
        <>
          <Pressable hitSlop={8} onPress={() => control(playing ? 'pause' : 'play').catch(() => {})} accessibilityLabel={playing ? 'Pausar' : 'Tocar'}>
            <Text style={styles.btn}>{playing ? '⏸️' : '▶️'}</Text>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => control('skip').catch(() => {})} accessibilityLabel="Próxima">
            <Text style={styles.btn}>⏭️</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable hitSlop={8} onPress={tuneOut} accessibilityLabel="Parar de ouvir">
        <Text style={[styles.btn, { fontSize: 18 }]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 10,
    marginBottom: 6,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#2B2140',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 24 },
  title: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sub: { color: '#FFFFFFAA', fontSize: 12, fontWeight: '600' },
  btn: { fontSize: 24, color: '#fff' },
});
