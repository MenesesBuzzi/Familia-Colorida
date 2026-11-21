import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { errorMessage } from '../../lib/supabase';
import { listLoboSons, uploadLoboSom } from '../../lib/werewolf/sonsApi';
import { BUILTIN_SOUNDS, normalizeTrilha, refLabel, SCENES, soundForScene, TRILHA_MODES } from '../../lib/werewolf/soundtrack';
import { Btn, Card, ErrorText, H2, P, Row, useTheme } from '../ui';
import { palette } from '../../theme';

function useLoboSons() {
  const [sons, setSons] = useState([]);
  const reload = useCallback(async () => {
    try {
      setSons(await listLoboSons());
    } catch {
      setSons([]);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { sons, reload };
}

function Chip({ label, active, onPress, color = palette.sun, disabled }) {
  const t = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? color : t.cardAlt,
        marginRight: 6,
        marginBottom: 6,
        opacity: disabled && !active ? 0.6 : 1,
      }}
    >
      <Text style={{ fontWeight: '800', color: active ? '#2B2140' : t.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Barrinha de som da sala: o que está tocando, botão de mudo (cada um no seu celular)
 * e, para o anfitrião, a 🎛️ mesa de efeitos que toca para todo mundo.
 */
export function SoundBar({ track, isHost }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const { sons } = useLoboSons();
  const [err, setErr] = useState('');
  if (track.trilha.modo === 'desligada' && !isHost) return null;

  const fire = async (ref) => {
    setErr('');
    const ok = await track.sendFx(ref).catch(() => false);
    if (!ok) setErr('Não consegui mandar o efeito. Confira a internet.');
  };

  const fxLabel = track.lastFx ? refLabel(track.lastFx.ref, sons) : null;

  return (
    <View style={{ marginBottom: 10 }}>
      <Row style={{ backgroundColor: t.cardAlt, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
          {track.muted ? '🔇 Som desligado neste celular' : fxLabel ? `🎛️ ${fxLabel}` : `🎵 ${refLabel(track.ref, sons)}`}
        </Text>
        {isHost ? (
          <Pressable hitSlop={8} onPress={() => setOpen((v) => !v)} accessibilityLabel="Mesa de efeitos">
            <Text style={{ fontSize: 20 }}>{open ? '✖️' : '🎛️'}</Text>
          </Pressable>
        ) : null}
        <Pressable hitSlop={8} onPress={() => track.setMuted(!track.muted)} accessibilityLabel={track.muted ? 'Ligar som' : 'Desligar som'}>
          <Text style={{ fontSize: 20 }}>{track.muted ? '🔇' : '🔊'}</Text>
        </Pressable>
      </Row>
      {isHost && open ? (
        <Card style={{ marginTop: 8 }} color={palette.grape}>
          <H2>🎛️ Mesa de efeitos</H2>
          <P muted style={{ fontSize: 12, marginBottom: 6 }}>Toque e o som sai em todos os celulares da sala.</P>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {BUILTIN_SOUNDS.map((s) => (
              <Chip key={s.key} label={`${s.emoji} ${s.nome}`} onPress={() => fire(`b:${s.key}`)} color={palette.sun} />
            ))}
            {sons.map((s) => (
              <Chip key={s.id} label={`📁 ${s.title}`} onPress={() => fire(`u:${s.storage_path}`)} color={palette.mint} />
            ))}
          </View>
          <ErrorText>{err}</ErrorText>
        </Card>
      ) : null}
    </View>
  );
}

/** Configuração da trilha (no lobby). Só o anfitrião muda; os outros veem. */
export function TrilhaSettings({ view, save, isHost, me, nickname }) {
  const t = useTheme();
  const trilha = normalizeTrilha(view.trilha);
  const { sons, reload } = useLoboSons();
  const [editing, setEditing] = useState(null); // cena aberta
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const setTrilha = (next) => save({ ...view, trilha: normalizeTrilha({ ...trilha, ...next }) });
  const choose = (scene, ref) => {
    setTrilha({ cenas: { ...trilha.cenas, [scene]: ref } });
    setEditing(null);
  };

  const upload = async () => {
    setErr('');
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      setBusy(true);
      const f = res.assets[0];
      const saved = await uploadLoboSom({ file: f, title: f.name, userId: me, nickname });
      await reload();
      if (editing) choose(editing, `u:${saved.storage_path}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <H2>🎵 Trilha sonora</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {TRILHA_MODES.map((m) => (
          <Chip
            key={m.key}
            label={`${m.emoji} ${m.nome}`}
            active={trilha.modo === m.key}
            disabled={!isHost}
            onPress={() => setTrilha({ modo: m.key })}
          />
        ))}
      </View>
      <P muted style={{ fontSize: 13 }}>
        {trilha.modo === 'padrao' && 'Cada fase tem seu som: noite, dia, votação, morte e vitória.'}
        {trilha.modo === 'escolho' && 'Toque numa cena para escolher o som (embutido ou enviado por vocês).'}
        {trilha.modo === 'ia' && 'O Sussurro escolhe o clima de cada fase junto com a narração.'}
        {trilha.modo === 'desligada' && 'Sem música de fundo (a mesa de efeitos continua funcionando).'}
      </P>
      {trilha.modo === 'escolho' ? (
        <View style={{ marginTop: 8 }}>
          {SCENES.map((sc) => {
            const ref = soundForScene(sc.key, trilha);
            return (
              <View key={sc.key}>
                <Pressable
                  disabled={!isHost}
                  onPress={() => setEditing(editing === sc.key ? null : sc.key)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8 }}
                >
                  <Text style={{ fontSize: 18 }}>{sc.emoji}</Text>
                  <Text style={{ flex: 1, color: t.text, fontWeight: '700' }}>{sc.nome}</Text>
                  <Text style={{ color: t.muted, fontSize: 13, maxWidth: '50%' }} numberOfLines={1}>
                    {refLabel(ref, sons)}
                  </Text>
                </Pressable>
                {editing === sc.key ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                    <Chip label="🔇 Silêncio" active={ref === ''} onPress={() => choose(sc.key, '')} />
                    {BUILTIN_SOUNDS.map((s) => (
                      <Chip key={s.key} label={`${s.emoji} ${s.nome}`} active={ref === `b:${s.key}`} onPress={() => choose(sc.key, `b:${s.key}`)} />
                    ))}
                    {sons.map((s) => (
                      <Chip
                        key={s.id}
                        label={`📁 ${s.title}`}
                        color={palette.mint}
                        active={ref === `u:${s.storage_path}`}
                        onPress={() => choose(sc.key, `u:${s.storage_path}`)}
                      />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {isHost ? (
        <Btn small variant="outline" color={palette.mint} title="⬆️ Enviar um som (mp3/m4a)" onPress={upload} loading={busy} />
      ) : null}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}
