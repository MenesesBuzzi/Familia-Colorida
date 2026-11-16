import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavContext } from './src/lib/nav';
import { ensureSession, errorMessage } from './src/lib/supabase';
import { isConfigured } from './src/lib/config';
import { getNickname, saveNickname } from './src/lib/storage';
import { Btn, ErrorText, Loading, P, RainbowTitle, Screen } from './src/components/ui';

import HomeScreen from './src/screens/HomeScreen';
import SSMenuScreen from './src/screens/secretSanta/SSMenuScreen';
import SSGroupScreen from './src/screens/secretSanta/SSGroupScreen';
import SSRevealScreen from './src/screens/secretSanta/SSRevealScreen';
import SSChatScreen from './src/screens/secretSanta/SSChatScreen';
import SSAnonScreen from './src/screens/secretSanta/SSAnonScreen';
import WWMenuScreen from './src/screens/werewolf/WWMenuScreen';
import WWRoomScreen from './src/screens/werewolf/WWRoomScreen';

const SCREENS = {
  Home: HomeScreen,
  SSMenu: SSMenuScreen,
  SSGroup: SSGroupScreen,
  SSReveal: SSRevealScreen,
  SSChat: SSChatScreen,
  SSAnon: SSAnonScreen,
  WWMenu: WWMenuScreen,
  WWRoom: WWRoomScreen,
};

export default function App() {
  const [stack, setStack] = useState([{ name: 'Home', params: {}, key: 'home' }]);
  const [user, setUser] = useState(null);
  const [nickname, setNick] = useState('');
  const [bootError, setBootError] = useState('');
  const [booting, setBooting] = useState(true);

  const boot = useCallback(async () => {
    setBooting(true);
    setBootError('');
    try {
      setNick(await getNickname());
      if (!isConfigured) throw new Error('Supabase não configurado: crie o arquivo .env (veja o README).');
      setUser(await ensureSession());
    } catch (e) {
      setBootError(errorMessage(e));
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  const nav = useMemo(
    () => ({
      push: (name, params = {}) =>
        setStack((s) => [...s, { name, params, key: `${name}-${Date.now()}` }]),
      replace: (name, params = {}) =>
        setStack((s) => [...s.slice(0, -1), { name, params, key: `${name}-${Date.now()}` }]),
      back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      reset: () => setStack([{ name: 'Home', params: {}, key: `home-${Date.now()}` }]),
      user,
      nickname,
      setNickname: (n) => {
        setNick(n);
        saveNickname(n);
      },
    }),
    [user, nickname]
  );

  // botão "voltar" do Android
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        nav.back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, nav]);

  let content;
  if (booting) {
    content = (
      <Screen scroll={false}>
        <RainbowTitle text="Família Colorida" size={34} />
        <Loading text="Preparando a diversão..." />
      </Screen>
    );
  } else if (bootError) {
    content = (
      <Screen>
        <RainbowTitle text="Família Colorida" size={34} />
        <P center style={{ marginTop: 24 }}>Não deu para conectar 😕</P>
        <ErrorText>{bootError}</ErrorText>
        <Btn title="Tentar de novo" onPress={boot} />
      </Screen>
    );
  } else {
    const top = stack[stack.length - 1];
    const Comp = SCREENS[top.name] || HomeScreen;
    content = <Comp key={top.key} {...top.params} />;
  }

  return (
    <SafeAreaProvider>
      <NavContext.Provider value={nav}>{content}</NavContext.Provider>
    </SafeAreaProvider>
  );
}
