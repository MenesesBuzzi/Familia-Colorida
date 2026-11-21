import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage } from '../../lib/supabase';
import { useInterval, useRealtime } from '../../lib/realtime';
import {
  deleteChatRoom,
  leaveChatRoom,
  loadMessages,
  loadRoom,
  markRead,
  sendText,
  sendVoiceMessage,
} from '../../lib/chat/api';
import { lastId, mergeMessages, nextReadMarker, roomTitle } from '../../lib/chat/logic';
import ChatPanel from '../../components/chat/ChatPanel';
import CodeBox from '../../components/CodeBox';
import { Btn, ErrorText, Loading, P, Screen } from '../../components/ui';
import { palette } from '../../theme';

export default function ChatRoomScreen({ roomId, title }) {
  const nav = useNav();
  const me = nav.user?.id;
  const [info, setInfo] = useState(null); // { room, members }
  const [messages, setMessages] = useState(null);
  const [err, setErr] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const readMarker = useRef(0);

  const loadAll = useCallback(async () => {
    try {
      const [i, msgs] = await Promise.all([loadRoom(roomId), loadMessages(roomId)]);
      setInfo(i);
      setMessages((cur) => mergeMessages(cur || [], msgs));
      setErr('');
    } catch (e) {
      setMessages((cur) => cur || []);
      setErr(errorMessage(e));
    }
  }, [roomId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useRealtime(`chat-room-${roomId}`, [{ table: 'chat_messages', filter: `room_id=eq.${roomId}`, event: 'INSERT' }], (payload) => {
    if (payload.new?.id) setMessages((cur) => mergeMessages(cur || [], [payload.new]));
  });
  useInterval(loadAll, 15000);

  // marca como lido tudo que está na tela
  const newest = lastId(messages || []);
  useEffect(() => {
    if (!newest || newest <= readMarker.current) return;
    readMarker.current = nextReadMarker(readMarker.current, newest);
    markRead(roomId, newest).catch(() => {});
  }, [newest, roomId]);

  const room = info?.room;
  const other = room?.kind === 'dm' ? (info?.members || []).find((m) => m.user_id !== me) : null;
  const heading = room ? roomTitle({ ...room, other_name: other?.nickname }) : title || 'Conversa';
  const who = { userId: me, nickname: nav.nickname, avatarUrl: nav.avatarUrl };

  const shown = useMemo(
    () => (messages || []).map((m) => ({ ...m, kind: m.kind === 'voz' ? 'voz' : 'jogador' })),
    [messages]
  );

  const onSend = async (text) => {
    try {
      const m = await sendText(roomId, who, text);
      if (m) setMessages((cur) => mergeMessages(cur || [], [m]));
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  };

  const onVoice = async (clip) => {
    try {
      const m = await sendVoiceMessage(roomId, who, clip);
      if (m) setMessages((cur) => mergeMessages(cur || [], [m]));
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  };

  const isOwner = room?.kind === 'grupo' && room.owner_id === me;
  const leave = () =>
    Alert.alert(isOwner ? 'Apagar a sala?' : 'Sair da sala?', isOwner ? 'As mensagens de todo mundo serão apagadas.' : 'Você pode voltar com o código.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: isOwner ? 'Apagar' : 'Sair',
        style: 'destructive',
        onPress: async () => {
          try {
            if (isOwner) await deleteChatRoom(roomId);
            else await leaveChatRoom(roomId, me);
            nav.back();
          } catch (e) {
            setErr(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <Screen
      title={heading}
      onBack={nav.back}
      scroll={false}
      right={
        room?.kind === 'grupo' ? (
          <Pressable onPress={() => setShowInfo((v) => !v)} hitSlop={10}>
            <Text style={{ fontSize: 20 }}>{showInfo ? '✖️' : 'ℹ️'}</Text>
          </Pressable>
        ) : null
      }
    >
      <ErrorText>{err}</ErrorText>
      {showInfo && room?.kind === 'grupo' ? (
        <>
          <CodeBox code={room.code} label="Código da sala" shareText={`Entra na sala "${room.name}" do Chat no Família Colorida com o código: ${room.code}`} />
          <P muted style={{ fontSize: 13, marginBottom: 6 }}>
            {(info?.members || []).length} pessoa(s): {(info?.members || []).map((m) => m.nickname).join(', ')}
          </P>
          <Btn small variant="outline" color={palette.coral} title={isOwner ? '🗑️ Apagar sala' : '🚪 Sair da sala'} onPress={leave} />
        </>
      ) : null}
      {messages === null ? (
        <Loading text="Carregando mensagens..." />
      ) : (
        <ChatPanel
          fill
          messages={shown}
          me={me}
          onSend={onSend}
          onVoice={onVoice}
          maxLength={1000}
          accent={room?.kind === 'dm' ? palette.grape : room?.kind === 'familia' ? palette.coral : palette.sky}
          emptyText="Diga oi! 👋 (segure o 🎤 para mandar áudio)"
        />
      )}
    </Screen>
  );
}
