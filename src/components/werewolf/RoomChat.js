import React from 'react';
import { Pressable, Text } from 'react-native';
import ChatPanel from '../chat/ChatPanel';
import { canWriteChannel } from '../../lib/werewolf/chat';
import { PRESENTER_NAME } from '../../lib/werewolf/presenter';
import { useTheme } from '../ui';
import { palette } from '../../theme';

/** Chat da vila ou dos fantasmas, com as fotos dos jogadores. */
export function RoomChat({ channel, messages, players, me, room, alive, send, nickname }) {
  const byId = Object.fromEntries(players.map((p) => [p.user_id, p]));
  const list = messages.map((m) => (m.kind === 'jogador' ? { ...m, avatar_url: byId[m.user_id]?.avatar_url } : m));
  const ghosts = channel === 'fantasmas';
  const canSend = canWriteChannel(channel, { status: room.status, alive });
  return (
    <ChatPanel
      messages={list}
      me={me}
      canSend={canSend}
      onSend={(body) => send(channel, body, me, nickname)}
      accent={ghosts ? '#8E9BFF' : palette.grape}
      aiName={PRESENTER_NAME}
      placeholder={ghosts ? 'Fale com os outros fantasmas...' : 'Fale com a vila...'}
      emptyText={ghosts ? 'Silêncio do além... 👻' : 'Ninguém falou nada ainda. Diga oi! 👋'}
      disabledText={
        ghosts
          ? 'Só leitura: o chat dos fantasmas abriu para todos no fim.'
          : '👻 Fantasmas não falam com os vivos. Use a aba Fantasmas (ou o sussurro na aba Jogo).'
      }
    />
  );
}

/** Última fala do apresentador, mostrada na aba Jogo (toque abre o chat). */
export function PresenterBanner({ message, onPress }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: t.cardAlt, borderLeftWidth: 4, borderLeftColor: palette.grape, borderRadius: 12, padding: 10, marginBottom: 12 }}
    >
      <Text style={{ color: palette.grape, fontWeight: '900', fontSize: 12 }}>🎙️ {PRESENTER_NAME} · toque para abrir o chat</Text>
      <Text numberOfLines={3} style={{ color: t.text, fontSize: 14, marginTop: 2 }}>
        {message.body}
      </Text>
    </Pressable>
  );
}
