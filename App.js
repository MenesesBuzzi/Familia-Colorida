import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { NavContext } from './src/lib/nav';
import { ProfileContext } from './src/lib/profileContext';
import { errorMessage, supabase } from './src/lib/supabase';
import { isConfigured } from './src/lib/config';
import { createSessionFromUrl } from './src/lib/auth';
import { isAuthCallback } from './src/lib/authUrl';
import { avatarFromUser, ensureProfile, nickFromUser, updateProfile } from './src/lib/profile';
import { getNickname, saveNickname } from './src/lib/storage';
import { collectScreens } from './src/apps/registry';
import { Btn, ErrorText, Loading, P, RainbowTitle, Screen } from './src/components/ui';
import { AudioProvider } from './src/lib/audio/AudioProvider';

import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';

// Telas de todos os mini-apps (src/apps/registry.js) + a tela inicial
const SCREENS = { Home: HomeScreen, ...collectScreens() };

const homeEntry = () => ({ name: 'Home', params: {}, key: `home-${Date.now()}` });

export default function App() {
  const [stack, setStack] = useState(() => [homeEntry()]);
  const [session, setSession] = useState(undefined); // undefined = ainda carregando
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [authError, setAuthError] = useState('');
  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const lastUser = useRef(null);

  // 1) Sessão salva + mudanças de login/logout
  useEffect(() => {
    if (!isConfigured) return undefined;
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => alive && setSession(data?.session ?? null))
      .catch(() => alive && setSession(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) setSession(s ?? null);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // 2) Volta do login do Google / link de confirmação de e-mail (deep link)
  useEffect(() => {
    if (!isConfigured) return undefined;
    const handle = (url) => {
      if (!url || !isAuthCallback(url)) return;
      createSessionFromUrl(url)
        .then(() => setAuthError(''))
        .catch((e) => setAuthError(errorMessage(e)));
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // 3) Perfil do usuário (tabela profiles)
  const loadProfile = useCallback(async (u) => {
    setProfileError('');
    try {
      const p = await ensureProfile(u);
      setProfile(p);
      if (p?.nickname) saveNickname(p.nickname);
    } catch (e) {
      // Sem a tabela profiles (schema antigo) o app ainda funciona com um perfil local
      console.log('[perfil] usando perfil local:', e?.message || e);
      const local = await getNickname().catch(() => '');
      setProfile({ id: u.id, nickname: nickFromUser(u, local), avatar_url: avatarFromUser(u), local: true });
      setProfileError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    setStack([homeEntry()]);
    setProfile(null);
    if (user) {
      // fora do callback do onAuthStateChange (evita travar o cliente do Supabase)
      setTimeout(() => loadProfile(user), 0);
    }
  }, [userId, user, loadProfile]);

  const setNickname = useCallback(
    async (n) => {
      const nick = String(n || '').trim().slice(0, 30);
      if (!nick || !userId) return;
      setProfile((p) => (p ? { ...p, nickname: nick } : p));
      saveNickname(nick);
      try {
        const saved = await updateProfile(userId, { nickname: nick });
        if (saved) setProfile(saved);
      } catch (e) {
        console.log('[perfil] não salvou apelido:', e?.message || e);
      }
    },
    [userId]
  );

  const nav = useMemo(
    () => ({
      push: (name, params = {}) => setStack((s) => [...s, { name, params, key: `${name}-${Date.now()}` }]),
      replace: (name, params = {}) =>
        setStack((s) => [...s.slice(0, -1), { name, params, key: `${name}-${Date.now()}` }]),
      back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      reset: () => setStack([homeEntry()]),
      user,
      profile,
      nickname: profile?.nickname || nickFromUser(user),
      avatarUrl: profile?.avatar_url || null,
      setNickname,
    }),
    [user, profile, setNickname]
  );

  const profileCtx = useMemo(
    () => ({ profile, setProfile, reloadProfile: () => (user ? loadProfile(user) : Promise.resolve()), profileError }),
    [profile, user, loadProfile, profileError]
  );

  // Botão "voltar" do Android: volta uma tela; na tela inicial deixa o Android fechar o app
  const depth = stack.length;
  const back = nav.back;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (user && depth > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [depth, back, user]);

  let content;
  if (!isConfigured) {
    content = (
      <Screen>
        <RainbowTitle text="Família Colorida" size={34} />
        <P center style={{ marginTop: 24 }}>Não deu para conectar 😕</P>
        <ErrorText>Supabase não configurado: crie o arquivo .env (veja o README).</ErrorText>
      </Screen>
    );
  } else if (session === undefined) {
    content = (
      <Screen scroll={false}>
        <RainbowTitle text="Família Colorida" size={34} />
        <Loading text="Preparando a diversão..." />
      </Screen>
    );
  } else if (!user) {
    content = <LoginScreen authError={authError} clearAuthError={() => setAuthError('')} />;
  } else if (!profile) {
    content = (
      <Screen scroll={false}>
        <RainbowTitle text="Família Colorida" size={34} />
        <Loading text="Carregando seu perfil..." />
        <Btn title="Sair" variant="outline" onPress={() => supabase.auth.signOut()} />
      </Screen>
    );
  } else {
    const top = stack[stack.length - 1];
    const Comp = SCREENS[top.name] || HomeScreen;
    content = <Comp key={top.key} {...top.params} />;
  }

  return (
    <SafeAreaProvider>
      <ProfileContext.Provider value={profileCtx}>
        <NavContext.Provider value={nav}>
          {/* v3: áudio global (Rádio em qualquer tela / segundo plano + walkie-talkie) */}
          <AudioProvider userId={userId}>{content}</AudioProvider>
        </NavContext.Provider>
      </ProfileContext.Provider>
    </SafeAreaProvider>
  );
}
