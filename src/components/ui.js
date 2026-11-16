import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colorFor, light, radius, RAINBOW } from '../theme';

// Tema atual (as telas do Lobisomem trocam para dia/noite)
export const ThemeContext = createContext(light);
export const useTheme = () => useContext(ThemeContext);

export function Screen({ title, onBack, children, scroll = true, theme = light, right, footer }) {
  const Body = scroll ? ScrollView : View;
  return (
    <ThemeContext.Provider value={theme}>
      <SafeAreaView style={[styles.flex, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
        {(title || onBack) && (
          <View style={styles.header}>
            {onBack ? (
              <Pressable onPress={onBack} hitSlop={12} style={[styles.backBtn, { backgroundColor: theme.card }]}>
                <Text style={[styles.backTxt, { color: theme.text }]}>‹</Text>
              </Pressable>
            ) : (
              <View style={{ width: 40 }} />
            )}
            <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.text }]}>
              {title}
            </Text>
            <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
          </View>
        )}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Body
            style={styles.flex}
            contentContainerStyle={scroll ? styles.scrollContent : undefined}
            keyboardShouldPersistTaps="handled"
          >
            {scroll ? children : <View style={[styles.flex, styles.padded]}>{children}</View>}
          </Body>
          {footer}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

export function RainbowTitle({ text, size = 40 }) {
  let i = 0;
  return (
    <Text style={{ fontSize: size, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 }}>
      {text.split('').map((ch, idx) => {
        const color = ch === ' ' ? 'transparent' : RAINBOW[i++ % RAINBOW.length];
        return (
          <Text key={idx} style={{ color }}>
            {ch}
          </Text>
        );
      })}
    </Text>
  );
}

export function H1({ children, style }) {
  const t = useTheme();
  return <Text style={[styles.h1, { color: t.text }, style]}>{children}</Text>;
}
export function H2({ children, style }) {
  const t = useTheme();
  return <Text style={[styles.h2, { color: t.text }, style]}>{children}</Text>;
}
export function P({ children, style, muted, center }) {
  const t = useTheme();
  return (
    <Text style={[styles.p, { color: muted ? t.muted : t.text }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, color, onPress }) {
  const t = useTheme();
  const content = (
    <View
      style={[
        styles.card,
        { backgroundColor: t.card, borderColor: color || t.border },
        color && { borderLeftWidth: 6 },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
      {content}
    </Pressable>
  );
}

export function Btn({ title, onPress, color, variant = 'solid', disabled, loading, small, style, textColor }) {
  const t = useTheme();
  const bg = color || t.primary;
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        solid ? { backgroundColor: bg } : { borderWidth: 2, borderColor: bg, backgroundColor: 'transparent' },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={solid ? '#fff' : bg} />
      ) : (
        <Text
          style={[
            styles.btnText,
            small && { fontSize: 14 },
            { color: textColor || (solid ? (bg === '#FFC93C' ? '#2B2140' : '#fff') : bg) },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, style, multiline, ...props }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={[styles.label, { color: t.muted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.muted}
        style={[
          styles.input,
          { backgroundColor: t.input, color: t.text, borderColor: t.border },
          multiline && { minHeight: 100, textAlignVertical: 'top' },
          style,
        ]}
        multiline={multiline}
        {...props}
      />
    </View>
  );
}

export function Avatar({ name, size = 40, dim }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colorFor(name),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.4 : 1,
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>
        {(name || '?').trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function Badge({ text, color }) {
  return (
    <View style={[styles.badge, { backgroundColor: color || '#9B5DE5' }]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

export function Row({ children, style, gap = 10 }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Loading({ text = 'Carregando...' }) {
  const t = useTheme();
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator size="large" color={t.primary} />
      <Text style={{ color: t.muted }}>{text}</Text>
    </View>
  );
}

export function ErrorText({ children }) {
  const t = useTheme();
  if (!children) return null;
  return <Text style={{ color: t.danger, marginVertical: 8, fontWeight: '600' }}>{children}</Text>;
}

/** Contagem regressiva até uma data ISO. */
export function Countdown({ until, style }) {
  const t = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  if (!until) return null;
  const left = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <Text style={[{ fontSize: 44, fontWeight: '900', textAlign: 'center', color: left <= 10 ? t.danger : t.text }, style]}>
      {mm}:{ss}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 30, fontWeight: '700', marginTop: -4 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  scrollContent: { padding: 16, paddingBottom: 48 },
  padded: { padding: 16 },
  h1: { fontSize: 26, fontWeight: '900', marginBottom: 8 },
  h2: { fontSize: 19, fontWeight: '800', marginBottom: 8, marginTop: 4 },
  p: { fontSize: 16, lineHeight: 22 },
  card: { borderRadius: radius.md, padding: 16, marginBottom: 14, borderWidth: 1 },
  btn: { borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', marginVertical: 5 },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 12 },
  btnText: { fontSize: 17, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 2, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
