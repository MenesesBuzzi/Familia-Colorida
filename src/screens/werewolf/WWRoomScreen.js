import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNav } from '../../lib/nav';
import { supabase } from '../../lib/supabase';
import { useWWRoom } from '../../lib/werewolf/useWWRoom';
import { useHostEngine } from '../../lib/werewolf/useHostEngine';
import { useWWChat } from '../../lib/werewolf/useWWChat';
import { usePresence } from '../../lib/werewolf/usePresence';
import { usePresenter } from '../../lib/werewolf/usePresenter';
import { useWWSoundtrack } from '../../lib/werewolf/useWWSoundtrack';
import { canReadChannel, maxId, unreadCount } from '../../lib/werewolf/chat';
import { DEFAULT_SETTINGS } from '../../lib/werewolf/host';
import { Btn, ErrorText, Loading, Screen } from '../../components/ui';
import { day, night } from '../../theme';
import Lobby from '../../components/werewolf/Lobby';
import Game from '../../components/werewolf/Game';
import EndGame from '../../components/werewolf/EndGame';
import { PresenceBar, RoomTabs } from '../../components/werewolf/parts';
import { PresenterBanner, RoomChat } from '../../components/werewolf/RoomChat';
import { SoundBar } from '../../components/werewolf/SoundPanel';

const NIGHT_PHASES = ['noite', 'bruxa', 'cacador', 'fim', 'lobby'];
const CHANNEL_OF_TAB = { chat: 'vila', fantasmas: 'fantasmas' };

export default function WWRoomScreen({ roomId }) {
  const nav = useNav();
  const me = nav.user.id;
  const ww = useWWRoom(roomId, me);
  const isHost = !!ww.room && ww.room.host_id === me;
  const { forceAdvance } = useHostEngine(roomId, isHost && ww.room?.status === 'jogando');

  const mePlayer = ww.players.find((p) => p.user_id === me);
  const alive = mePlayer ? !!mePlayer.alive : true;
  const status = ww.room?.status;
  const ghostsOpen = !!status && canReadChannel('fantasmas', { status, alive });
  const chat = useWWChat(roomId, `${status}:${alive}`);
  const online = usePresence(roomId, mePlayer ? { user_id: me, nickname: mePlayer.nickname } : null);

  const settings = { ...DEFAULT_SETTINGS, ...(ww.room?.settings || {}) };
  usePresenter({
    enabled: isHost && settings.apresentador !== false,
    useAI: settings.narradorIA !== false,
    roomId,
    hostId: me,
    room: ww.room,
    players: ww.players,
    chat: chat.vila,
    chatReady: chat.ready,
  });

  // v3: trilha sonora + mesa de efeitos (e pausa a Rádio durante a partida)
  const track = useWWSoundtrack({
    roomId,
    room: ww.room,
    players: ww.players,
    nickname: mePlayer?.nickname || nav.nickname,
  });

  const [tab, setTab] = useState('jogo');
  const [seen, setSeen] = useState({ vila: 0, fantasmas: 0 });
  const activeTab = tab === 'fantasmas' && !ghostsOpen ? 'jogo' : tab;

  const changeTab = (next) => {
    // marca como lido o canal que estou saindo e o que estou entrando
    const mark = { ...seen };
    [CHANNEL_OF_TAB[activeTab], CHANNEL_OF_TAB[next]].forEach((ch) => {
      if (ch) mark[ch] = maxId(chat[ch]);
    });
    setSeen(mark);
    setTab(next);
  };

  const leave = () => {
    Alert.alert(
      'Sair da sala?',
      isHost
        ? 'Você é o anfitrião: se sair durante a partida, o jogo para. Deseja sair?'
        : 'Você pode voltar com o código enquanto estiver no lobby.',
      [
        { text: 'Ficar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            if (!isHost && ww.room?.status === 'lobby') {
              await supabase.from('ww_players').delete().eq('room_id', roomId).eq('user_id', me);
            }
            nav.back();
          },
        },
      ]
    );
  };

  if (!ww.room) {
    return (
      <Screen title="🐺 Lobisomem" onBack={nav.back} theme={night}>
        {ww.error ? (
          <>
            <ErrorText>{ww.error}</ErrorText>
            <Btn title="Tentar de novo" onPress={ww.reload} />
          </>
        ) : (
          <Loading text="Entrando na vila..." />
        )}
      </Screen>
    );
  }

  const theme = NIGHT_PHASES.includes(ww.room.phase) ? night : day;
  const props = { ww, me, isHost, forceAdvance, roomId, online };
  const tabs = [
    { id: 'jogo', label: '🎲 Jogo' },
    { id: 'chat', label: '💬 Chat', badge: unreadCount(chat.vila, seen.vila, me) },
  ];
  if (ghostsOpen) tabs.push({ id: 'fantasmas', label: '👻 Fantasmas', badge: unreadCount(chat.fantasmas, seen.fantasmas, me) });
  const lastAI = [...chat.vila].reverse().find((m) => m.kind === 'ia');
  const channel = CHANNEL_OF_TAB[activeTab];

  return (
    <Screen title={`🐺 Sala ${ww.room.code}`} onBack={leave} theme={theme}>
      {ww.error ? <ErrorText>{ww.error}</ErrorText> : null}
      <PresenceBar players={ww.players} online={online} me={me} />
      <SoundBar track={track} isHost={isHost} />
      <RoomTabs tabs={tabs} active={activeTab} onChange={changeTab} />

      {activeTab === 'jogo' ? (
        <>
          <PresenterBanner message={lastAI} onPress={() => changeTab('chat')} />
          {ww.room.status === 'lobby' && <Lobby {...props} />}
          {ww.room.status === 'jogando' && <Game {...props} />}
          {ww.room.status === 'fim' && <EndGame {...props} />}
        </>
      ) : (
        <>
          {chat.error ? <ErrorText>{chat.error}</ErrorText> : null}
          <RoomChat
            channel={channel}
            messages={chat[channel]}
            players={ww.players}
            me={me}
            room={ww.room}
            alive={alive}
            send={chat.send}
            nickname={mePlayer?.nickname || nav.nickname}
          />
        </>
      )}
    </Screen>
  );
}
