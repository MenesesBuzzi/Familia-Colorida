import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { errorMessage } from '../../lib/supabase';
import { backToLobby } from '../../lib/werewolf/host';
import { ROLES } from '../../lib/werewolf/logic';
import { Avatar, Btn, Card, ErrorText, H2, P, Row, useTheme } from '../ui';
import { Feed } from './parts';
import { palette } from '../../theme';

export default function EndGame({ ww, me, isHost, roomId }) {
  const t = useTheme();
  const { room, players, roles, feed } = ww;
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const winner = room.state?.winner;
  const roleOf = (id) => roles.find((r) => r.user_id === id)?.role;

  const again = async () => {
    setBusy(true);
    try {
      await backToLobby(roomId);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View
        style={{
          backgroundColor: winner === 'lobos' ? '#E63946' : palette.leaf,
          borderRadius: 24,
          padding: 24,
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 64 }}>{winner === 'lobos' ? '🐺' : '🏡'}</Text>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center' }}>
          {winner === 'lobos' ? 'Os lobisomens venceram!' : 'A vila venceu!'}
        </Text>
      </View>

      <H2>Quem era quem</H2>
      <Card>
        {players.map((p) => {
          const r = ROLES[roleOf(p.user_id)];
          return (
            <Row key={p.user_id} style={{ paddingVertical: 6 }}>
              <Avatar name={p.nickname} uri={p.avatar_url} size={34} dim={!p.alive} />
              <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: 16 }}>
                {p.nickname}
                {p.user_id === me ? ' (você)' : ''} {p.alive ? '' : '💀'}
              </Text>
              <Text style={{ color: r?.cor || t.text, fontWeight: '800' }}>
                {r ? `${r.emoji} ${r.nome}` : '?'}
              </Text>
            </Row>
          );
        })}
      </Card>

      <ErrorText>{err}</ErrorText>
      {isHost ? (
        <Btn title="🔁 Jogar de novo (voltar ao lobby)" color={palette.sun} onPress={again} loading={busy} />
      ) : (
        <P muted center>
          O anfitrião pode começar outra partida.
        </P>
      )}

      <Feed items={feed} title="História da partida" />
    </View>
  );
}
