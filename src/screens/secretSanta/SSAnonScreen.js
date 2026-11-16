import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage, supabase } from '../../lib/supabase';
import { useInterval } from '../../lib/realtime';
import { formatTime } from '../../lib/format';
import { Btn, Card, ErrorText, Field, P, Row, Screen } from '../../components/ui';
import { palette } from '../../theme';

// Duas conversas anônimas:
//  - "Pro meu amigo": eu escrevo para quem eu tirei (ele não sabe que sou eu)
//  - "Do meu amigo oculto": quem me tirou escreve para mim (eu não sei quem é)
const TABS = {
  amigo: { title: 'Pro meu amigo', mine: 'eu_para_amigo', theirs: 'amigo_para_mim', color: palette.coral },
  oculto: { title: 'Do meu amigo oculto', mine: 'eu_para_oculto', theirs: 'oculto_para_mim', color: palette.grape },
};

export default function SSAnonScreen({ groupId }) {
  const nav = useNav();
  const [tab, setTab] = useState('amigo');
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_ss_anon', { p_group: groupId });
    if (error) setErr(errorMessage(error));
    else setMsgs(data || []);
  }, [groupId]);

  useEffect(() => {
    load();
    // "ping" por broadcast: avisa o grupo que chegou mensagem nova (sem conteúdo)
    const ch = supabase.channel(`ss-anon-${groupId}`);
    ch.on('broadcast', { event: 'nova' }, () => load()).subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, load]);
  useInterval(load, 10000);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('send_ss_anon', { p_group: groupId, p_body: body, p_to: tab });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setText('');
    channelRef.current?.send({ type: 'broadcast', event: 'nova', payload: {} });
    load();
    return null;
  };

  const cfg = TABS[tab];
  const list = msgs.filter((m) => m.direction === cfg.mine || m.direction === cfg.theirs);

  return (
    <Screen title="🤫 Mensagens anônimas" onBack={nav.back}>
      <Row style={{ marginBottom: 12 }}>
        {Object.entries(TABS).map(([key, v]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 14,
              backgroundColor: tab === key ? v.color : '#FFFFFF',
              borderWidth: 2,
              borderColor: v.color,
            }}
          >
            <Text style={{ textAlign: 'center', fontWeight: '800', color: tab === key ? '#fff' : v.color }}>{v.title}</Text>
          </Pressable>
        ))}
      </Row>

      <P muted style={{ marginBottom: 12 }}>
        {tab === 'amigo'
          ? 'Mande dicas ou pergunte o que seu amigo quer ganhar. Ele não vai saber que é você!'
          : 'Aqui chegam as mensagens de quem tirou você. Responda sem saber quem é 😄'}
      </P>

      {list.length === 0 ? (
        <Card>
          <P muted center>Nenhuma mensagem por aqui ainda.</P>
        </Card>
      ) : (
        list.map((m) => {
          const mine = m.direction === cfg.mine;
          return (
            <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginVertical: 4 }}>
              <View
                style={{
                  maxWidth: '85%',
                  padding: 10,
                  borderRadius: 16,
                  backgroundColor: mine ? cfg.color : '#FFFFFF',
                  borderWidth: mine ? 0 : 2,
                  borderColor: cfg.color,
                }}
              >
                <Text style={{ fontWeight: '800', color: mine ? '#fff' : cfg.color, marginBottom: 2 }}>
                  {mine ? 'Você' : tab === 'amigo' ? 'Seu amigo' : '🎭 Amigo oculto'}
                </Text>
                <Text style={{ color: mine ? '#fff' : '#2B2140', fontSize: 16 }}>{m.body}</Text>
                <Text style={{ color: mine ? '#fff' : '#7A6F8A', fontSize: 11, alignSelf: 'flex-end' }}>
                  {formatTime(m.created_at)}
                </Text>
              </View>
            </View>
          );
        })
      )}

      <ErrorText>{err}</ErrorText>
      <Field
        multiline
        placeholder={tab === 'amigo' ? 'Psiu... o que você gostaria de ganhar?' : 'Responder ao amigo oculto...'}
        value={text}
        onChangeText={setText}
        maxLength={300}
        style={{ minHeight: 70, marginTop: 12 }}
      />
      <Btn title="Enviar anonimamente" color={cfg.color} onPress={send} loading={busy} />
    </Screen>
  );
}
