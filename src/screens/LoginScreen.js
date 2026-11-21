import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/auth';
import { errorMessage, signInAsGuest } from '../lib/supabase';
import { Btn, Card, ErrorText, Field, H2, P, RainbowTitle, Row, Screen } from '../components/ui';
import { palette } from '../theme';

/** Tela de entrada: Google, e-mail/senha (entrar ou criar conta) ou convidado. */
export default function LoginScreen({ authError, clearAuthError }) {
  const [mode, setMode] = useState('entrar'); // 'entrar' | 'criar'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const run = async (key, fn) => {
    setBusy(key);
    setErr('');
    setInfo('');
    if (clearAuthError) clearAuthError();
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const google = () => run('google', () => signInWithGoogle());

  const submitEmail = () =>
    run('email', async () => {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Digite um e-mail válido.');
      if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      if (mode === 'entrar') {
        await signInWithEmail(email, password);
        return;
      }
      if (!nickname.trim()) throw new Error('Escolha um apelido 😉');
      const { needsConfirmation } = await signUpWithEmail(email, password, nickname);
      if (needsConfirmation) {
        setInfo('Conta criada! Abra o e-mail de confirmação que enviamos e depois toque em "Entrar".');
        setMode('entrar');
      }
    });

  const guest = () => run('guest', () => signInAsGuest());

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 18 }}>
        <Text style={{ fontSize: 52 }}>🎈🎁📻🐺</Text>
        <RainbowTitle text="Família Colorida" size={36} />
        <P muted center style={{ marginTop: 6 }}>
          Jogos e brincadeiras para a família, cada um no seu celular
        </P>
      </View>

      <ErrorText>{authError || err}</ErrorText>
      {info ? (
        <Card color={palette.leaf}>
          <P>{info}</P>
        </Card>
      ) : null}

      <Btn
        title="G  Entrar com Google"
        color="#FFFFFF"
        textColor="#2B2140"
        style={{ borderWidth: 2, borderColor: '#F0E2CC' }}
        onPress={google}
        loading={busy === 'google'}
        disabled={!!busy && busy !== 'google'}
      />

      <Row style={{ marginVertical: 14 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: '#F0E2CC' }} />
        <P muted>ou com e-mail</P>
        <View style={{ flex: 1, height: 1, backgroundColor: '#F0E2CC' }} />
      </Row>

      <Card>
        <Row style={{ marginBottom: 12 }} gap={8}>
          <Btn
            small
            style={{ flex: 1 }}
            title="Já tenho conta"
            variant={mode === 'entrar' ? 'solid' : 'outline'}
            color={palette.grape}
            onPress={() => setMode('entrar')}
          />
          <Btn
            small
            style={{ flex: 1 }}
            title="Criar conta"
            variant={mode === 'criar' ? 'solid' : 'outline'}
            color={palette.grape}
            onPress={() => setMode('criar')}
          />
        </Row>
        <H2>{mode === 'entrar' ? 'Entrar' : 'Nova conta'}</H2>
        {mode === 'criar' ? (
          <Field label="Apelido" placeholder="Ex.: Tia Rose" value={nickname} onChangeText={setNickname} maxLength={30} />
        ) : null}
        <Field
          label="E-mail"
          placeholder="voce@email.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="Senha"
          placeholder="mínimo 6 caracteres"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'entrar' ? 'password' : 'new-password'}
          onSubmitEditing={submitEmail}
        />
        <Btn
          title={mode === 'entrar' ? 'Entrar' : 'Criar conta'}
          color={palette.grape}
          onPress={submitEmail}
          loading={busy === 'email'}
          disabled={!!busy && busy !== 'email'}
        />
      </Card>

      <Btn
        title="🙂 Entrar como convidado"
        variant="outline"
        color={palette.mint}
        onPress={guest}
        loading={busy === 'guest'}
        disabled={!!busy && busy !== 'guest'}
      />
      <P muted center style={{ fontSize: 13, marginTop: 6 }}>
        Convidado não precisa de cadastro, mas ao sair perde os grupos e salas.
      </P>
    </Screen>
  );
}
