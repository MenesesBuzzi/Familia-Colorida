import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage } from '../../lib/supabase';
import { cleanCode } from '../../lib/format';
import { createRadio, joinRadio, myRadios } from '../../lib/radio/api';
import { Btn, Card, ErrorText, Field, H2, Loading, P, Screen } from '../../components/ui';
import { palette } from '../../theme';

export default function RadioMenuScreen() {
  const nav = useNav();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rooms, setRooms] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const userId = nav.user?.id;

  useEffect(() => {
    let alive = true;
    myRadios(userId)
      .then((r) => alive && setRooms(r))
      .catch((e) => {
        if (!alive) return;
        setRooms([]);
        setErr(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const create = async () => {
    const n = name.trim() || `Rádio de ${nav.nickname}`;
    setBusy('create');
    setErr('');
    try {
      const data = await createRadio(n.slice(0, 60), nav.nickname);
      nav.replace('RadioRoom', { roomId: data.id });
    } catch (e) {
      setErr(errorMessage(e));
      setBusy('');
    }
  };

  const join = async () => {
    const c = cleanCode(code);
    if (c.length !== 6) return setErr('O código tem 6 caracteres.');
    setBusy('join');
    setErr('');
    try {
      const id = await joinRadio(c, nav.nickname);
      nav.replace('RadioRoom', { roomId: id });
    } catch (e) {
      setErr(errorMessage(e));
      setBusy('');
    }
    return null;
  };

  return (
    <Screen title="📻 Rádio Amigo" onBack={nav.back}>
      <Text style={{ fontSize: 60, textAlign: 'center' }}>📻🎶</Text>
      <P center muted style={{ marginBottom: 16 }}>
        Envie seus MP3 para a 📚 Biblioteca, todo mundo vota 👍 ou 👎 na fila e a rádio toca para a turma — até
        com o celular bloqueado. Tem walkie-talkie e a IA também dá palpites!
      </P>
      <ErrorText>{err}</ErrorText>

      <Card color={palette.sky}>
        <H2>Entrar numa rádio</H2>
        <Field
          placeholder="ABC123"
          value={code}
          onChangeText={(t) => setCode(cleanCode(t))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '800' }}
        />
        <Btn title="Entrar" color={palette.sky} onPress={join} loading={busy === 'join'} />
      </Card>

      <Card color={palette.mint}>
        <H2>Criar rádio</H2>
        <Field placeholder={`Rádio de ${nav.nickname}`} value={name} onChangeText={setName} maxLength={60} />
        <Btn title="Criar nova rádio" color={palette.mint} onPress={create} loading={busy === 'create'} />
      </Card>

      <Btn title="📚 Biblioteca de músicas" color={palette.grape} variant="outline" onPress={() => nav.push('RadioLibrary')} />

      <H2>Minhas rádios</H2>
      {rooms === null ? (
        <Loading />
      ) : rooms.length === 0 ? (
        <P muted>Você ainda não está em nenhuma rádio.</P>
      ) : (
        rooms.map((r) => (
          <Card key={r.id} color={palette.sky} onPress={() => nav.push('RadioRoom', { roomId: r.id })}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#2B2140' }}>📻 {r.name}</Text>
            <P muted style={{ fontSize: 14 }}>
              Código {r.code}
              {r.owner_id === userId ? ' · você criou' : ''}
            </P>
          </Card>
        ))
      )}
    </Screen>
  );
}
