import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage, supabase } from '../../lib/supabase';
import { useInterval, useRealtime } from '../../lib/realtime';
import { formatBrDate } from '../../lib/format';
import { Avatar, Badge, Btn, Card, ErrorText, Field, H2, Loading, P, Row, Screen } from '../../components/ui';
import CodeBox from '../../components/CodeBox';
import { palette } from '../../theme';

export default function SSGroupScreen({ groupId }) {
  const nav = useNav();
  const me = nav.user.id;
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [wish, setWish] = useState('');
  const [wishDirty, setWishDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    const [g, m] = await Promise.all([
      supabase.from('ss_groups').select('*').eq('id', groupId).maybeSingle(),
      supabase.from('ss_members').select('*').eq('group_id', groupId).order('joined_at'),
    ]);
    if (g.error) return setErr(errorMessage(g.error));
    if (!g.data) return setErr('Grupo não encontrado (ou você saiu dele).');
    setGroup(g.data);
    setMembers(m.data || []);
    return null;
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  // preenche a lista de desejos só se o usuário não estiver editando
  useEffect(() => {
    const mine = members.find((x) => x.user_id === me);
    if (mine && !wishDirty) setWish(mine.wishlist || '');
  }, [members, me, wishDirty]);

  useRealtime(
    `ss-group-${groupId}`,
    [
      { table: 'ss_members', filter: `group_id=eq.${groupId}` },
      { table: 'ss_groups', filter: `id=eq.${groupId}` },
    ],
    () => load()
  );
  useInterval(load, 15000);

  if (!group) {
    return (
      <Screen title="Amigo Secreto" onBack={nav.back}>
        {err ? <ErrorText>{err}</ErrorText> : <Loading />}
      </Screen>
    );
  }

  const isOwner = group.owner_id === me;
  const drawn = group.status === 'sorteado';

  const saveWish = async () => {
    setBusy('wish');
    setErr('');
    const { error } = await supabase
      .from('ss_members')
      .update({ wishlist: wish.trim() })
      .eq('group_id', groupId)
      .eq('user_id', me);
    setBusy('');
    if (error) return setErr(errorMessage(error));
    setWishDirty(false);
    setInfo('Lista salva! 🎉');
    setTimeout(() => setInfo(''), 2000);
    load();
    return null;
  };

  const doDraw = async () => {
    setBusy('draw');
    setErr('');
    const { error } = await supabase.rpc('draw_ss_group', { p_group: groupId });
    setBusy('');
    if (error) return setErr(errorMessage(error));
    load();
    return null;
  };

  const askDraw = () => {
    if (members.length < 3) return setErr('São necessárias pelo menos 3 pessoas para o sorteio.');
    Alert.alert(
      drawn ? 'Refazer sorteio?' : 'Fazer o sorteio?',
      drawn
        ? 'Todos vão tirar uma pessoa nova e as mensagens anônimas serão apagadas.'
        : `${members.length} participantes. Depois do sorteio ninguém novo pode entrar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sortear!', onPress: doDraw },
      ]
    );
    return null;
  };

  const leave = () => {
    Alert.alert('Sair do grupo?', 'Você pode entrar de novo com o código.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('ss_members').delete().eq('group_id', groupId).eq('user_id', me);
          if (error) setErr(errorMessage(error));
          else nav.back();
        },
      },
    ]);
  };

  return (
    <Screen title={`🎁 ${group.name}`} onBack={nav.back}>
      <CodeBox
        code={group.code}
        label="Código do grupo"
        shareText={`Entra no nosso Amigo Secreto "${group.name}" no app Família Colorida! Código: ${group.code}`}
      />

      <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <Badge text={drawn ? '✅ Sorteio feito' : '⏳ Aguardando sorteio'} color={drawn ? palette.leaf : palette.sky} />
        {group.value_limit ? <Badge text={`💰 até ${group.value_limit}`} color={palette.orange} /> : null}
        {group.exchange_date ? <Badge text={`📅 ${formatBrDate(group.exchange_date)}`} color={palette.pink} /> : null}
      </Row>

      <ErrorText>{err}</ErrorText>

      {drawn && (
        <Btn title="🎉 Ver meu amigo secreto" color={palette.coral} onPress={() => nav.push('SSReveal', { groupId })} />
      )}
      <Btn title="💬 Sala da Comunidade" color={palette.sky} onPress={() => nav.push('SSChat', { groupId, groupName: group.name })} />
      {drawn && (
        <Btn title="🤫 Mensagens anônimas" color={palette.grape} onPress={() => nav.push('SSAnon', { groupId })} />
      )}

      <Card color={palette.sun} style={{ marginTop: 12 }}>
        <H2>📝 Minha lista de desejos</H2>
        <Field
          multiline
          placeholder={'Ex.:\n- Livro de receitas\n- Caneca divertida\n- Tamanho de camiseta: M'}
          value={wish}
          onChangeText={(t) => {
            setWish(t);
            setWishDirty(true);
          }}
          maxLength={1000}
        />
        {info ? <P style={{ color: palette.leaf, fontWeight: '700' }}>{info}</P> : null}
        <Btn title="Salvar lista" color={palette.orange} onPress={saveWish} loading={busy === 'wish'} disabled={!wishDirty} />
      </Card>

      <H2>Participantes ({members.length})</H2>
      {members.map((m) => (
        <Card key={m.user_id} style={{ paddingVertical: 12 }}>
          <Row>
            <Avatar name={m.nickname} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#2B2140' }}>
                {m.nickname}
                {m.user_id === me ? ' (você)' : ''}
              </Text>
              <P muted style={{ fontSize: 13 }}>
                {m.wishlist ? 'Lista de desejos pronta ✅' : 'Ainda sem lista de desejos'}
              </P>
            </View>
            {m.user_id === group.owner_id ? <Badge text="Organizador" color={palette.grape} /> : null}
          </Row>
        </Card>
      ))}

      {isOwner ? (
        <Btn
          title={drawn ? '🔁 Refazer sorteio' : '🎲 Fazer o sorteio'}
          color={drawn ? palette.orange : palette.leaf}
          variant={drawn ? 'outline' : 'solid'}
          onPress={askDraw}
          loading={busy === 'draw'}
        />
      ) : (
        !drawn && <P muted center>O organizador vai fazer o sorteio quando todos entrarem.</P>
      )}
      {!isOwner && !drawn && <Btn title="Sair do grupo" variant="outline" color="#E63946" onPress={leave} />}
    </Screen>
  );
}
