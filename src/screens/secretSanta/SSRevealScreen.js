import React, { useEffect, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useNav } from '../../lib/nav';
import { errorMessage, supabase } from '../../lib/supabase';
import { Avatar, Btn, Card, ErrorText, H2, Loading, P, Screen } from '../../components/ui';
import { palette } from '../../theme';

export default function SSRevealScreen({ groupId }) {
  const nav = useNav();
  const [friend, setFriend] = useState(null);
  const [err, setErr] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    (async () => {
      const { data: pair, error } = await supabase
        .from('ss_pairs')
        .select('receiver_id')
        .eq('group_id', groupId)
        .eq('giver_id', nav.user.id)
        .maybeSingle();
      if (error) return setErr(errorMessage(error));
      if (!pair) return setErr('O sorteio ainda não foi feito.');
      const { data: m, error: e2 } = await supabase
        .from('ss_members')
        .select('nickname, wishlist')
        .eq('group_id', groupId)
        .eq('user_id', pair.receiver_id)
        .maybeSingle();
      if (e2) return setErr(errorMessage(e2));
      setFriend(m || { nickname: '(saiu do grupo)', wishlist: '' });
      return null;
    })();
  }, [groupId, nav.user.id]);

  const toggle = () => {
    const next = !revealed;
    setRevealed(next);
    Animated.spring(anim, { toValue: next ? 1 : 0, useNativeDriver: true, friction: 6 }).start();
  };

  const scale = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Screen title="Meu amigo secreto" onBack={nav.back}>
      <ErrorText>{err}</ErrorText>
      {!friend && !err ? <Loading /> : null}
      {friend && (
        <>
          <P muted center style={{ marginBottom: 12 }}>
            Garanta que ninguém está espiando 👀 e toque no presente.
          </P>
          <Pressable onPress={toggle}>
            <Animated.View
              style={{
                backgroundColor: revealed ? palette.leaf : palette.coral,
                borderRadius: 28,
                padding: 30,
                alignItems: 'center',
                minHeight: 260,
                justifyContent: 'center',
                transform: [{ scale }, { rotate }],
              }}
            >
              {revealed ? (
                <View style={{ alignItems: 'center', gap: 10 }}>
                  <Avatar name={friend.nickname} size={90} />
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Você tirou</Text>
                  <Text style={{ color: '#fff', fontSize: 36, fontWeight: '900', textAlign: 'center' }}>
                    {friend.nickname}
                  </Text>
                  <Text style={{ color: '#fff', opacity: 0.9 }}>toque para esconder</Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 110 }}>🎁</Text>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>Toque para revelar</Text>
                </View>
              )}
            </Animated.View>
          </Pressable>

          {revealed && (
            <Card color={palette.sun} style={{ marginTop: 18 }}>
              <H2>📝 Lista de desejos</H2>
              <P>{friend.wishlist || 'Ainda não escreveu nada. Mande uma mensagem anônima perguntando! 😉'}</P>
            </Card>
          )}
          <Btn
            title="🤫 Mandar mensagem anônima"
            color={palette.grape}
            style={{ marginTop: 12 }}
            onPress={() => nav.push('SSAnon', { groupId })}
          />
        </>
      )}
    </Screen>
  );
}
