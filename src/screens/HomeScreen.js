import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useNav } from '../lib/nav';
import { Card, ErrorText, Field, P, RainbowTitle, Screen } from '../components/ui';
import { palette } from '../theme';

export default function HomeScreen() {
  const nav = useNav();
  const [nick, setNick] = useState(nav.nickname);
  const [err, setErr] = useState('');

  const go = (screen) => {
    const n = nick.trim();
    if (!n) {
      setErr('Escolha um apelido primeiro 😉');
      return;
    }
    if (n !== nav.nickname) nav.setNickname(n);
    setErr('');
    nav.push(screen);
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 6 }}>
        <Text style={{ fontSize: 48 }}>🎈🎁🐺</Text>
        <RainbowTitle text="Família Colorida" size={36} />
        <P muted center style={{ marginTop: 6 }}>
          Jogos para a família, cada um no seu celular
        </P>
      </View>

      <Card style={{ marginTop: 18 }}>
        <Field
          label="Seu apelido"
          placeholder="Ex.: Tia Rose"
          value={nick}
          onChangeText={setNick}
          onEndEditing={() => nick.trim() && nav.setNickname(nick.trim())}
          maxLength={30}
        />
        <ErrorText>{err}</ErrorText>
      </Card>

      <ModeCard
        emoji="🎁"
        title="Amigo Secreto"
        subtitle="Crie o grupo, monte a lista de desejos e faça o sorteio"
        color={palette.coral}
        onPress={() => go('SSMenu')}
      />
      <ModeCard
        emoji="🐺"
        title="Lobisomem"
        subtitle="Cidade Dorme com narrador IA, fantasmas e objetos falantes"
        color={palette.grape}
        onPress={() => go('WWMenu')}
      />
    </Screen>
  );
}

function ModeCard({ emoji, title, subtitle, color, onPress }) {
  return (
    <Card onPress={onPress} style={{ backgroundColor: color, borderColor: color, padding: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Text style={{ fontSize: 52 }}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{title}</Text>
          <Text style={{ color: '#fff', fontSize: 15, marginTop: 4, opacity: 0.95 }}>{subtitle}</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900' }}>›</Text>
      </View>
    </Card>
  );
}
