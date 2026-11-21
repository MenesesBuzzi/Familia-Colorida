import React, { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { useNav } from '../lib/nav';
import { useProfile } from '../lib/profileContext';
import { avatarFromUser, updateProfile } from '../lib/profile';
import { signOut } from '../lib/auth';
import { errorMessage } from '../lib/supabase';
import { saveNickname } from '../lib/storage';
import { Avatar, Btn, Card, ErrorText, Field, H2, P, Screen } from '../components/ui';
import { palette } from '../theme';

// Avatares prontos (imagens PNG geradas pelo DiceBear a partir de uma "semente")
const SEEDS = ['Sol', 'Lua', 'Arco', 'Pipoca', 'Bolinha', 'Foguete', 'Cacau', 'Estrela'];
const presetUrl = (seed) => `https://api.dicebear.com/9.x/fun-emoji/png?seed=${encodeURIComponent(seed)}&size=128`;

export default function ProfileScreen() {
  const nav = useNav();
  const { profile, setProfile, profileError } = useProfile();
  const [nick, setNick] = useState(profile?.nickname || nav.nickname || '');
  const [avatar, setAvatar] = useState(profile?.avatar_url || null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const user = nav.user;
  const googleAvatar = avatarFromUser(user);
  const isGuest = !!user?.is_anonymous;
  const provider = user?.app_metadata?.provider;
  const changed = nick.trim() !== (profile?.nickname || '') || (avatar || null) !== (profile?.avatar_url || null);

  const save = async () => {
    const n = nick.trim();
    if (!n) return setErr('O apelido não pode ficar vazio.');
    setBusy('save');
    setErr('');
    setOk('');
    try {
      const saved = profile?.local
        ? { ...profile, nickname: n, avatar_url: avatar || null }
        : await updateProfile(user.id, { nickname: n, avatar_url: avatar || null });
      setProfile(saved);
      saveNickname(n);
      setOk('Perfil salvo! ✅');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
    return null;
  };

  const useLink = () => {
    const url = link.trim();
    if (!/^https:\/\/\S+$/i.test(url)) return setErr('Cole um link de imagem que comece com https://');
    if (url.length > 1000) return setErr('Link muito longo.');
    setErr('');
    setAvatar(url);
    setLink('');
    return null;
  };

  const logout = () => {
    const doIt = async () => {
      setBusy('out');
      try {
        await signOut();
      } catch (e) {
        setErr(errorMessage(e));
        setBusy('');
      }
    };
    Alert.alert(
      'Sair da conta?',
      isGuest
        ? 'Você está como convidado: ao sair, não vai conseguir voltar para esta conta nem para os grupos dela.'
        : 'Você pode entrar de novo quando quiser.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: doIt },
      ]
    );
  };

  return (
    <Screen title="🙂 Meu Perfil" onBack={nav.back}>
      <View style={{ alignItems: 'center', marginVertical: 12 }}>
        <Avatar name={nick || '?'} uri={avatar} size={110} ring={palette.sun} />
        <Text style={{ fontSize: 24, fontWeight: '900', marginTop: 10, color: '#2B2140' }}>{nick || 'Sem apelido'}</Text>
        <P muted>
          {isGuest ? 'Convidado' : user?.email || ''}
          {provider === 'google' ? ' · Google' : ''}
        </P>
      </View>

      {profileError ? (
        <Card color={palette.orange}>
          <P muted>Perfil salvo só neste celular (servidor sem a tabela de perfis): {profileError}</P>
        </Card>
      ) : null}

      <Card>
        <Field label="Apelido" value={nick} onChangeText={setNick} maxLength={30} placeholder="Ex.: Tia Rose" />
      </Card>

      <Card>
        <H2>Foto</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {googleAvatar ? (
            <Choice selected={avatar === googleAvatar} onPress={() => setAvatar(googleAvatar)} label="Google">
              <Avatar name={nick} uri={googleAvatar} size={56} />
            </Choice>
          ) : null}
          {SEEDS.map((s) => {
            const url = presetUrl(s);
            return (
              <Choice key={s} selected={avatar === url} onPress={() => setAvatar(url)}>
                <Image source={{ uri: url }} style={{ width: 56, height: 56, borderRadius: 28 }} />
              </Choice>
            );
          })}
          <Choice selected={!avatar} onPress={() => setAvatar(null)} label="Letra">
            <Avatar name={nick || '?'} size={56} />
          </Choice>
        </View>
        <Field
          label="Ou cole o link de uma imagem"
          placeholder="https://..."
          value={link}
          onChangeText={setLink}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ marginTop: 6 }}
        />
        {link.trim() ? <Btn small title="Usar este link" variant="outline" color={palette.sky} onPress={useLink} /> : null}
      </Card>

      <ErrorText>{err}</ErrorText>
      {ok ? <P center style={{ color: palette.leaf, fontWeight: '800' }}>{ok}</P> : null}
      <Btn title="Salvar perfil" color={palette.grape} onPress={save} loading={busy === 'save'} disabled={!changed} />
      <Btn title="Sair da conta" variant="outline" color="#E63946" onPress={logout} loading={busy === 'out'} />
    </Screen>
  );
}

function Choice({ children, selected, onPress, label }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center' }}>
      <View
        style={{
          borderWidth: 3,
          borderColor: selected ? palette.grape : 'transparent',
          borderRadius: 34,
          padding: 2,
        }}
      >
        {children}
      </View>
      {label ? <Text style={{ fontSize: 11, color: '#7A6F8A', marginTop: 2 }}>{label}</Text> : null}
    </Pressable>
  );
}
