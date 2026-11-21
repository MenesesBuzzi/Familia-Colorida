import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNav } from '../../lib/nav';
import { errorMessage } from '../../lib/supabase';
import { addToQueue, deleteTrack, listLibrary, uploadTrack } from '../../lib/radio/library';
import { filterLibrary, formatDuration, formatSize, titleFromFileName, validateMp3 } from '../../lib/radio/queue';
import { Btn, Card, ErrorText, Field, H2, Loading, P, Row, Screen } from '../../components/ui';
import { palette } from '../../theme';

/**
 * 📚 Biblioteca de músicas (tipo Google Drive): todo MP3 enviado fica guardado para sempre e
 * qualquer rádio pode colocá-lo na fila. Com roomId, o botão "➕ Fila" manda para aquela rádio.
 */
export default function RadioLibraryScreen({ roomId, roomName }) {
  const nav = useNav();
  const me = nav.user?.id;
  const [tracks, setTracks] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [picked, setPicked] = useState(null); // arquivo escolhido aguardando título
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setTracks(await listLibrary());
    } catch (e) {
      setTracks((t) => t || []);
      setErr(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => filterLibrary(tracks || [], q), [tracks, q]);

  const pick = async () => {
    setErr('');
    setInfo('');
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/mp3', 'audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      const problem = validateMp3(file);
      if (problem) return setErr(problem);
      const guess = titleFromFileName(file.name);
      setPicked(file);
      setTitle(guess.title);
      setArtist(guess.artist);
    } catch (e) {
      setErr(errorMessage(e));
    }
    return null;
  };

  const upload = async () => {
    if (!picked) return;
    if (!title.trim()) return setErr('Dê um nome para a música.');
    setBusy('upload');
    setErr('');
    try {
      const track = await uploadTrack({ file: picked, title, artist, userId: me, nickname: nav.nickname });
      setPicked(null);
      setInfo(`✅ "${track.title}" está na Biblioteca!`);
      if (roomId) {
        await addToQueue(roomId, track.id).catch(() => null);
        setInfo(`✅ "${track.title}" está na Biblioteca e na fila da rádio!`);
      }
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
    return null;
  };

  const queue = async (t) => {
    setBusy(`q${t.id}`);
    setErr('');
    try {
      const id = await addToQueue(roomId, t.id);
      setInfo(id ? `➕ "${t.title}" entrou na fila${roomName ? ` da ${roomName}` : ''}.` : 'Essa música já está na fila 😉');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const remove = (t) =>
    Alert.alert('Apagar da Biblioteca?', `"${t.title}" sai de todas as rádios.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () =>
          deleteTrack(t)
            .then(load)
            .catch((e) => setErr(errorMessage(e))),
      },
    ]);

  return (
    <Screen title="📚 Biblioteca" onBack={nav.back}>
      <P muted center style={{ marginBottom: 10 }}>
        Envie MP3 do seu celular: fica guardado para todas as rádios. (YouTube e Spotify não tocam aqui.)
      </P>
      <ErrorText>{err}</ErrorText>
      {info ? <P style={{ color: palette.mint, fontWeight: '700', marginBottom: 8 }}>{info}</P> : null}

      {picked ? (
        <Card color={palette.mint}>
          <H2>Enviar música</H2>
          <P muted style={{ fontSize: 13, marginBottom: 8 }}>
            {picked.name} · {formatSize(picked.size)}
          </P>
          <Field label="Nome da música" value={title} onChangeText={setTitle} maxLength={120} />
          <Field label="Artista (opcional)" value={artist} onChangeText={setArtist} maxLength={120} />
          <Btn title="⬆️ Enviar para a Biblioteca" color={palette.mint} onPress={upload} loading={busy === 'upload'} />
          <Btn title="Cancelar" variant="outline" color={palette.coral} onPress={() => setPicked(null)} disabled={busy === 'upload'} />
        </Card>
      ) : (
        <Btn title="⬆️ Enviar MP3" color={palette.mint} onPress={pick} />
      )}

      <Field placeholder="🔎 Buscar música, artista ou quem enviou" value={q} onChangeText={setQ} style={{ marginTop: 10 }} />
      <P muted style={{ fontSize: 12, marginBottom: 8 }}>
        {(tracks || []).length} música(s) · o plano grátis do Supabase guarda ~1 GB (umas 200 músicas).
      </P>

      {tracks === null ? (
        <Loading text="Abrindo a Biblioteca..." />
      ) : shown.length === 0 ? (
        <P muted center>{q ? 'Nada encontrado.' : 'A Biblioteca está vazia. Envie o primeiro MP3! 🎶'}</P>
      ) : (
        shown.map((t) => (
          <Card key={t.id} style={{ paddingVertical: 10 }} color={palette.sky}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: 16, color: '#2B2140' }} numberOfLines={1}>
                  {t.title}
                </Text>
                <P muted style={{ fontSize: 13 }} numberOfLines={1}>
                  {[t.artist, t.duration_sec ? formatDuration(t.duration_sec) : null, t.uploader_name ? `por ${t.uploader_name}` : null]
                    .filter(Boolean)
                    .join(' · ') || ' '}
                </P>
              </View>
              {roomId ? (
                <Btn small title="➕ Fila" color={palette.sky} onPress={() => queue(t)} loading={busy === `q${t.id}`} />
              ) : null}
              {t.uploader_id === me ? (
                <Pressable hitSlop={8} onPress={() => remove(t)}>
                  <Text style={{ fontSize: 16, color: '#7A6F8A' }}>🗑️</Text>
                </Pressable>
              ) : null}
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
