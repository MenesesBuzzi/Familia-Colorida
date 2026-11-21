import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNav } from '../lib/nav';
import { APPS } from '../apps/registry';
import { Avatar, RainbowTitle } from '../components/ui';
import { palette } from '../theme';
import MiniPlayer from '../components/audio/MiniPlayer';
import { useChatUnread } from '../lib/chat/useChatUnread';
import { badgeText } from '../lib/chat/logic';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const pad = (n) => String(n).padStart(2, '0');

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function greeting(h) {
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Tela inicial com cara de celular: relógio, saudação e grade de ícones dos mini-apps. */
export default function HomeScreen() {
  const nav = useNav();
  const now = useClock();
  const { width } = useWindowDimensions();
  const cols = width >= 600 ? 6 : 4;
  const tile = Math.floor((Math.min(width, 720) - 32) / cols);
  const name = nav.nickname || 'Jogador';
  const unread = useChatUnread(nav.user?.id);
  const badges = { chat: unread };

  const open = (app) => {
    if (app.soon || !app.entry) {
      Alert.alert(`${app.emoji} ${app.title}`, 'Em breve! Esse app ainda está sendo preparado. 🚧');
      return;
    }
    nav.push(app.entry);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      {/* "barra de status" do celular de mentirinha */}
      <View style={styles.statusBar}>
        <Text style={styles.statusTxt}>
          {pad(now.getHours())}:{pad(now.getMinutes())}
        </Text>
        <Text style={styles.statusTxt}>Família Colorida</Text>
        <Text style={styles.statusTxt}>📶 🔋</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.clockBox}>
          <Text style={styles.bigClock}>
            {pad(now.getHours())}:{pad(now.getMinutes())}
          </Text>
          <Text style={styles.date}>
            {DIAS[now.getDay()]}, {now.getDate()} de {MESES[now.getMonth()]}
          </Text>
        </View>

        <Pressable onPress={() => nav.push('Profile')} style={styles.greet}>
          <Avatar name={name} uri={nav.avatarUrl} size={52} ring="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.greetSmall}>{greeting(now.getHours())},</Text>
            <Text style={styles.greetName} numberOfLines={1}>
              {name}! 👋
            </Text>
          </View>
          <Text style={styles.greetArrow}>›</Text>
        </Pressable>

        <View style={[styles.grid, { paddingHorizontal: 16 }]}>
          {APPS.map((app) => (
            <AppIcon key={app.id} app={app} width={tile} badge={app.badge ? badges[app.badge] : 0} onPress={() => open(app)} />
          ))}
        </View>

        <View style={{ marginTop: 26, alignItems: 'center' }}>
          <RainbowTitle text="Família Colorida" size={20} />
        </View>
      </ScrollView>
      <MiniPlayer />
    </SafeAreaView>
  );
}

function AppIcon({ app, width, onPress, badge }) {
  const count = badgeText(badge);
  const size = Math.min(68, width - 18);
  const [c1, c2] = app.colors || [palette.grape, palette.pink];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width, alignItems: 'center', marginBottom: 18 }, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <View style={[styles.icon, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: c2 }]}>
        {/* "degradê" sem biblioteca: um quadrado girado da 1ª cor cobre metade do ícone */}
        <View
          style={{
            position: 'absolute',
            width: size * 1.5,
            height: size * 1.5,
            left: -size * 0.75,
            top: -size * 0.75,
            backgroundColor: c1,
            transform: [{ rotate: '45deg' }],
          }}
        />
        <Text style={{ fontSize: size * 0.5, opacity: app.soon ? 0.55 : 1 }}>{app.emoji}</Text>
        {app.soon ? (
          <View style={styles.soonBadge}>
            <Text style={styles.soonTxt}>em breve</Text>
          </View>
        ) : null}
      </View>
      {count ? (
        <View style={[styles.countBadge, { left: width / 2 + size / 2 - 16 }]} accessibilityLabel={`${count} não lidas`}>
          <Text style={styles.countTxt}>{count}</Text>
        </View>
      ) : null}
      <Text style={[styles.iconLabel, app.soon && { opacity: 0.7 }]} numberOfLines={2}>
        {app.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#3A2E7A' },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  statusTxt: { color: '#FFFFFFCC', fontWeight: '700', fontSize: 13 },
  clockBox: { alignItems: 'center', marginTop: 18, marginBottom: 16 },
  bigClock: { color: '#FFFFFF', fontSize: 64, fontWeight: '200', letterSpacing: 2 },
  date: { color: '#FFFFFFDD', fontSize: 17, fontWeight: '600', textTransform: 'capitalize' },
  greet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 14,
    borderRadius: 22,
    backgroundColor: '#FFFFFF22',
  },
  greetSmall: { color: '#FFFFFFCC', fontSize: 14, fontWeight: '600' },
  greetName: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  greetArrow: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  iconLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  soonBadge: {
    position: 'absolute',
    bottom: 3,
    backgroundColor: '#00000066',
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  soonTxt: { color: '#FFFFFF', fontSize: 8, fontWeight: '800' },
  countBadge: {
    position: 'absolute',
    top: -6,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: '#E63946',
    borderWidth: 2,
    borderColor: '#3A2E7A',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  countTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
