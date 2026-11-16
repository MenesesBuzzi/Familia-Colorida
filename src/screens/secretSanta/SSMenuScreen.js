import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage, supabase } from '../../lib/supabase';
import { cleanCode, formatBrDate, maskDate, parseBrDate } from '../../lib/format';
import { Badge, Btn, Card, ErrorText, Field, H2, Loading, P, Row, Screen } from '../../components/ui';
import { palette } from '../../theme';

export default function SSMenuScreen() {
  const nav = useNav();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [date, setDate] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [groups, setGroups] = useState(null);

  const loadGroups = useCallback(async () => {
    const { data, error } = await supabase
      .from('ss_members')
      .select('group_id, ss_groups(id, name, code, status, exchange_date)')
      .eq('user_id', nav.user.id);
    if (!error) setGroups((data || []).filter((r) => r.ss_groups).map((r) => r.ss_groups));
  }, [nav.user.id]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const create = async () => {
    setErr('');
    if (!name.trim()) return setErr('Dê um nome ao grupo.');
    let iso = null;
    if (date.trim()) {
      iso = parseBrDate(date);
      if (!iso) return setErr('Data inválida. Use DD/MM/AAAA.');
    }
    setBusy('create');
    const { data, error } = await supabase.rpc('create_ss_group', {
      p_name: name.trim(),
      p_value_limit: limit.trim(),
      p_exchange_date: iso,
      p_nickname: nav.nickname,
    });
    setBusy('');
    if (error) return setErr(errorMessage(error));
    nav.replace('SSGroup', { groupId: data.id });
    return null;
  };

  const join = async () => {
    setErr('');
    const c = cleanCode(code);
    if (c.length !== 6) return setErr('O código tem 6 caracteres.');
    setBusy('join');
    const { data, error } = await supabase.rpc('join_ss_group', { p_code: c, p_nickname: nav.nickname });
    setBusy('');
    if (error) return setErr(errorMessage(error));
    nav.replace('SSGroup', { groupId: data });
    return null;
  };

  return (
    <Screen title="🎁 Amigo Secreto" onBack={nav.back}>
      <ErrorText>{err}</ErrorText>

      <Card color={palette.coral}>
        <H2>Entrar com código</H2>
        <Field
          placeholder="ABC123"
          value={code}
          onChangeText={(t) => setCode(cleanCode(t))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '800' }}
        />
        <Btn title="Entrar no grupo" color={palette.coral} onPress={join} loading={busy === 'join'} />
      </Card>

      <Card color={palette.mint}>
        <H2>Criar novo grupo</H2>
        <Field label="Nome do grupo" placeholder="Natal da Família 2026" value={name} onChangeText={setName} maxLength={60} />
        <Field label="Valor máximo (opcional)" placeholder="R$ 50" value={limit} onChangeText={setLimit} maxLength={30} />
        <Field
          label="Data da troca (opcional)"
          placeholder="24/12/2026"
          value={date}
          onChangeText={(t) => setDate(maskDate(t))}
          keyboardType="number-pad"
          maxLength={10}
        />
        <Btn title="Criar grupo" color={palette.mint} onPress={create} loading={busy === 'create'} />
      </Card>

      <H2>Meus grupos</H2>
      {groups === null ? (
        <Loading />
      ) : groups.length === 0 ? (
        <P muted>Você ainda não participa de nenhum grupo.</P>
      ) : (
        groups.map((g) => (
          <Card key={g.id} onPress={() => nav.push('SSGroup', { groupId: g.id })} color={palette.sun}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#2B2140' }}>{g.name}</Text>
                <P muted>
                  Código {g.code}
                  {g.exchange_date ? ` · troca ${formatBrDate(g.exchange_date)}` : ''}
                </P>
              </View>
              <Badge
                text={g.status === 'sorteado' ? 'Sorteado' : 'Aberto'}
                color={g.status === 'sorteado' ? palette.leaf : palette.sky}
              />
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
