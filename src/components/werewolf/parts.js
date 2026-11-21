import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ROLES } from '../../lib/werewolf/logic';
import { Avatar, Card, H2, P, Row, useTheme } from '../ui';
import { palette } from '../../theme';
import { CardGrid, FlipCard } from '../cards';

/** Carta do meu papel: vira com animação ao tocar (e esconde de novo, pra ninguém espiar). */
export function RoleCard({ role, wolfMates }) {
  const [show, setShow] = useState(false);
  const r = ROLES[role];
  if (!r) return null;
  return (
    <FlipCard
      flipped={show}
      onPress={() => setShow((s) => !s)}
      height={wolfMates?.length ? 250 : 230}
      style={{ marginBottom: 14 }}
      front={
        <View style={[cardFace, { backgroundColor: '#3A3F75', borderColor: '#FFC93C' }]}>
          <Text style={{ fontSize: 56 }}>🃏</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' }}>Seu papel secreto</Text>
          <Text style={{ color: '#fff', opacity: 0.8, marginTop: 4 }}>toque para virar a carta</Text>
        </View>
      }
      back={
        <View style={[cardFace, { backgroundColor: r.cor, borderColor: '#fff' }]}>
          <Text style={{ fontSize: 48 }}>{r.emoji}</Text>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{r.nome}</Text>
          <Text style={{ color: '#fff', textAlign: 'center', marginTop: 4 }}>{r.descricao}</Text>
          {wolfMates?.length ? (
            <Text style={{ color: '#fff', marginTop: 8, fontWeight: '800' }}>Sua matilha: {wolfMates.join(', ')}</Text>
          ) : null}
          <Text style={{ color: '#fff', opacity: 0.8, marginTop: 8, fontSize: 12 }}>toque para esconder</Text>
        </View>
      }
    />
  );
}

const cardFace = {
  flex: 1,
  borderRadius: 22,
  borderWidth: 3,
  padding: 16,
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * Cartas para escolher um alvo (lobos, vidente, médico, bruxa, voto, caçador).
 * `extra`: cartas especiais no fim, ex.: [{ id: '__pular', emoji: '⏭️', title: 'Pular voto' }].
 */
export function PlayerPicker({ players, selected, onPick, color = palette.sun, note, extra }) {
  if (!players.length && !extra?.length) return <P muted>Ninguém disponível.</P>;
  const items = [
    ...players.map((p) => ({ id: p.user_id, title: p.nickname, uri: p.avatar_url, subtitle: note?.(p) || '' })),
    ...(extra || []),
  ];
  return <CardGrid items={items} selected={selected} onSelect={onPick} color={color} />;
}

/** Quem está com a sala aberta agora (bolinha verde = online). */
export function PresenceBar({ players, online, me }) {
  const t = useTheme();
  const count = players.filter((p) => online.has(p.user_id)).length;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
        🟢 NA SALA AGORA: {count} de {players.length}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {players.map((p) => {
          const on = online.has(p.user_id);
          return (
            <View key={p.user_id} style={{ alignItems: 'center', width: 54 }}>
              <View>
                <Avatar name={p.nickname} uri={p.avatar_url} size={40} dim={!on} />
                <View
                  style={{
                    position: 'absolute',
                    right: -1,
                    bottom: -1,
                    width: 13,
                    height: 13,
                    borderRadius: 7,
                    borderWidth: 2,
                    borderColor: t.bg,
                    backgroundColor: on ? '#2ECC71' : '#9AA0A6',
                  }}
                />
              </View>
              <Text numberOfLines={1} style={{ color: on ? t.text : t.muted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                {p.user_id === me ? 'Você' : p.nickname}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Abas da sala. tabs: [{ id, label, badge? }] */
export function RoomTabs({ tabs, active, onChange }) {
  const t = useTheme();
  return (
    <Row gap={6} style={{ marginBottom: 12, backgroundColor: t.cardAlt, borderRadius: 14, padding: 4 }}>
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center', backgroundColor: on ? t.primary : 'transparent' }}
          >
            <Text style={{ fontWeight: '900', color: on ? '#2B2140' : t.text }}>
              {tab.label}
              {tab.badge && !on ? ` (${tab.badge > 99 ? '99+' : tab.badge})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </Row>
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
            <Avatar name={p.nickname} uri={p.avatar_url} size={40} dim={!p.alive} />
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
