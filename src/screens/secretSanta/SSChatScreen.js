import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage, supabase } from '../../lib/supabase';
import { useInterval, useRealtime } from '../../lib/realtime';
import { formatTime } from '../../lib/format';
import { Btn, ErrorText, Field, P, Row, Screen, useTheme } from '../../components/ui';
import { colorFor, palette } from '../../theme';

export default function SSChatScreen({ groupId, groupName }) {
  const nav = useNav();
  const me = nav.user.id;
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const listRef = useRef(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('ss_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) setErr(errorMessage(error));
    else setMsgs(data || []);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(
    `ss-chat-${groupId}`,
    [{ table: 'ss_messages', filter: `group_id=eq.${groupId}`, event: 'INSERT' }],
    (payload) => {
      const m = payload.new;
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
    }
  );
  useInterval(load, 20000);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setErr('');
    const { data, error } = await supabase
      .from('ss_messages')
      .insert({ group_id: groupId, user_id: me, nickname: nav.nickname, body })
      .select()
      .single();
    setSending(false);
    if (error) {
      setErr(errorMessage(error));
      return;
    }
    setText('');
    setMsgs((prev) => (prev.some((x) => x.id === data.id) ? prev : [data, ...prev]));
  };

  const footer = (
    <View style={{ padding: 12, borderTopWidth: 1, borderColor: '#F0E2CC', backgroundColor: '#FFF7EC' }}>
      <ErrorText>{err}</ErrorText>
      <Row>
        <View style={{ flex: 1 }}>
          <Field placeholder="Escreva para a família..." value={text} onChangeText={setText} maxLength={500} style={{ marginBottom: -12 }} />
        </View>
        <Btn title="Enviar" color={palette.sky} onPress={send} loading={sending} small />
      </Row>
    </View>
  );

  return (
    <Screen title={`💬 ${groupName || 'Sala da Comunidade'}`} onBack={nav.back} scroll={false} footer={footer}>
      <FlatList
        ref={listRef}
        inverted
        data={msgs}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => <Bubble m={item} mine={item.user_id === me} />}
        ListEmptyComponent={
          <P muted center style={{ transform: [{ scaleY: -1 }], marginTop: 40 }}>
            Nenhuma mensagem ainda. Diga oi! 👋
          </P>
        }
      />
    </Screen>
  );
}

function Bubble({ m, mine }) {
  const t = useTheme();
  const c = colorFor(m.nickname);
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginVertical: 4 }}>
      <View
        style={{
          maxWidth: '82%',
          backgroundColor: mine ? palette.sky : t.card,
          borderRadius: 16,
          borderTopRightRadius: mine ? 4 : 16,
          borderTopLeftRadius: mine ? 16 : 4,
          padding: 10,
          borderWidth: mine ? 0 : 2,
          borderColor: c,
        }}
      >
        {!mine && <Text style={{ color: c, fontWeight: '800', marginBottom: 2 }}>{m.nickname}</Text>}
        <Text style={{ color: mine ? '#fff' : t.text, fontSize: 16 }}>{m.body}</Text>
        <Text style={{ color: mine ? '#E8F0FF' : t.muted, fontSize: 11, alignSelf: 'flex-end', marginTop: 2 }}>
          {formatTime(m.created_at)}
        </Text>
      </View>
    </View>
  );
}
