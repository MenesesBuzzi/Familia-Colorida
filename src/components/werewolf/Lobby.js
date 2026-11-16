import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { supabase, errorMessage } from '../../lib/supabase';
import { DEFAULT_SETTINGS, startGame } from '../../lib/werewolf/host';
import { MIN_PLAYERS, ROLES, ROLE_ORDER, suggestRoles, totalRoles, validateRoles } from '../../lib/werewolf/logic';
import { Avatar, Badge, Btn, Card, ErrorText, H2, P, Row, useTheme } from '../ui';
import CodeBox from '../CodeBox';
import { palette } from '../../theme';

const TIMES = [60, 120, 180, 300];

export default function Lobby({ ww, me, isHost, roomId }) {
  const t = useTheme();
  const { room, players } = ww;
  const settings = { ...DEFAULT_SETTINGS, ...(room.settings || {}) };
  const n = players.length;
  const [err, setErr] = useState('');
  const [starting, setStarting] = useState(false);
  const saveTimer = useRef(null);
  const [local, setLocal] = useState(settings);

  // mantém a cópia local em sincronia quando outro dispositivo muda (não-anfitrião)
  useEffect(() => {
    if (!isHost) setLocal(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.settings, isHost]);

  const save = (next) => {
    setLocal(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from('ww_rooms').update({ settings: next }).eq('id', roomId);
      if (error) setErr(errorMessage(error));
    }, 400);
  };

  const view = isHost ? local : settings;
  const auto = !view.roles;
  const shownCounts = view.roles || suggestRoles(n);
  const problem = validateRoles(shownCounts, n);

  const bump = (role, delta) => {
    const base = { ...(view.roles || suggestRoles(n)) };
    base[role] = Math.max(0, (base[role] || 0) + delta);
    save({ ...view, roles: base });
  };

  const kick = async (userId) => {
    const { error } = await supabase.from('ww_players').delete().eq('room_id', roomId).eq('user_id', userId);
    if (error) setErr(errorMessage(error));
  };

  const start = async () => {
    setErr('');
    if (problem) return setErr(problem);
    setStarting(true);
    try {
      clearTimeout(saveTimer.current);
      await supabase.from('ww_rooms').update({ settings: view }).eq('id', roomId);
      await startGame({ ...room, settings: view }, players, shownCounts);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setStarting(false);
    }
    return null;
  };

  return (
    <View>
      <CodeBox
        code={room.code}
        shareText={`Bora jogar Lobisomem no Família Colorida! Código da sala: ${room.code}`}
      />

      <H2>
        Jogadores ({n}
        {n < MIN_PLAYERS ? ` · faltam ${MIN_PLAYERS - n}` : ''})
      </H2>
      <Card>
        {players.map((p) => (
          <Row key={p.user_id} style={{ paddingVertical: 6 }}>
            <Avatar name={p.nickname} size={34} />
            <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '700' }}>
              {p.nickname}
              {p.user_id === me ? ' (você)' : ''}
            </Text>
            {p.user_id === room.host_id ? <Badge text="Anfitrião" color={palette.grape} /> : null}
            {isHost && p.user_id !== me ? (
              <Pressable onPress={() => kick(p.user_id)} hitSlop={8}>
                <Text style={{ color: t.danger, fontWeight: '800' }}>remover</Text>
              </Pressable>
            ) : null}
          </Row>
        ))}
      </Card>

      <H2>Papéis {auto && isHost ? '(sugestão automática)' : ''}</H2>
      <Card>
        {ROLE_ORDER.map((r) => (
          <Row key={r} style={{ paddingVertical: 6 }}>
            <Text style={{ fontSize: 22 }}>{ROLES[r].emoji}</Text>
            <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '700' }}>{ROLES[r].nome}</Text>
            {isHost && <Step label="−" onPress={() => bump(r, -1)} />}
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '900', width: 28, textAlign: 'center' }}>
              {shownCounts[r] || 0}
            </Text>
            {isHost && <Step label="+" onPress={() => bump(r, 1)} />}
          </Row>
        ))}
        <P muted style={{ marginTop: 6 }}>
          Total: {totalRoles(shownCounts)} de {n} jogadores
        </P>
        {isHost && !auto && (
          <Btn small variant="outline" color={palette.sky} title="Voltar à sugestão automática" onPress={() => save({ ...view, roles: null })} />
        )}
      </Card>

      <H2>Regras</H2>
      <Card>
        <P style={{ fontWeight: '700' }}>Tempo de discussão de dia</P>
        <Row style={{ flexWrap: 'wrap', marginVertical: 8 }}>
          {TIMES.map((s) => (
            <Pressable
              key={s}
              disabled={!isHost}
              onPress={() => save({ ...view, discussaoSeg: s })}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: view.discussaoSeg === s ? palette.sun : t.cardAlt,
              }}
            >
              <Text style={{ fontWeight: '800', color: view.discussaoSeg === s ? '#2B2140' : t.text }}>{s / 60} min</Text>
            </Pressable>
          ))}
        </Row>
        <Toggle label="🤖 Narrador IA (Sussurro)" value={view.narradorIA} disabled={!isHost} onChange={(v) => save({ ...view, narradorIA: v })} />
        <Toggle label="🪔 Objetos falantes" value={view.objetosFalantes} disabled={!isHost} onChange={(v) => save({ ...view, objetosFalantes: v })} />
        <Toggle label="💀 Revelar papel de quem morre" value={view.revelarPapel} disabled={!isHost} onChange={(v) => save({ ...view, revelarPapel: v })} />
      </Card>

      <ErrorText>{err}</ErrorText>
      {isHost ? (
        <>
          {problem ? <P muted center>{problem}</P> : null}
          <Btn title="🌙 Começar partida" color={palette.sun} onPress={start} loading={starting} disabled={!!problem} />
          <P muted center style={{ fontSize: 13, marginTop: 6 }}>
            Seu celular comanda a partida: mantenha o app aberto até o fim.
          </P>
        </>
      ) : (
        <P center muted>
          Aguardando o anfitrião começar... 🌕
        </P>
      )}
    </View>
  );
}

function Step({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: palette.grape, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ label, value, onChange, disabled }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>{label}</Text>
      <Switch value={!!value} onValueChange={onChange} disabled={disabled} trackColor={{ true: palette.leaf }} />
    </Row>
  );
}
