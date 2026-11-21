import React, { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

/**
 * Carta que vira (rotação 3D). `front` = verso fechado, `back` = conteúdo revelado.
 * Controlada por `flipped`; toque chama onPress.
 */
export default function FlipCard({ front, back, flipped, onPress, height = 220, style }) {
  const [anim] = useState(() => new Animated.Value(flipped ? 1 : 0));

  useEffect(() => {
    Animated.spring(anim, { toValue: flipped ? 1 : 0, friction: 7, tension: 12, useNativeDriver: true }).start();
  }, [flipped, anim]);

  const rotFront = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const rotBack = anim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  // opacidade evita "vazar" o outro lado no Android (backfaceVisibility nem sempre respeitado)
  const opFront = anim.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [1, 1, 0, 0] });
  const opBack = anim.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });
  const scale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.06, 1] });

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={style}>
      <View style={{ height }}>
        <Animated.View
          pointerEvents={flipped ? 'none' : 'auto'}
          style={[styles.face, { opacity: opFront, transform: [{ perspective: 1000 }, { rotateY: rotFront }, { scale }] }]}
        >
          {front}
        </Animated.View>
        <Animated.View
          pointerEvents={flipped ? 'auto' : 'none'}
          style={[styles.face, { opacity: opBack, transform: [{ perspective: 1000 }, { rotateY: rotBack }, { scale }] }]}
        >
          {back}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: 'hidden' },
});
