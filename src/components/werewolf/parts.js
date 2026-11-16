import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ROLES } from '../../lib/werewolf/logic';
import { Avatar, Card, H2, P, Row, useTheme } from '../ui';
import { palette } from '../../theme';

/** Cartão do meu papel: fica escondido até tocar (pra ninguém espiar). */
export function RoleCard({ role, wolfMates }) {
  const [show, setShow] = useState(false);
  const r = ROLES[role];
  if (!r) return null;
  return (
    <Pressable onPress={() => setShow((s) => !s)}>
      <View
        style={{
          backgroundColor: show ? r.cor : '#3A3F75',
          borderRadius: 20,
          padding: 16,
          marginBottom: 14,
          alignItems: 'center',
        }}
      >
        {show ? (
          <>
            <Text style={{ fontSize: 48 }}>{r.emoji}</Text>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{r.nome}</Text>
            <Text style={{ color: '#fff', textAlign: 'center', marginTop: 4 }}>{r.descricao}</Text>
            {wolfMates?.length ? (
              <Text style={{ color: '#fff', marginTop: 8, fontWeight: '800' }}>
                Sua matilha: {wolfMates.join(', ')}
              </Text>
            ) : null}
            <Text style={{ color: '#fff', opacity: 0.8, marginTop: 8, fontSize: 12 }}>toque para esconder</Text>
          </>
        ) : (
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>🃏 Toque para ver seu papel secreto</Text>
        )}
      </View>
    </Pressable>
  );
}

/** Lista de jogadores para escolher um alvo. */
export function PlayerPicker({ players, selected, onPick, color = palette.sun, note }) {
  const t = useTheme();
  if (!players.length) return <P muted>Ninguém disponível.</P>;
  return (
    <View>
      {players.map((p) => {
        const sel = selected === p.user_id;
        return (
          <Pressable
            key={p.user_id}
            onPress={() => onPick(p.user_id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 10,
              borderRadius: 14,
              marginBottom: 8,
              backgroundColor: sel ? color : t.cardAlt,
            }}
          >
            <Avatar name={p.nickname} size={36} />
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: sel ? '#2B2140' : t.text }}>
              {p.nickname}
            </Text>
            {note?.(p) ? <Text style={{ color: sel ? '#2B2140' : t.muted, fontWeight: '700' }}>{note(p)}</Text> : null}
            {sel ? <Text style={{ fontSize: 18 }}>✅</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const FEED_ICON = { narracao: '📜', fantasma: '👻', objeto: '🪔', sistema: 'ℹ️' };
const FEED_COLOR = { narracao: palette.sun, fantasma: '#B8C0FF', objeto: palette.orange, sistema: palette.sky };

export function Feed({ items, round, title = 'Mural da vila' }) {
  const t = useTheme();
  const list = round != null ? items.filter((i) => i.round === round) : items;
  if (!list.length) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <H2>{title}</H2>
      {list.map((i) => (
        <Card key={i.id} color={FEED_COLOR[i.kind] || palette.sky} style={{ paddingVertical: 12 }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Text style={{ fontSize: 20 }}>{FEED_ICON[i.kind] || '•'}</Text>
            <Text style={{ flex: 1, color: t.text, fontSize: 16, lineHeight: 22, fontStyle: i.kind === 'fantasma' ? 'italic' : 'normal' }}>
              {i.text}
            </Text>
          </Row>
        </Card>
      ))}
    </View>
  );
}

export function PlayersStrip({ players, me }) {
  const t = useTheme();
  return (
    <Card>
      <Row style={{ flexWrap: 'wrap', gap: 12 }}>
        {players.map((p) => (
          <View key={p.user_id} style={{ alignItems: 'center', width: 64 }}>
            <Avatar name={p.nickname} size={40} dim={!p.alive} />
            <Text numberOfLines={1} style={{ color: p.alive ? t.text : t.muted, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
              {p.alive ? '' : '💀 '}
              {p.user_id === me ? 'Você' : p.nickname}
            </Text>
            {!p.alive && p.revealed_role ? (
              <Text style={{ color: t.muted, fontSize: 11 }}>{ROLES[p.revealed_role]?.emoji} {ROLES[p.revealed_role]?.nome}</Text>
            ) : null}
          </View>
        ))}
      </Row>
    </Card>
  );
}
