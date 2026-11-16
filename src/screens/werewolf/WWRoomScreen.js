import React from 'react';
import { Alert } from 'react-native';
import { useNav } from '../../lib/nav';
import { supabase } from '../../lib/supabase';
import { useWWRoom } from '../../lib/werewolf/useWWRoom';
import { useHostEngine } from '../../lib/werewolf/useHostEngine';
import { Btn, ErrorText, Loading, Screen } from '../../components/ui';
import { day, night } from '../../theme';
import Lobby from '../../components/werewolf/Lobby';
import Game from '../../components/werewolf/Game';
import EndGame from '../../components/werewolf/EndGame';

const NIGHT_PHASES = ['noite', 'bruxa', 'cacador', 'fim', 'lobby'];

export default function WWRoomScreen({ roomId }) {
  const nav = useNav();
  const me = nav.user.id;
  const ww = useWWRoom(roomId, me);
  const isHost = !!ww.room && ww.room.host_id === me;
  const { forceAdvance } = useHostEngine(roomId, isHost && ww.room?.status === 'jogando');

  const leave = () => {
    Alert.alert(
      isHost ? 'Sair da sala?' : 'Sair da sala?',
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
  const props = { ww, me, isHost, forceAdvance, roomId };

  return (
    <Screen title={`🐺 Sala ${ww.room.code}`} onBack={leave} theme={theme}>
      {ww.error ? <ErrorText>{ww.error}</ErrorText> : null}
      {ww.room.status === 'lobby' && <Lobby {...props} />}
      {ww.room.status === 'jogando' && <Game {...props} />}
      {ww.room.status === 'fim' && <EndGame {...props} />}
    </Screen>
  );
}
