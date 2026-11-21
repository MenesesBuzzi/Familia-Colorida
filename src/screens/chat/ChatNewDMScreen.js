import React, { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage } from '../../lib/supabase';
import { listPeople, openDM } from '../../lib/chat/api';
import { filterLibrary } from '../../lib/radio/queue';
import { Avatar, Card, ErrorText, Field, Loading, P, Row, Screen } from '../../components/ui';
import { palette } from '../../theme';

/** Escolhe alguém para a conversa privada. */
export default function ChatNewDMScreen() {
  const nav = useNav();
  const me = nav.user?.id;
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    listPeople(me)
      .then((p) => alive && setPeople(p))
      .catch((e) => {
        if (!alive) return;
        setPeople([]);
        setErr(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [me]);

  // reaproveita a busca sem acento da Biblioteca (campo "title" = apelido)
  const shown = useMemo(
    () => filterLibrary((people || []).map((p) => ({ ...p, title: p.nickname })), q),
    [people, q]
  );

  const start = async (p) => {
    setBusy(p.id);
    setErr('');
    try {
      const roomId = await openDM(p.id);
      nav.replace('ChatRoom', { roomId, title: p.nickname });
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <Screen title="🔒 Conversa privada" onBack={nav.back}>
      <Field placeholder="Buscar pelo apelido" value={q} onChangeText={setQ} autoCorrect={false} />
      <ErrorText>{err}</ErrorText>
      {people === null ? (
        <Loading text="Procurando a família..." />
      ) : shown.length === 0 ? (
        <P muted center>Ninguém encontrado.</P>
      ) : (
        shown.map((p) => (
          <Card key={p.id} color={palette.grape} onPress={() => start(p)} style={{ paddingVertical: 10 }}>
            <Row>
              <Avatar name={p.nickname} uri={p.avatar_url} size={40} />
              <Text style={{ flex: 1, fontWeight: '800', fontSize: 16, color: '#2B2140' }}>{p.nickname}</Text>
              <Text style={{ fontSize: 18 }}>{busy === p.id ? '⏳' : '💬'}</Text>
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
