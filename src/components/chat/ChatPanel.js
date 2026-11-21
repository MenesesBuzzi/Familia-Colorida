import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, useTheme } from '../ui';
import HoldToTalk from '../audio/HoldToTalk';
import VoiceMessage from '../audio/VoiceMessage';

/**
 * Chat reutilizável (serve para qualquer mini-app).
 * messages: [{ id, user_id, nickname, avatar_url?, kind?: 'jogador' | 'ia' | 'sistema', body, created_at }]
 * onSend(text) -> Promise<string | null>  (texto de erro ou null)
 * canSend=false mostra `disabledText` no lugar do campo.
 * v3: mensagens com kind 'voz' (+ audio_path, audio_ms) viram um player; onVoice(clip) -> Promise<string | null>
 * mostra o botão 🎤 "segure para gravar"; fill=true ocupa a tela toda (app Chat).
 */
export default function ChatPanel({
  messages,
  me,
  onSend,
  canSend = true,
  disabledText = 'Você não pode escrever aqui agora.',
  placeholder = 'Escreva uma mensagem...',
  emptyText = 'Ninguém falou nada ainda.',
  accent = '#9B5DE5',
  aiName = 'Sussurro',
  height = 420,
  maxLength = 500,
  onVoice,
  fill = false,
}) {
  const t = useTheme();
  const scroll = useRef(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setErr('');
    const e = await onSend(body);
    setBusy(false);
    if (e) setErr(e);
    else setText('');
  };

  return (
    <View style={[styles.box, { backgroundColor: t.card, borderColor: t.border }, fill && { flex: 1, marginBottom: 0 }]}>
      <ScrollView
        ref={scroll}
        style={fill ? { flex: 1 } : { height }}
        contentContainerStyle={{ padding: 10, gap: 8 }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {!messages.length ? <Text style={[styles.empty, { color: t.muted }]}>{emptyText}</Text> : null}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} mine={m.user_id === me && m.kind !== 'ia' && m.kind !== 'sistema'} accent={accent} aiName={aiName} />
        ))}
      </ScrollView>

      {err ? <Text style={[styles.err, { color: t.danger }]}>{err}</Text> : null}
      {canSend ? (
        <View style={[styles.inputRow, { borderTopColor: t.border }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={t.muted}
            maxLength={maxLength}
            multiline
            style={[styles.input, { backgroundColor: t.input, color: t.text, borderColor: t.border }]}
          />
          {onVoice && !text.trim() ? (
            <HoldToTalk
              compact
              color={accent}
              maxSec={60}
              onSend={async (clip) => {
                const e = await onVoice(clip);
                if (e) throw new Error(e);
              }}
              onError={setErr}
            />
          ) : (
          <Pressable
            onPress={send}
            disabled={busy || !text.trim()}
            style={[styles.send, { backgroundColor: accent, opacity: busy || !text.trim() ? 0.5 : 1 }]}
            accessibilityLabel="Enviar"
          >
            <Text style={styles.sendTxt}>➤</Text>
          </Pressable>
          )}
        </View>
      ) : (
        <Text style={[styles.disabled, { color: t.muted, borderTopColor: t.border }]}>{disabledText}</Text>
      )}
    </View>
  );
}

function hhmm(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Bubble({ m, mine, accent, aiName }) {
  const t = useTheme();
  if (m.kind === 'ia' || m.kind === 'sistema') {
    return (
      <View style={[styles.ai, { borderColor: accent, backgroundColor: t.cardAlt }]}>
        <Text style={[styles.aiName, { color: accent }]}>
          {m.kind === 'ia' ? `🎙️ ${aiName}` : 'ℹ️ Aviso'} <Text style={{ color: t.muted, fontWeight: '600' }}>{hhmm(m.created_at)}</Text>
        </Text>
        <Text style={{ color: t.text, fontSize: 15, lineHeight: 21 }}>{m.body}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.row, mine && { flexDirection: 'row-reverse' }]}>
      <Avatar name={m.nickname} uri={m.avatar_url} size={30} />
      <View style={[styles.bubble, { backgroundColor: mine ? accent : t.cardAlt }]}>
        {!mine ? <Text style={[styles.name, { color: accent }]}>{m.nickname}</Text> : null}
        {m.kind === 'voz' ? (
          <VoiceMessage path={m.audio_path} durationMs={m.audio_ms} color={mine ? '#fff' : t.text} />
        ) : (
          <Text style={{ color: mine ? '#fff' : t.text, fontSize: 15, lineHeight: 21 }}>{m.body}</Text>
        )}
        <Text style={[styles.time, { color: mine ? '#ffffffAA' : t.muted }]}>{hhmm(m.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 14 },
  empty: { textAlign: 'center', marginTop: 30 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '78%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  name: { fontWeight: '800', fontSize: 12, marginBottom: 2 },
  time: { fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  ai: { borderLeftWidth: 4, borderRadius: 12, padding: 10 },
  aiName: { fontWeight: '900', fontSize: 13, marginBottom: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 8, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, maxHeight: 100 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { color: '#fff', fontSize: 20, fontWeight: '900' },
  disabled: { padding: 12, textAlign: 'center', borderTopWidth: 1, fontStyle: 'italic' },
  err: { paddingHorizontal: 12, paddingTop: 6, fontWeight: '600' },
});
