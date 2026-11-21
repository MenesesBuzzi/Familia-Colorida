import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useAudio, useAudioStatus } from '../../lib/audio/context';
import { errorMessage } from '../../lib/supabase';
import { useInterval, useRealtime } from '../../lib/realtime';
import { advanceRadio, loadLive, removeFromQueue, sendVoice, setMic, voteQueue } from '../../lib/radio/library';
import { applyVote, nextVote } from '../../lib/radio/ranking';
import {
  canControl,
  canGrantMic,
  canTalk,
  expectedPosition,
  formatDuration,
  micHolders,
  rankQueue,
  trackEnded,
} from '../../lib/radio/queue';
import HoldToTalk from '../audio/HoldToTalk';
import VoiceMessage from '../audio/VoiceMessage';
import { Avatar, Badge, Btn, Card, H2, P, Row, useTheme } from '../ui';
import { palette } from '../../theme';

/**
 * Aba "🎧 Ao vivo" da Rádio Amigo (v3): o que está tocando, controles do dono,
 * fila da Biblioteca com votos, walkie-talkie e "passar o microfone".
 */
export default function LivePanel({ room, members, me, nickname, onOpenLibrary, onError }) {
  const t = useTheme();
  const audio = useAudio();
  const playerStatus = useAudioStatus();
  const [live, setLive] = useState({ queue: [], votes: [], voice: [] });
  const [busy, setBusy] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef(null);
  const roomId = room.id;
  const owner = canControl(room, me);
  const talk = canTalk(room, members, me);
  const tunedHere = audio.radio.roomId === roomId;
  const r = tunedHere && audio.radio.room ? { ...room, ...audio.radio.room } : room;

  const reload = useCallback(async () => {
    try {
      setLive(await loadLive(roomId));
    } catch (e) {
      onError?.(errorMessage(e));
    }
  }, [roomId, onError]);

  useEffect(() => {
    reload();
    return () => clearTimeout(timer.current);
  }, [reload]);

  // Liga a rádio neste celular ao abrir (se nenhuma outra estiver tocando)
  const { tuneIn } = audio;
  const tunedOther = audio.radio.roomId;
  useEffect(() => {
    if (!tunedOther) tuneIn(roomId);
    // só na primeira abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useRealtime(
    `radio-live:${roomId}`,
    [
      { table: 'radio_queue', filter: `room_id=eq.${roomId}` },
      { table: 'radio_queue_votes', filter: `room_id=eq.${roomId}` },
      { table: 'radio_voice', filter: `room_id=eq.${roomId}` },
    ],
    () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(reload, 300);
    }
  );
  useInterval(reload, 25000);
  useInterval(() => setNow(Date.now()), 1000);

  // Dono sem ouvir neste celular: avança a fila pelo relógio quando a música acaba
  useInterval(
    () => {
      if (owner && !tunedHere && trackEnded(r, r.now_duration)) advanceRadio(r).catch(() => {});
    },
    5000,
    owner && !tunedHere
  );

  const ranked = useMemo(() => rankQueue(live.queue, live.votes, me), [live, me]);
  const holders = micHolders(room, members);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      await reload();
    } catch (e) {
      onError?.(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const onVote = async (item, pressed) => {
    const value = nextVote(item.myVote, pressed);
    setLive((d) => ({
      ...d,
      votes: applyVote(
        d.votes.map((v) => ({ song_id: v.queue_id, user_id: v.user_id, value: v.value })),
        item.id,
        me,
        value
      ).map((v) => ({ queue_id: v.song_id, user_id: v.user_id, value: v.value })),
    }));
    try {
      await voteQueue(roomId, item.id, me, value);
    } catch (e) {
      onError?.(errorMessage(e));
      reload();
    }
  };

  const hasTrack = !!r.now_track_id;
  const duration = r.now_duration || (tunedHere ? playerStatus?.duration : 0) || 0;
  const pos = tunedHere && playerStatus ? playerStatus.position : expectedPosition(r, now, duration);

  return (
    <View>
      {/* ---------------- Tocando agora ---------------- */}
      <Card color={palette.coral}>
        <Row style={{ alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 40 }}>{hasTrack && r.now_playing ? '🎶' : '📻'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.muted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>Tocando agora</Text>
            <Text style={{ fontWeight: '900', fontSize: 18, color: t.text }} numberOfLines={2}>
              {hasTrack ? r.now_title : 'Nada tocando'}
            </Text>
            {hasTrack ? (
              <P muted style={{ fontSize: 14 }}>
                {[r.now_artist, `${formatDuration(pos)}${duration ? ` / ${formatDuration(duration)}` : ''}`].filter(Boolean).join(' · ')}
                {r.now_playing ? '' : ' · ⏸️ pausada'}
              </P>
            ) : (
              <P muted style={{ fontSize: 14 }}>
                {owner ? 'Coloque músicas na fila e toque ▶️.' : 'Esperando o dono da rádio dar o play.'}
              </P>
            )}
          </View>
        </Row>
        {duration > 0 && hasTrack ? (
          <View style={{ height: 6, borderRadius: 3, backgroundColor: t.cardAlt, marginTop: 10, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (pos / duration) * 100)}%`, height: 6, backgroundColor: palette.coral }} />
          </View>
        ) : null}

        {owner ? (
          <Row gap={8} style={{ marginTop: 10 }}>
            {hasTrack ? (
              <Btn
                small
                style={{ flex: 1 }}
                color={palette.coral}
                title={r.now_playing ? '⏸️ Pausar' : '▶️ Tocar'}
                loading={busy === 'pp'}
                onPress={() => run('pp', () => audio.control(r.now_playing ? 'pause' : 'play', { roomId }))}
              />
            ) : (
              <Btn
                small
                style={{ flex: 1 }}
                color={palette.coral}
                title="▶️ Começar"
                loading={busy === 'pp'}
                onPress={() => run('pp', () => audio.control('skip', { roomId }))}
              />
            )}
            <Btn
              small
              style={{ flex: 1 }}
              color={palette.grape}
              title="⏭️ Pular"
              disabled={!hasTrack}
              loading={busy === 'skip'}
              onPress={() => run('skip', () => audio.control('skip', { roomId }))}
            />
            <Btn
              small
              variant="outline"
              color={palette.coral}
              title="⏹️"
              disabled={!hasTrack}
              onPress={() => run('stop', () => audio.control('stop', { roomId }))}
            />
          </Row>
        ) : (
          <P muted style={{ fontSize: 12, marginTop: 8 }}>
            Só quem criou a rádio dá play, pausa e pula. Você vota na fila! 👇
          </P>
        )}

        <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ color: t.text, fontWeight: '700', flex: 1 }}>
            {tunedHere ? '🔊 Ouvindo neste celular' : '🔇 Não está tocando neste celular'}
          </Text>
          <Switch
            value={tunedHere}
            onValueChange={(v) => (v ? audio.tuneIn(roomId) : audio.tuneOut())}
            trackColor={{ true: palette.leaf }}
          />
        </Row>
        {tunedHere && audio.radio.suspended ? (
          <P muted style={{ fontSize: 12 }}>⏸️ Pausada aqui enquanto você joga Lobisomem. Volta sozinha depois.</P>
        ) : null}
        {tunedHere ? (
          <P muted style={{ fontSize: 12 }}>Continua tocando em outras telas e com o celular bloqueado (no APK).</P>
        ) : null}
      </Card>

      {/* ---------------- Walkie-talkie ---------------- */}
      <Card color={palette.orange}>
        <H2>📢 Walkie-talkie</H2>
        {audio.radio.voiceNow && tunedHere ? (
          <P style={{ fontWeight: '800', color: palette.orange }}>🎙️ {audio.radio.voiceNow.nickname} está falando...</P>
        ) : null}
        {talk ? (
          <HoldToTalk
            color={palette.orange}
            onSend={(clip) => sendVoice({ roomId, userId: me, nickname, ...clip }).then(reload)}
            onError={onError}
          />
        ) : (
          <P muted style={{ fontSize: 14 }}>
            🎤 Só quem está com o microfone fala. Peça para {holders[0]?.nickname || 'o dono'} passar para você!
          </P>
        )}
        {!tunedHere ? <P muted style={{ fontSize: 12 }}>Ligue “Ouvindo neste celular” para as falas tocarem sozinhas.</P> : null}
        {live.voice.length ? (
          <View style={{ marginTop: 6 }}>
            {live.voice.slice(0, 4).map((v) => (
              <Row key={v.id} gap={8}>
                <Text style={{ color: t.muted, fontSize: 13, width: 90 }} numberOfLines={1}>
                  {v.nickname}
                </Text>
                <VoiceMessage path={v.storage_path} durationMs={v.duration_ms} color={t.text} />
              </Row>
            ))}
          </View>
        ) : null}

        {owner ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: t.muted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', marginBottom: 4 }}>
              Passar o microfone
            </Text>
            {members.filter((m) => m.user_id !== me).length === 0 ? (
              <P muted style={{ fontSize: 13 }}>Ninguém mais na rádio ainda. Compartilhe o código!</P>
            ) : (
              members
                .filter((m) => canGrantMic(room, me, m.user_id))
                .map((m) => (
                  <Row key={m.user_id} style={{ paddingVertical: 4 }}>
                    <Avatar name={m.nickname} uri={m.avatar_url} size={30} />
                    <Text style={{ flex: 1, color: t.text, fontWeight: '700' }}>{m.nickname}</Text>
                    <Switch
                      value={!!m.can_talk}
                      onValueChange={(v) => run(`mic${m.user_id}`, () => setMic(roomId, m.user_id, v))}
                      trackColor={{ true: palette.orange }}
                    />
                  </Row>
                ))
            )}
          </View>
        ) : null}
      </Card>

      {/* ---------------- Fila da Biblioteca ---------------- */}
      <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <H2 style={{ marginBottom: 0 }}>🎵 Próximas ({ranked.length})</H2>
        <Btn small title="📚 Biblioteca" color={palette.sky} onPress={onOpenLibrary} />
      </Row>
      <P muted style={{ fontSize: 13, marginBottom: 8 }}>
        A mais votada toca primeiro. Fila vazia? Toca uma música surpresa da Biblioteca.
      </P>
      {ranked.length === 0 ? (
        <P muted center>Fila vazia. Abra a 📚 Biblioteca e coloque músicas aqui!</P>
      ) : (
        ranked.map((s, i) => {
          const color = s.score > 0 ? palette.leaf : s.score < 0 ? palette.coral : palette.sun;
          return (
            <Card key={s.id} color={color} style={{ paddingVertical: 10 }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 17, fontWeight: '900', color, width: 30 }}>#{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: t.text }} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <P muted style={{ fontSize: 13 }} numberOfLines={1}>
                    {[s.artist, s.duration_sec ? formatDuration(s.duration_sec) : null, s.added_by_name ? `por ${s.added_by_name}` : null]
                      .filter(Boolean)
                      .join(' · ') || ' '}
                  </P>
                </View>
                {s.added_by === me || owner ? (
                  <Pressable hitSlop={8} onPress={() => run(`rm${s.id}`, () => removeFromQueue(s.id))}>
                    <Text style={{ fontSize: 16, color: t.muted }}>✕</Text>
                  </Pressable>
                ) : null}
              </Row>
              <Row gap={8} style={{ marginTop: 6 }}>
                <Vote emoji="👍" count={s.up} active={s.myVote === 1} color={palette.leaf} onPress={() => onVote(s, 1)} />
                <Vote emoji="👎" count={s.down} active={s.myVote === -1} color={palette.coral} onPress={() => onVote(s, -1)} />
                {owner ? (
                  <Btn
                    small
                    title="▶️ Tocar já"
                    color={palette.coral}
                    style={{ marginLeft: 'auto' }}
                    loading={busy === `play${s.id}`}
                    onPress={() => run(`play${s.id}`, () => audio.control('queue', { roomId, queueId: s.id }))}
                  />
                ) : (
                  <Badge text={`${s.score > 0 ? '+' : ''}${s.score}`} color={color} />
                )}
              </Row>
            </Card>
          );
        })
      )}
    </View>
  );
}

function Vote({ emoji, count, active, color, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: active ? color : 'transparent',
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <Text style={{ fontWeight: '800', color: active ? '#fff' : color }}>{count}</Text>
    </Pressable>
  );
}
