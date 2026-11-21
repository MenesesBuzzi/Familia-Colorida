import React, { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme, Row, Btn } from './ui';
import { palette } from '../theme';

/** Mostra o código da sala com botões de copiar e compartilhar. */
export default function CodeBox({ code, label = 'Código da sala', shareText }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View
      style={{
        backgroundColor: t.cardAlt,
        borderRadius: 18,
        padding: 14,
        marginBottom: 14,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: t.muted, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>{label}</Text>
      <Pressable onPress={copy}>
        <Text style={{ fontSize: 38, fontWeight: '900', letterSpacing: 6, color: t.text, marginVertical: 4 }}>
          {code}
        </Text>
      </Pressable>
      <Row>
        <Btn small title={copied ? 'Copiado! ✅' : 'Copiar'} variant="outline" color={palette.sky} onPress={copy} />
        <Btn
          small
          title="Compartilhar"
          color={palette.leaf}
          onPress={() => Share.share({ message: shareText || `Entra no Família Colorida com o código: ${code}` })}
        />
      </Row>
    </View>
  );
}
