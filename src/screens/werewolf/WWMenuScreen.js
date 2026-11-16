import React, { useState } from 'react';
import { Text } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage, supabase } from '../../lib/supabase';
import { cleanCode } from '../../lib/format';
import { DEFAULT_SETTINGS } from '../../lib/werewolf/host';
import { ROLES, ROLE_ORDER } from '../../lib/werewolf/logic';
import { Btn, Card, ErrorText, Field, H2, P, Screen } from '../../components/ui';
import { night, palette } from '../../theme';

export default function WWMenuScreen() {
  const nav = useNav();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy('create');
    setErr('');
    const { data, error } = await supabase.rpc('create_ww_room', {
      p_nickname: nav.nickname,
      p_settings: DEFAULT_SETTINGS,
    });
    setBusy('');
    if (error) return setErr(errorMessage(error));
    nav.replace('WWRoom', { roomId: data.id });
    return null;
  };

  const join = async () => {
    const c = cleanCode(code);
    if (c.length !== 6) return setErr('O código tem 6 caracteres.');
    setBusy('join');
    setErr('');
    const { data, error } = await supabase.rpc('join_ww_room', { p_code: c, p_nickname: nav.nickname });
    setBusy('');
    if (error) return setErr(errorMessage(error));
    nav.replace('WWRoom', { roomId: data });
    return null;
  };

  return (
    <Screen title="🐺 Lobisomem" onBack={nav.back} theme={night}>
      <Text style={{ fontSize: 64, textAlign: 'center' }}>🌕</Text>
      <P center muted style={{ marginBottom: 16 }}>
        Cada um joga no próprio celular. Mínimo de 5 jogadores. O celular de quem cria a sala comanda a partida — deixe-o
        com a tela ligada!
      </P>
      <ErrorText>{err}</ErrorText>

      <Card color={palette.sun}>
        <H2>Entrar numa sala</H2>
        <Field
          placeholder="ABC123"
          value={code}
          onChangeText={(t) => setCode(cleanCode(t))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '800' }}
        />
        <Btn title="Entrar" color={palette.sun} onPress={join} loading={busy === 'join'} />
      </Card>

      <Card color={palette.grape}>
        <H2>Criar sala (você será o anfitrião)</H2>
        <Btn title="Criar nova sala" color={palette.grape} onPress={create} loading={busy === 'create'} />
      </Card>

      <H2>Papéis</H2>
      {ROLE_ORDER.map((r) => (
        <Card key={r} color={ROLES[r].cor} style={{ paddingVertical: 12 }}>
          <Text style={{ color: '#F4F1FF', fontWeight: '800', fontSize: 16 }}>
            {ROLES[r].emoji} {ROLES[r].nome}
          </Text>
          <P muted style={{ fontSize: 14 }}>
            {ROLES[r].descricao}
          </P>
        </Card>
      ))}
    </Screen>
  );
}
