import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Share, Text, View } from 'react-native';
import { useNav } from '../../lib/nav';
import { useAudio } from '../../lib/audio/context';
import { errorMessage } from '../../lib/supabase';
import { useInterval, useRealtime } from '../../lib/realtime';
import { addSong, deleteRadio, leaveRadio, loadRadio, removeSong, suggestWithAI, vote } from '../../lib/radio/api';
import {
  applyVote,
  nextVote,
  playlistText,
  rankSongs,
  spotifySearchUrl,
  youtubeSearchUrl,
} from '../../lib/radio/ranking';
import CodeBox from '../../components/CodeBox';
import LivePanel from '../../components/radio/LivePanel';
import { Avatar, Badge, Btn, Card, ErrorText, Field, H2, Loading, P, Row, Screen } from '../../components/ui';
import { palette } from '../../theme';

export default function RadioRoomScreen({ roomId }) {
  const nav = useNav();
  const audio = useAudio();
  const me = nav.user?.id;
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('aovivo'); // v3: aba ao vivo (Biblioteca de MP3) abre primeiro
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const timer = useRef(null);

  const reload = useCallback(async () => {
    try {
      const d = await loadRadio(roomId);
      setData(d);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [roomId]);

  useEffect(() => {
    let alive = true;
    loadRadio(roomId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(errorMessage(e)));
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [roomId]);

  // Realtime: qualquer mudança na fila/votos/membros recarrega (agrupando várias em uma)
  useRealtime(
    roomId ? `radio:${roomId}` : null,
    [
      { table: 'radio_songs', filter: `room_id=eq.${roomId}` },
      { table: 'radio_votes', filter: `room_id=eq.${roomId}` },
      { table: 'radio_members', filter: `room_id=eq.${roomId}` },
      { table: 'radio_rooms', filter: `id=eq.${roomId}` },
    ],
    () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(reload, 300);
    }
  );
  useInterval(reload, 20000, !!roomId);

  const ranked = useMemo(() => (data ? rankSongs(data.songs, data.votes, me) : []), [data, me]);
  const room = data?.room;
  const isOwner = room?.owner_id === me;

  const onVote = async (song, pressed) => {
    const value = nextVote(song.myVote, pressed);
    setData((d) => (d ? { ...d, votes: applyVote(d.votes, song.id, me, value) } : d));
    try {
      await vote(roomId, song.id, me, value);
    } catch (e) {
      setErr(errorMessage(e));
      reload();
    }
  };

  const onAdd = async () => {
    const t = title.trim();
    const a = artist.trim();
    if (!t || !a) return setErr('Preencha a música e o artista.');
    setBusy('add');
    setErr('');
    setInfo('');
    try {
      const id = await addSong(roomId, t, a);
      if (id) {
        setTitle('');
        setArtist('');
        await vote(roomId, id, me, 1).catch(() => {}); // quem sugere já vota 👍
      } else setInfo('Essa música já está na fila 😉');
      await reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
    return null;
  };

  const onAI = async () => {
    setBusy('ai');
    setErr('');
    setInfo('');
    try {
      const n = await suggestWithAI(roomId, ranked);
      setInfo(n ? `🤖 A IA colocou ${n} música${n > 1 ? 's' : ''} na fila. Votem!` : 'A IA só sugeriu músicas que já estavam na fila.');
      await reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const onRemove = (song) =>
    Alert.alert('Tirar da fila?', `${song.title} — ${song.artist}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Tirar',
        style: 'destructive',
        onPress: () =>
          removeSong(song.id)
            .then(reload)
            .catch((e) => setErr(errorMessage(e))),
      },
    ]);

  const onLeave = () =>
    Alert.alert(
      isOwner ? 'Apagar a rádio?' : 'Sair da rádio?',
      isOwner ? 'A fila e os votos de todo mundo serão apagados.' : 'Você pode voltar depois com o código.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isOwner ? 'Apagar' : 'Sair',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isOwner) await deleteRadio(roomId);
              else await leaveRadio(roomId, me);
              if (audio.radio.roomId === roomId) audio.tuneOut();
              nav.back();
            } catch (e) {
              setErr(errorMessage(e));
            }
          },
        },
      ]
    );

  const open = (url) => Linking.openURL(url).catch(() => setErr('Não consegui abrir o link.'));

  if (!data) {
    return (
      <Screen title="📻 Rádio Amigo" onBack={nav.back}>
        <ErrorText>{err}</ErrorText>
        {err ? <Btn title="Tentar de novo" onPress={reload} /> : <Loading text="Sintonizando..." />}
      </Screen>
    );
  }

  if (!room) {
    return (
      <Screen title="📻 Rádio Amigo" onBack={nav.back}>
        <P center style={{ marginTop: 30 }}>Esta rádio não existe mais (ou você saiu dela).</P>
        <Btn title="Voltar" onPress={nav.back} />
      </Screen>
    );
  }

  return (
    <Screen
      title={`📻 ${room.name}`}
      onBack={nav.back}
      miniPlayer={false}
      right={
        <Pressable onPress={onLeave} hitSlop={10}>
          <Text style={{ fontSize: 20 }}>{isOwner ? '🗑️' : '🚪'}</Text>
        </Pressable>
      }
    >
      <Row gap={8} style={{ marginBottom: 12 }}>
        <Btn
          small
          style={{ flex: 1 }}
          title="🎧 Ao vivo"
          variant={tab === 'aovivo' ? 'solid' : 'outline'}
          color={palette.orange}
          onPress={() => setTab('aovivo')}
        />
        <Btn
          small
          style={{ flex: 1 }}
          title={`💡 Ideias (${ranked.length})`}
          variant={tab === 'fila' ? 'solid' : 'outline'}
          color={palette.sky}
          onPress={() => setTab('fila')}
        />
        <Btn
          small
          style={{ flex: 1 }}
          title="▶️ Playlist"
          variant={tab === 'playlist' ? 'solid' : 'outline'}
          color={palette.coral}
          onPress={() => setTab('playlist')}
        />
      </Row>

      <ErrorText>{err}</ErrorText>
      {info ? <P style={{ color: palette.mint, fontWeight: '700', marginBottom: 8 }}>{info}</P> : null}

      {tab === 'aovivo' ? (
        <>
          <CodeBox
            code={room.code}
            label="Código da rádio"
            shareText={`Entra na minha Rádio Amigo "${room.name}" no Família Colorida com o código: ${room.code}`}
          />
          <LivePanel
            room={room}
            members={data.members}
            me={me}
            nickname={data.members.find((m) => m.user_id === me)?.nickname || nav.nickname}
            onOpenLibrary={() => nav.push('RadioLibrary', { roomId, roomName: room.name })}
            onError={setErr}
          />
        </>
      ) : tab === 'fila' ? (
        <>
          <P muted style={{ fontSize: 13, marginBottom: 8 }}>
            Ideias de músicas para votar (e ouvir no YouTube/Spotify). Para tocar na rádio, envie o MP3 na 📚 Biblioteca.
          </P>
          <CodeBox
            code={room.code}
            label="Código da rádio"
            shareText={`Entra na minha Rádio Amigo "${room.name}" no Família Colorida com o código: ${room.code}`}
          />
          <Row gap={2} style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            {data.members.slice(0, 12).map((m) => (
              <Avatar key={m.user_id} name={m.nickname} uri={m.avatar_url} size={32} ring="#FFF7EC" />
            ))}
            <P muted style={{ marginLeft: 12, fontSize: 14 }}>
              {data.members.length} na rádio
            </P>
          </Row>

          <Card color={palette.mint}>
            <H2>Sugerir música</H2>
            <Field placeholder="Música" value={title} onChangeText={setTitle} maxLength={120} />
            <Field placeholder="Artista" value={artist} onChangeText={setArtist} maxLength={120} onSubmitEditing={onAdd} />
            <Btn title="➕ Adicionar à fila" color={palette.mint} onPress={onAdd} loading={busy === 'add'} />
            <Btn
              title="🤖 IA sugere"
              variant="outline"
              color={palette.grape}
              onPress={onAI}
              loading={busy === 'ai'}
              disabled={!!busy && busy !== 'ai'}
            />
          </Card>

          {ranked.length === 0 ? (
            <P muted center>A fila está vazia. Sugira a primeira música! 🎶</P>
          ) : (
            ranked.map((s, i) => (
              <SongCard
                key={s.id}
                song={s}
                pos={i + 1}
                canRemove={s.added_by === me || isOwner}
                onVote={onVote}
                onRemove={onRemove}
              />
            ))
          )}
        </>
      ) : (
        <>
          <Card color={palette.coral}>
            <H2>Buscar no YouTube</H2>
            <Field
              placeholder="Música, artista ou clima (ex.: forró de festa)"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => query.trim() && open(youtubeSearchUrl(query))}
            />
            <Row gap={8}>
              <Btn
                small
                style={{ flex: 1 }}
                title="▶️ YouTube"
                color={palette.coral}
                disabled={!query.trim()}
                onPress={() => open(youtubeSearchUrl(query))}
              />
              <Btn
                small
                style={{ flex: 1 }}
                title="🟢 Spotify"
                color={palette.leaf}
                disabled={!query.trim()}
                onPress={() => open(spotifySearchUrl(query))}
              />
            </Row>
          </Card>

          <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <H2 style={{ marginBottom: 0 }}>Playlist da turma</H2>
            <Btn
              small
              title="Compartilhar"
              color={palette.sky}
              disabled={!ranked.length}
              onPress={() => Share.share({ message: playlistText(room.name, ranked) })}
            />
          </Row>
          <P muted style={{ fontSize: 13, marginBottom: 10 }}>
            Na ordem dos votos. Toque para ouvir no YouTube ou no Spotify.
          </P>
          {ranked.length === 0 ? (
            <P muted center>Nada por aqui ainda.</P>
          ) : (
            ranked.map((s, i) => (
              <Card key={s.id} style={{ paddingVertical: 10 }}>
                <Row>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: palette.coral, width: 28 }}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', fontSize: 16, color: '#2B2140' }} numberOfLines={1}>
                      {s.title}
                    </Text>
                    <P muted style={{ fontSize: 14 }} numberOfLines={1}>
                      {s.artist}
                    </P>
                  </View>
                  <Pressable hitSlop={6} onPress={() => open(youtubeSearchUrl(`${s.title} ${s.artist}`))}>
                    <Text style={{ fontSize: 26 }}>▶️</Text>
                  </Pressable>
                  <Pressable hitSlop={6} onPress={() => open(spotifySearchUrl(`${s.title} ${s.artist}`))}>
                    <Text style={{ fontSize: 26 }}>🟢</Text>
                  </Pressable>
                </Row>
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

function SongCard({ song, pos, canRemove, onVote, onRemove }) {
  const color = song.score > 0 ? palette.leaf : song.score < 0 ? palette.coral : palette.sun;
  return (
    <Card color={color} style={{ paddingVertical: 12 }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color, width: 30 }}>#{pos}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: '#2B2140' }}>{song.title}</Text>
          <P muted style={{ fontSize: 14 }}>
            {song.artist}
          </P>
          <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
            {song.source === 'ia' ? <Badge text="🤖 IA" color={palette.grape} /> : null}
            {song.added_by_name && song.source !== 'ia' ? (
              <Text style={{ fontSize: 12, color: '#7A6F8A' }}>por {song.added_by_name}</Text>
            ) : null}
          </Row>
          {song.reason ? <P muted style={{ fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>“{song.reason}”</P> : null}
        </View>
        {canRemove ? (
          <Pressable hitSlop={8} onPress={() => onRemove(song)}>
            <Text style={{ fontSize: 16, color: '#7A6F8A' }}>✕</Text>
          </Pressable>
        ) : null}
      </Row>
      <Row gap={8} style={{ marginTop: 8 }}>
        <VoteBtn emoji="👍" count={song.up} active={song.myVote === 1} color={palette.leaf} onPress={() => onVote(song, 1)} />
        <VoteBtn emoji="👎" count={song.down} active={song.myVote === -1} color={palette.coral} onPress={() => onVote(song, -1)} />
        <Text style={{ marginLeft: 'auto', fontWeight: '900', color, fontSize: 16 }}>
          {song.score > 0 ? '+' : ''}
          {song.score}
        </Text>
      </Row>
    </Card>
  );
}

function VoteBtn({ emoji, count, active, color, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: active ? color : 'transparent',
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text style={{ fontWeight: '800', color: active ? '#fff' : color }}>{count}</Text>
    </Pressable>
  );
}
