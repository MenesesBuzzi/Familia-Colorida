import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { errorMessage, supabase } from '../../lib/supabase';
import { ROLES } from '../../lib/werewolf/logic';
import { Btn, Card, Countdown, ErrorText, Field, H1, H2, P, useTheme } from '../ui';
import { Feed, PlayerPicker, PlayersStrip, RoleCard } from './parts';
import { palette } from '../../theme';

const PHASE_TITLE = {
  noite: '🌙 Noite',
  bruxa: '🧪 A bruxa acordou',
  cacador: '🏹 A última flecha',
  dia: '☀️ Dia',
  votacao: '🗳️ Votação',
};

export default function Game({ ww, me, isHost, forceAdvance, roomId }) {
  const { room, players, roles, actions, privates, feed, whispers } = ww;
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);

  const myRole = roles.find((r) => r.user_id === me);
  const role = myRole?.role;
  const amWolf = role === 'lobisomem';
  const wolfIds = amWolf ? roles.filter((r) => r.role === 'lobisomem').map((r) => r.user_id) : [];
  const nameOf = (id) => players.find((p) => p.user_id === id)?.nickname || '???';
  const mePlayer = players.find((p) => p.user_id === me);
  const alive = !!mePlayer?.alive;
  const living = players.filter((p) => p.alive);
  const myAct = (step) => actions.find((a) => a.user_id === me && a.step === step);
  const progress = room.state?.progress;

  const submit = async (step, kind, target = null) => {
    setSending(true);
    setErr('');
    const { error } = await supabase
      .from('ww_actions')
      .upsert(
        { room_id: roomId, round: room.round, step, user_id: me, kind, target },
        { onConflict: 'room_id,round,step,user_id' }
      );
    setSending(false);
    if (error) setErr(errorMessage(error));
    else ww.reload();
  };

  let body = null;
  const phase = room.phase;

  if (phase === 'noite') {
    body = alive ? (
      <NightPanel
        role={role}
        me={me}
        living={living}
        wolfIds={wolfIds}
        actions={actions}
        myAct={myAct('noite')}
        privates={privates.filter((p) => p.kind === 'vidente' && p.round === room.round)}
        nameOf={nameOf}
        submit={submit}
        sending={sending}
      />
    ) : (
      <Sleeping text="Os vivos dormem... e você observa do além." />
    );
  } else if (phase === 'bruxa') {
    const info = privates.find((p) => p.kind === 'bruxa' && p.round === room.round);
    body =
      alive && role === 'bruxa' && info ? (
        <WitchPanel info={info.payload} me={me} living={living} myAct={myAct('bruxa')} submit={submit} sending={sending} />
      ) : (
        <Sleeping text="Um caldeirão borbulha em algum lugar da vila..." />
      );
  } else if (phase === 'cacador') {
    const hunterId = room.state?.cacador?.userId;
    body =
      hunterId === me ? (
        <HunterPanel me={me} living={living} myAct={myAct('cacador')} submit={submit} sending={sending} />
      ) : (
        <Sleeping text={`🏹 ${nameOf(hunterId)} era o Caçador e prepara a última flecha...`} />
      );
  } else if (phase === 'dia') {
    body = (
      <View>
        <Card color={palette.orange}>
          <P center muted>
            Discutam! Quem parece lobisomem?
          </P>
          <Countdown until={room.state?.timerEnd} />
          {isHost && <Btn title="Ir para a votação agora" color={palette.coral} onPress={forceAdvance} />}
        </Card>
        <Feed items={feed} round={room.round} title="O que aconteceu" />
      </View>
    );
  } else if (phase === 'votacao') {
    body = alive ? (
      <VotePanel me={me} living={living} myAct={myAct('voto')} submit={submit} sending={sending} />
    ) : (
      <Sleeping text="Os vivos estão votando. Fantasmas não votam." />
    );
  }

  const isNight = ['noite', 'bruxa', 'cacador'].includes(phase);

  return (
    <View>
      <H1 style={{ textAlign: 'center' }}>
        {PHASE_TITLE[phase] || phase} {isNight || phase === 'dia' ? room.round : ''}
      </H1>
      {!alive && (
        <Card color="#B8C0FF">
          <P center style={{ fontWeight: '800' }}>
            👻 Você é um fantasma
          </P>
        </Card>
      )}

      <RoleCard role={role} wolfMates={wolfIds.filter((id) => id !== me).map(nameOf)} />

      <ErrorText>{err}</ErrorText>
      {body}

      {progress && ['noite', 'votacao'].includes(phase) ? (
        <P muted center style={{ marginTop: 8 }}>
          {progress.feitos} de {progress.total} já {phase === 'votacao' ? 'votaram' : 'agiram'}
        </P>
      ) : null}

      {!alive && <GhostPanel whispers={whispers} room={room} me={me} roomId={roomId} />}

      {isHost && <HostControls phase={phase} forceAdvance={forceAdvance} />}

      <H2 style={{ marginTop: 12 }}>Moradores</H2>
      <PlayersStrip players={players} me={me} />

      {phase !== 'dia' && <Feed items={feed} title="Mural da vila" />}
      {phase === 'dia' && <Feed items={feed.filter((f) => f.round !== room.round)} title="Rodadas anteriores" />}
    </View>
  );
}

function Sleeping({ text }) {
  return (
    <Card>
      <Text style={{ fontSize: 50, textAlign: 'center' }}>😴</Text>
      <P center muted>
        {text}
      </P>
    </Card>
  );
}

// ------------------------------------------------------------------
function NightPanel({ role, me, living, wolfIds, actions, myAct, privates, nameOf, submit, sending }) {
  const [sel, setSel] = useState(myAct?.target || null);
  const done = !!myAct;

  if (role === 'lobisomem') {
    const targets = living.filter((p) => !wolfIds.includes(p.user_id));
    const wolfVotes = actions.filter((a) => a.step === 'noite' && a.kind === 'matar' && wolfIds.includes(a.user_id));
    const votesFor = (id) => wolfVotes.filter((v) => v.target === id).map((v) => nameOf(v.user_id));
    return (
      <Card color={ROLES.lobisomem.cor}>
        <H2>🐺 Escolham a vítima</H2>
        <P muted style={{ marginBottom: 8 }}>
          Combinem com a matilha (os votos de vocês aparecem aqui). Empate é decidido no sorteio.
        </P>
        <PlayerPicker
          players={targets}
          selected={sel}
          onPick={setSel}
          color={ROLES.lobisomem.cor}
          note={(p) => (votesFor(p.user_id).length ? `🐾 ${votesFor(p.user_id).join(', ')}` : '')}
        />
        <Btn title={done ? 'Mudar voto' : 'Atacar 🐾'} color={ROLES.lobisomem.cor} disabled={!sel} loading={sending} onPress={() => submit('noite', 'matar', sel)} />
        {done && <P muted center>Voto registrado: {nameOf(myAct.target)}</P>}
      </Card>
    );
  }

  if (role === 'vidente') {
    const result = privates[0]?.payload;
    return (
      <Card color={ROLES.vidente.cor}>
        <H2>🔮 Quem você quer investigar?</H2>
        {result ? (
          <View style={{ alignItems: 'center', padding: 10 }}>
            <Text style={{ fontSize: 48 }}>{ROLES[result.papel]?.emoji}</Text>
            <P center style={{ fontSize: 18, fontWeight: '800' }}>
              {result.nome} é {ROLES[result.papel]?.nome || result.papel}!
            </P>
            <P muted center>Guarde segredo... ou use com sabedoria.</P>
          </View>
        ) : done ? (
          <P muted center>A bola de cristal está girando...</P>
        ) : (
          <>
            <PlayerPicker players={living.filter((p) => p.user_id !== me)} selected={sel} onPick={setSel} color={ROLES.vidente.cor} />
            <Btn title="Ver papel" color={ROLES.vidente.cor} disabled={!sel} loading={sending} onPress={() => submit('noite', 'ver', sel)} />
          </>
        )}
      </Card>
    );
  }

  if (role === 'medico') {
    return (
      <Card color={ROLES.medico.cor}>
        <H2>🩺 Quem você vai proteger esta noite?</H2>
        <PlayerPicker players={living} selected={sel} onPick={setSel} color={ROLES.medico.cor} />
        <Btn title={done ? 'Mudar proteção' : 'Proteger'} color={ROLES.medico.cor} disabled={!sel} loading={sending} onPress={() => submit('noite', 'proteger', sel)} />
        {done && <P muted center>Protegendo: {nameOf(myAct.target)}</P>}
      </Card>
    );
  }

  // Aldeão, Caçador e Bruxa (a bruxa age depois): todos "tocam" no celular para disfarçar
  return (
    <Card>
      <Text style={{ fontSize: 50, textAlign: 'center' }}>🌙</Text>
      <P center>{role === 'bruxa' ? 'Espere: você será acordada depois dos lobos.' : 'Você dorme. Sonhe com a vila em paz...'}</P>
      {done ? (
        <P muted center>Zzz... aguardando o amanhecer.</P>
      ) : (
        <Btn title="Dormir 😴" color={palette.sky} loading={sending} onPress={() => submit('noite', 'dormir')} />
      )}
    </Card>
  );
}

function WitchPanel({ info, me, living, myAct, submit, sending }) {
  const [cura, setCura] = useState(false);
  const [veneno, setVeneno] = useState(null);
  if (myAct) {
    return (
      <Card color={ROLES.bruxa.cor}>
        <P center>Decisão tomada. O caldeirão esfria... 🧪</P>
      </Card>
    );
  }
  const kind = cura && veneno ? 'curar_envenenar' : cura ? 'curar' : veneno ? 'envenenar' : 'nada';
  return (
    <Card color={ROLES.bruxa.cor}>
      <H2>🧪 Suas poções</H2>
      <P style={{ marginBottom: 10 }}>
        {info.victimName ? `Os lobos atacaram ${info.victimName}.` : 'Os lobos não atacaram ninguém esta noite.'}
      </P>
      {info.cura && info.victimId ? (
        <Btn
          title={cura ? '✅ Vai curar ' + info.victimName : `Usar cura em ${info.victimName}`}
          color={palette.leaf}
          variant={cura ? 'solid' : 'outline'}
          onPress={() => setCura((c) => !c)}
        />
      ) : (
        <P muted>{info.cura ? 'Nada para curar.' : 'Poção de cura já usada.'}</P>
      )}
      {info.veneno ? (
        <>
          <P style={{ marginTop: 10, fontWeight: '700' }}>Envenenar alguém? (opcional)</P>
          <PlayerPicker
            players={living.filter((p) => p.user_id !== me)}
            selected={veneno}
            onPick={(id) => setVeneno((v) => (v === id ? null : id))}
            color={palette.coral}
          />
        </>
      ) : (
        <P muted>Poção de veneno já usada.</P>
      )}
      <Btn title={kind === 'nada' ? 'Não fazer nada' : 'Confirmar'} color={ROLES.bruxa.cor} loading={sending} onPress={() => submit('bruxa', kind, veneno)} />
    </Card>
  );
}

function HunterPanel({ me, living, myAct, submit, sending }) {
  const [sel, setSel] = useState(null);
  if (myAct) return <Sleeping text="Flecha disparada!" />;
  return (
    <Card color={ROLES.cacador.cor}>
      <H2>🏹 Você caiu... mas leva alguém junto!</H2>
      <PlayerPicker players={living.filter((p) => p.user_id !== me)} selected={sel} onPick={setSel} color={ROLES.cacador.cor} />
      <Btn title="Atirar" color={ROLES.cacador.cor} disabled={!sel} loading={sending} onPress={() => submit('cacador', 'atirar', sel)} />
      <Btn title="Não atirar" variant="outline" color={ROLES.cacador.cor} onPress={() => submit('cacador', 'poupar')} />
    </Card>
  );
}

function VotePanel({ me, living, myAct, submit, sending }) {
  const [sel, setSel] = useState(myAct?.target || null);
  return (
    <Card color={palette.coral}>
      <H2>Quem deve deixar a vila?</H2>
      <PlayerPicker players={living.filter((p) => p.user_id !== me)} selected={sel} onPick={setSel} color={palette.coral} />
      <Btn title={myAct?.kind === 'votar' ? 'Mudar voto' : 'Votar'} color={palette.coral} disabled={!sel} loading={sending} onPress={() => submit('voto', 'votar', sel)} />
      <Btn title="Pular voto" variant="outline" color={palette.coral} onPress={() => submit('voto', 'pular')} />
      {myAct ? (
        <P muted center>
          {myAct.kind === 'pular'
            ? 'Você pulou.'
            : `Seu voto: ${living.find((p) => p.user_id === myAct.target)?.nickname || '?'}`}
        </P>
      ) : null}
      <P muted center style={{ fontSize: 13 }}>
        O voto é secreto até o fim. Empate = ninguém sai.
      </P>
    </Card>
  );
}

function GhostPanel({ whispers, room, me, roomId }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sentThisRound = whispers.some((w) => w.round === room.round);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('ww_whispers').insert({ room_id: roomId, round: room.round, user_id: me, body });
    setBusy(false);
    if (error) setErr(errorMessage(error));
    else setText('');
  };

  return (
    <Card color="#B8C0FF" style={{ marginTop: 10 }}>
      <H2>👻 Sussurrar para os vivos</H2>
      <P muted style={{ marginBottom: 8 }}>
        Uma vez por rodada. O Sussurro transforma sua mensagem numa pista misteriosa (sem nomes) no próximo amanhecer.
      </P>
      {sentThisRound ? (
        <P center style={{ color: t.muted }}>
          Seu sussurro desta rodada já foi enviado.
        </P>
      ) : (
        <>
          <Field placeholder="Ex.: desconfiem de quem falou primeiro" value={text} onChangeText={setText} maxLength={80} />
          <ErrorText>{err}</ErrorText>
          <Btn title="Sussurrar" color="#8E9BFF" loading={busy} onPress={send} />
        </>
      )}
      {whispers.map((w) => (
        <P key={w.id} muted style={{ fontSize: 13 }}>
          Rodada {w.round}: “{w.body}” {w.used ? '✓ entregue' : '⏳'}
        </P>
      ))}
    </Card>
  );
}

function HostControls({ phase, forceAdvance }) {
  const ask = () =>
    Alert.alert(
      'Forçar próxima fase?',
      'Use se alguém sumiu ou não quer agir. Quem não agiu fica sem ação nesta fase.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Forçar', style: 'destructive', onPress: forceAdvance },
      ]
    );
  if (phase === 'dia') return null;
  return (
    <Card style={{ marginTop: 10 }}>
      <P muted center style={{ fontSize: 13 }}>
        👑 Você é o anfitrião: a partida avança sozinha quando todos agirem.
      </P>
      <Btn small title="⏩ Forçar próxima fase" variant="outline" color={palette.orange} onPress={ask} />
    </Card>
  );
}
