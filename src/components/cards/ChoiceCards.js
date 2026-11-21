import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, useTheme } from '../ui';

/**
 * Carta selecionável (alvo, poção, voto, pular, caçador).
 * Mostra emoji OU avatar (foto se houver `uri`), título e um subtítulo curto.
 */
export function ChoiceCard({ title, subtitle, emoji, uri, selected, disabled, color = '#FFC93C', onPress, style }) {
  const t = useTheme();
  const [pop] = useState(() => new Animated.Value(selected ? 1 : 0));

  useEffect(() => {
    Animated.spring(pop, { toValue: selected ? 1 : 0, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [selected, pop]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const fg = selected ? '#2B2140' : t.text;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }, style]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected, disabled: !!disabled }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: selected ? color : t.cardAlt,
            borderColor: selected ? '#FFFFFF' : t.border,
            opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {emoji ? <Text style={styles.emoji}>{emoji}</Text> : <Avatar name={title} uri={uri} size={54} />}
        <Text numberOfLines={1} style={[styles.title, { color: fg }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={[styles.sub, { color: selected ? '#2B2140' : t.muted }]}>
            {subtitle}
          </Text>
        ) : null}
        {selected ? (
          <View style={styles.check}>
            <Text style={{ fontSize: 14 }}>✅</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** Grade de cartas com seleção única. items: [{ id, title, subtitle?, emoji?, uri?, disabled? }] */
export function CardGrid({ items, selected, onSelect, color }) {
  return (
    <View style={styles.grid}>
      {items.map((it) => (
        <ChoiceCard
          key={it.id}
          {...it}
          color={it.color || color}
          selected={selected === it.id}
          onPress={() => onSelect(it.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginBottom: 8 },
  wrap: { width: '48%' },
  card: { borderRadius: 18, borderWidth: 2, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', minHeight: 124 },
  emoji: { fontSize: 44, lineHeight: 54 },
  title: { fontSize: 16, fontWeight: '900', marginTop: 6, textAlign: 'center' },
  sub: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  check: { position: 'absolute', top: 6, right: 8 },
});
