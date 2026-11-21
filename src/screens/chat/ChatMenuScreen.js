import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage } from '../../lib/supabase';
import { cleanCode } from '../../lib/format';
import { useInterval, useRealtime } from '../../lib/realtime';
import { createChatRoom, joinChatRoom, myChatRooms } from '../../lib/chat/api';
import { badgeText, previewText, roomTitle, sortRooms } from '../../lib/chat/logic';
import { Avatar, Badge, Btn, Card, ErrorText, Field, H2, Loading, P, Row, Screen } from '../../components/ui';
import { palette } from '../../theme';

function hhmm(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const today = new Date();
  if (d.toDateString() !== today.toDateString()) return `${d.getDate()}/${d.getMonth() + 1}`;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ChatMenuScreen() {
  const nav = useNav();
  const me = nav.user?.id;
  const [rooms, setRooms] = useState(null);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      setRooms(sortRooms(await myChatRooms()));
      setErr('');
    } catch (e) {
      setRooms((r) => r || []);
      setErr(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, [load]);
  useRealtime(me ? `chat-menu-${me}` : null, [{ table: 'chat_messages', event: 'INSERT' }, { table: 'chat_members' }], () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 400);
  });
  useInterval(load, 30000);

  const open = (r) => nav.push('ChatRoom', { roomId: r.id, title: roomTitle(r) });

  const create = async () => {
    setBusy('create');
    setErr('');
    try {
      const n = name.trim() || `Sala de ${nav.nickname}`;
      const data = await createChatRoom(n.slice(0, 60), nav.nickname);
      nav.push('ChatRoom', { roomId: data.id, title: n });
      setName('');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const join = async () => {
    const c = cleanCode(code);
    if (c.length !== 6) return setErr('O código tem 6 caracteres.');
    setBusy('join');
    setErr('');
    try {
      const id = await joinChatRoom(c, nav.nickname);
      setCode('');
      nav.push('ChatRoom', { roomId: id });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
    return null;
  };

  return (
    <Screen title="💬 Chat" onBack={nav.back}>
      <ErrorText>{err}</ErrorText>
      {rooms === null ? (
        <Loading text="Abrindo as conversas..." />
      ) : rooms.length === 0 ? (
        <P muted center>
          Nenhuma conversa ainda. Rode o v3-upgrade.sql no Supabase para criar a sala Família.
        </P>
      ) : (
        rooms.map((r) => {
          const count = badgeText(r.unread);
          const color = r.kind === 'familia' ? palette.coral : r.kind === 'dm' ? palette.grape : palette.sky;
          return (
            <Card key={r.id} color={color} onPress={() => open(r)} style={{ paddingVertical: 12 }}>
              <Row>
                {r.kind === 'dm' ? (
                  <Avatar name={r.other_name || '?'} uri={r.other_avatar} size={42} />
                ) : (
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>{r.kind === 'familia' ? '🏡' : '👥'}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: '#2B2140' }} numberOfLines={1}>
                    {roomTitle(r)}
                  </Text>
                  <P muted style={{ fontSize: 13 }} numberOfLines={1}>
                    {r.last_name && r.last_kind ? `${r.last_name}: ` : ''}
                    {previewText(r)}
                  </P>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ fontSize: 11, color: '#7A6F8A' }}>{hhmm(r.last_at)}</Text>
                  {count ? <Badge text={count} color="#E63946" /> : null}
                </View>
              </Row>
            </Card>
          );
        })
      )}

      <H2 style={{ marginTop: 10 }}>Nova conversa</H2>
      <Btn title="🔒 Conversa privada" color={palette.grape} onPress={() => nav.push('ChatNewDM')} />

      <Card color={palette.sky} style={{ marginTop: 10 }}>
        <H2>Entrar numa sala com código</H2>
        <Field
          placeholder="ABC123"
          value={code}
          onChangeText={(t) => setCode(cleanCode(t))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '800' }}
        />
        <Btn title="Entrar" color={palette.sky} onPress={join} loading={busy === 'join'} />
      </Card>

      <Card color={palette.mint}>
        <H2>Criar sala</H2>
        <Field placeholder={`Sala de ${nav.nickname}`} value={name} onChangeText={setName} maxLength={60} />
        <Btn title="Criar sala com código" color={palette.mint} onPress={create} loading={busy === 'create'} />
      </Card>
    </Screen>
  );
}
