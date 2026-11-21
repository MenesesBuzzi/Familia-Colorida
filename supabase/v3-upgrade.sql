-- =====================================================================
-- Família Colorida v3 — ATUALIZAÇÃO (só o que é novo na v3)
-- Para quem já rodou o schema.sql da v2: cole TUDO no SQL Editor do Supabase e clique em "Run".
-- É idempotente (pode rodar quantas vezes quiser) e não apaga nada da v1/v2.
-- (O supabase/schema.sql completo já inclui este mesmo bloco no final.)
--
-- Novidades:
--   • Rádio: Biblioteca de MP3 (bucket "radio"), fila com votos por rádio, play/pause/pular do dono,
--            walkie-talkie (bucket "voz") e "passar o microfone".
--   • Lobisomem: sons enviados para a trilha (bucket "lobo-sons").
--   • Chat: sala Família, salas por código, conversa privada, mensagens de voz e "não lidas".
-- =====================================================================

-- Garantia: funções da v2 que este bloco usa (iguais às da v2; recriar não muda nada)
create or replace function public.my_avatar()
returns text language sql stable security definer set search_path = public
as $$ select avatar_url from profiles where id = auth.uid(); $$;

create or replace function public.is_radio_member(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from radio_members where room_id = r and user_id = auth.uid()); $$;

create or replace function public.is_radio_owner(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from radio_rooms where id = r and owner_id = auth.uid()); $$;

-- =====================================================================
-- v3: STORAGE (buckets criados automaticamente)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('radio', 'radio', true, 20971520)          -- MP3 da Biblioteca (20 MB cada)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('voz', 'voz', false, 3145728)              -- walkie-talkie e mensagens de voz (3 MB)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('lobo-sons', 'lobo-sons', true, 5242880)   -- sons enviados para a trilha do Lobisomem (5 MB)
on conflict (id) do nothing;

-- Cada pessoa só envia/apaga arquivos dentro da própria pasta: <seu-id>/...
drop policy if exists fc_storage_insert_own on storage.objects;
create policy fc_storage_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id in ('radio', 'voz', 'lobo-sons')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists fc_storage_update_own on storage.objects;
create policy fc_storage_update_own on storage.objects
  for update to authenticated using (
    bucket_id in ('radio', 'voz', 'lobo-sons') and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id in ('radio', 'voz', 'lobo-sons') and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists fc_storage_delete_own on storage.objects;
create policy fc_storage_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id in ('radio', 'voz', 'lobo-sons') and (storage.foldername(name))[1] = auth.uid()::text
  );
-- Ler: qualquer pessoa logada (os buckets "radio" e "lobo-sons" também são públicos para tocar por URL;
-- o "voz" é privado e o app usa links assinados).
drop policy if exists fc_storage_select on storage.objects;
create policy fc_storage_select on storage.objects
  for select to authenticated using (bucket_id in ('radio', 'voz', 'lobo-sons'));

-- =====================================================================
-- v3: RÁDIO — Biblioteca compartilhada (tipo Google Drive)
-- =====================================================================
create table if not exists public.radio_library (
  id            bigint generated always as identity primary key,
  title         text not null check (char_length(title) between 1 and 120),
  artist        text check (artist is null or char_length(artist) <= 120),
  uploader_id   uuid references auth.users(id) on delete set null,
  uploader_name text,
  duration_sec  double precision check (duration_sec is null or duration_sec >= 0),
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  storage_path  text not null unique check (char_length(storage_path) between 3 and 300),
  created_at    timestamptz not null default now()
);
create index if not exists radio_library_created_idx on public.radio_library (created_at desc);
alter table public.radio_library enable row level security;

drop policy if exists radio_library_select on public.radio_library;
create policy radio_library_select on public.radio_library
  for select to authenticated using (true);
drop policy if exists radio_library_insert on public.radio_library;
create policy radio_library_insert on public.radio_library
  for insert to authenticated with check (
    uploader_id = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text
  );
drop policy if exists radio_library_update on public.radio_library;
create policy radio_library_update on public.radio_library
  for update to authenticated using (uploader_id = auth.uid()) with check (uploader_id = auth.uid());
drop policy if exists radio_library_delete on public.radio_library;
create policy radio_library_delete on public.radio_library
  for delete to authenticated using (uploader_id = auth.uid());

-- Estado do "tocando agora" de cada rádio (só o dono muda, pela RPC radio_control)
alter table public.radio_rooms add column if not exists now_track_id bigint references public.radio_library(id) on delete set null;
alter table public.radio_rooms add column if not exists now_title text;
alter table public.radio_rooms add column if not exists now_artist text;
alter table public.radio_rooms add column if not exists now_path text;
alter table public.radio_rooms add column if not exists now_duration double precision;
alter table public.radio_rooms add column if not exists now_playing boolean not null default false;
alter table public.radio_rooms add column if not exists now_offset double precision not null default 0;
alter table public.radio_rooms add column if not exists now_updated_at timestamptz;
alter table public.radio_rooms add column if not exists recent_tracks bigint[] not null default '{}';

-- Microfone do walkie-talkie (o dono passa para quem quiser)
alter table public.radio_members add column if not exists can_talk boolean not null default false;

-- Fila de cada rádio (músicas da Biblioteca) + votos
create table if not exists public.radio_queue (
  id            bigint generated always as identity primary key,
  room_id       uuid not null references public.radio_rooms(id) on delete cascade,
  track_id      bigint not null references public.radio_library(id) on delete cascade,
  added_by      uuid references auth.users(id) on delete set null,
  added_by_name text,
  created_at    timestamptz not null default now(),
  unique (room_id, track_id)
);
create index if not exists radio_queue_room_idx on public.radio_queue (room_id);

create table if not exists public.radio_queue_votes (
  queue_id   bigint not null references public.radio_queue(id) on delete cascade,
  room_id    uuid not null references public.radio_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  value      smallint not null default 0 check (value in (-1, 0, 1)),
  updated_at timestamptz not null default now(),
  primary key (queue_id, user_id)
);
create index if not exists radio_queue_votes_room_idx on public.radio_queue_votes (room_id);

alter table public.radio_queue       enable row level security;
alter table public.radio_queue_votes enable row level security;

drop policy if exists radio_queue_select on public.radio_queue;
create policy radio_queue_select on public.radio_queue
  for select to authenticated using (public.is_radio_member(room_id));
drop policy if exists radio_queue_insert on public.radio_queue;
create policy radio_queue_insert on public.radio_queue
  for insert to authenticated with check (added_by = auth.uid() and public.is_radio_member(room_id));
drop policy if exists radio_queue_delete on public.radio_queue;
create policy radio_queue_delete on public.radio_queue
  for delete to authenticated using (added_by = auth.uid() or public.is_radio_owner(room_id));

drop policy if exists radio_queue_votes_select on public.radio_queue_votes;
create policy radio_queue_votes_select on public.radio_queue_votes
  for select to authenticated using (public.is_radio_member(room_id));
drop policy if exists radio_queue_votes_insert on public.radio_queue_votes;
create policy radio_queue_votes_insert on public.radio_queue_votes
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_radio_member(room_id)
    and exists (select 1 from radio_queue q where q.id = queue_id and q.room_id = radio_queue_votes.room_id)
  );
drop policy if exists radio_queue_votes_update on public.radio_queue_votes;
create policy radio_queue_votes_update on public.radio_queue_votes
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and public.is_radio_member(room_id)
    and exists (select 1 from radio_queue q where q.id = queue_id and q.room_id = radio_queue_votes.room_id)
  );

-- Walkie-talkie: falas curtas gravadas pelo dono (ou por quem está com o microfone)
create table if not exists public.radio_voice (
  id           bigint generated always as identity primary key,
  room_id      uuid not null references public.radio_rooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  nickname     text not null default 'Jogador',
  storage_path text not null check (char_length(storage_path) between 3 and 300),
  duration_ms  int check (duration_ms is null or duration_ms between 0 and 120000),
  created_at   timestamptz not null default now()
);
create index if not exists radio_voice_room_idx on public.radio_voice (room_id, id);
alter table public.radio_voice enable row level security;

create or replace function public.radio_can_talk(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_radio_owner(r)
      or exists (select 1 from radio_members where room_id = r and user_id = auth.uid() and can_talk);
$$;

drop policy if exists radio_voice_select on public.radio_voice;
create policy radio_voice_select on public.radio_voice
  for select to authenticated using (public.is_radio_member(room_id));
drop policy if exists radio_voice_insert on public.radio_voice;
create policy radio_voice_insert on public.radio_voice
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.radio_can_talk(room_id)
    and split_part(storage_path, '/', 1) = auth.uid()::text
  );
drop policy if exists radio_voice_delete on public.radio_voice;
create policy radio_voice_delete on public.radio_voice
  for delete to authenticated using (user_id = auth.uid() or public.is_radio_owner(room_id));

-- RPC: coloca uma música da Biblioteca na fila (repetida -> null)
create or replace function public.add_radio_queue(p_room uuid, p_track bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
  v_nick text;
begin
  if not public.is_radio_member(p_room) then raise exception 'Você não é desta rádio'; end if;
  if not exists (select 1 from radio_library where id = p_track) then raise exception 'Música não encontrada'; end if;
  select nickname into v_nick from radio_members where room_id = p_room and user_id = auth.uid();
  insert into radio_queue (room_id, track_id, added_by, added_by_name)
  values (p_room, p_track, auth.uid(), v_nick)
  on conflict (room_id, track_id) do nothing
  returning id into v_id;
  if v_id is not null then
    insert into radio_queue_votes (queue_id, room_id, user_id, value)
    values (v_id, p_room, auth.uid(), 1)
    on conflict (queue_id, user_id) do nothing;
  end if;
  return v_id;
end;
$$;

-- RPC: controle do dono. p_action: 'play' | 'pause' | 'seek' | 'queue' (toca item da fila) | 'track' (toca da Biblioteca) | 'stop'
create or replace function public.radio_control(
  p_room uuid, p_action text, p_offset double precision default 0, p_queue bigint default null, p_track bigint default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_track bigint;
  t radio_library;
begin
  if not public.is_radio_owner(p_room) then raise exception 'Só quem criou a rádio controla a música'; end if;
  if p_action in ('play', 'pause', 'seek') then
    update radio_rooms set
      now_playing = case when p_action = 'play' then true when p_action = 'pause' then false else now_playing end,
      now_offset = greatest(0, coalesce(p_offset, 0)),
      now_updated_at = now()
    where id = p_room and now_track_id is not null;
    return;
  end if;
  if p_action = 'stop' then
    update radio_rooms set now_track_id = null, now_title = null, now_artist = null, now_path = null,
      now_duration = null, now_playing = false, now_offset = 0, now_updated_at = now()
    where id = p_room;
    return;
  end if;
  if p_action = 'queue' then
    select track_id into v_track from radio_queue where id = p_queue and room_id = p_room;
    if v_track is null then raise exception 'Essa música não está mais na fila'; end if;
    delete from radio_queue where id = p_queue;
  elsif p_action = 'track' then
    v_track := p_track;
  else
    raise exception 'Ação inválida';
  end if;
  select * into t from radio_library where id = v_track;
  if not found then raise exception 'Música não encontrada'; end if;
  update radio_rooms set now_track_id = t.id, now_title = t.title, now_artist = t.artist, now_path = t.storage_path,
    now_duration = t.duration_sec, now_playing = true, now_offset = 0, now_updated_at = now(),
    recent_tracks = (array_prepend(t.id, coalesce(recent_tracks, '{}')))[1:10]
  where id = p_room;
end;
$$;

-- RPC: passar / tirar o microfone (só o dono)
create or replace function public.set_radio_mic(p_room uuid, p_user uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_radio_owner(p_room) then raise exception 'Só quem criou a rádio passa o microfone'; end if;
  update radio_members set can_talk = coalesce(p_on, false) where room_id = p_room and user_id = p_user;
end;
$$;

-- Guarda a duração descoberta pelo player (o primeiro que tocar a música preenche)
create or replace function public.set_radio_duration(p_track bigint, p_sec double precision)
returns void
language sql security definer set search_path = public
as $$
  update radio_library set duration_sec = p_sec
  where id = p_track and duration_sec is null and p_sec > 0 and p_sec < 36000;
$$;

grant execute on function public.add_radio_queue(uuid, bigint) to authenticated;
grant execute on function public.radio_control(uuid, text, double precision, bigint, bigint) to authenticated;
grant execute on function public.set_radio_mic(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_radio_duration(bigint, double precision) to authenticated;

-- =====================================================================
-- v3: LOBISOMEM — sons enviados para a trilha (bucket "lobo-sons")
-- =====================================================================
create table if not exists public.lobo_sons (
  id            bigint generated always as identity primary key,
  title         text not null check (char_length(title) between 1 and 80),
  uploader_id   uuid references auth.users(id) on delete set null,
  uploader_name text,
  storage_path  text not null unique check (char_length(storage_path) between 3 and 300),
  created_at    timestamptz not null default now()
);
alter table public.lobo_sons enable row level security;
drop policy if exists lobo_sons_select on public.lobo_sons;
create policy lobo_sons_select on public.lobo_sons
  for select to authenticated using (true);
drop policy if exists lobo_sons_insert on public.lobo_sons;
create policy lobo_sons_insert on public.lobo_sons
  for insert to authenticated with check (
    uploader_id = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text
  );
drop policy if exists lobo_sons_delete on public.lobo_sons;
create policy lobo_sons_delete on public.lobo_sons
  for delete to authenticated using (uploader_id = auth.uid());

-- =====================================================================
-- v3: CHAT — sala Família, salas por código, conversa privada, voz
-- =====================================================================
create table if not exists public.chat_rooms (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'grupo' check (kind in ('familia', 'grupo', 'dm')),
  code       text unique,
  name       text check (name is null or char_length(name) between 1 and 60),
  owner_id   uuid references auth.users(id) on delete set null,
  dm_key     text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  room_id    uuid not null references public.chat_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  nickname   text not null default 'Jogador',
  avatar_url text,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);

create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references public.chat_rooms(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nickname    text not null default 'Jogador',
  avatar_url  text,
  kind        text not null default 'texto' check (kind in ('texto', 'voz')),
  body        text not null default '' check (char_length(body) <= 1000),
  audio_path  text check (audio_path is null or char_length(audio_path) between 3 and 300),
  audio_ms    int check (audio_ms is null or audio_ms between 0 and 300000),
  created_at  timestamptz not null default now(),
  check ((kind = 'texto' and char_length(body) >= 1) or (kind = 'voz' and audio_path is not null))
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id, id);

-- Marcador de leitura: até qual mensagem cada pessoa já leu em cada sala
create table if not exists public.chat_reads (
  room_id      uuid not null references public.chat_rooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_id bigint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.chat_rooms    enable row level security;
alter table public.chat_members  enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads    enable row level security;

-- A sala "Família" (todo mundo logado participa)
insert into public.chat_rooms (id, kind, name)
values ('00000000-0000-0000-0000-00000000fa01', 'familia', 'Família')
on conflict (id) do nothing;

create or replace function public.is_chat_member(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from chat_rooms where id = r and kind = 'familia')
    or exists (select 1 from chat_members where room_id = r and user_id = auth.uid())
  );
$$;

drop policy if exists chat_rooms_select on public.chat_rooms;
create policy chat_rooms_select on public.chat_rooms
  for select to authenticated using (public.is_chat_member(id));
drop policy if exists chat_rooms_update on public.chat_rooms;
create policy chat_rooms_update on public.chat_rooms
  for update to authenticated using (owner_id = auth.uid() and kind = 'grupo') with check (owner_id = auth.uid() and kind = 'grupo');
drop policy if exists chat_rooms_delete on public.chat_rooms;
create policy chat_rooms_delete on public.chat_rooms
  for delete to authenticated using (owner_id = auth.uid() and kind = 'grupo');

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members
  for select to authenticated using (public.is_chat_member(room_id));
drop policy if exists chat_members_delete on public.chat_members;
create policy chat_members_delete on public.chat_members
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from chat_rooms r where r.id = room_id and r.owner_id = auth.uid() and r.kind = 'grupo')
  );

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated using (public.is_chat_member(room_id));
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_chat_member(room_id)
    and (audio_path is null or split_part(audio_path, '/', 1) = auth.uid()::text)
  );
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete on public.chat_messages
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists chat_reads_select on public.chat_reads;
create policy chat_reads_select on public.chat_reads
  for select to authenticated using (user_id = auth.uid());
drop policy if exists chat_reads_insert on public.chat_reads;
create policy chat_reads_insert on public.chat_reads
  for insert to authenticated with check (user_id = auth.uid() and public.is_chat_member(room_id));
drop policy if exists chat_reads_update on public.chat_reads;
create policy chat_reads_update on public.chat_reads
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- RPC: criar sala com código
create or replace function public.create_chat_room(p_name text, p_nickname text)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  loop
    v_code := gen_room_code();
    exit when not exists (select 1 from chat_rooms where code = v_code);
  end loop;
  insert into chat_rooms (kind, code, name, owner_id)
  values ('grupo', v_code, left(coalesce(nullif(trim(p_name), ''), 'Sala'), 60), auth.uid())
  returning id into v_id;
  insert into chat_members (room_id, user_id, nickname, avatar_url)
  values (v_id, auth.uid(), left(coalesce(nullif(trim(p_nickname), ''), 'Jogador'), 30), public.my_avatar());
  return json_build_object('id', v_id, 'code', v_code);
end;
$$;

-- RPC: entrar numa sala pelo código
create or replace function public.join_chat_room(p_code text, p_nickname text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  r chat_rooms;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into r from chat_rooms where code = upper(trim(p_code)) and kind = 'grupo';
  if not found then raise exception 'Código não encontrado'; end if;
  if (select count(*) from chat_members where room_id = r.id) >= 100
     and not exists (select 1 from chat_members where room_id = r.id and user_id = auth.uid()) then
    raise exception 'Sala cheia (máx. 100)';
  end if;
  insert into chat_members (room_id, user_id, nickname, avatar_url)
  values (r.id, auth.uid(), left(coalesce(nullif(trim(p_nickname), ''), 'Jogador'), 30), public.my_avatar())
  on conflict (room_id, user_id) do update set nickname = excluded.nickname, avatar_url = excluded.avatar_url;
  return r.id;
end;
$$;

-- RPC: abre (ou cria) a conversa privada com outra pessoa
create or replace function public.open_dm(p_other uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_key text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_other is null or p_other = auth.uid() then raise exception 'Escolha outra pessoa'; end if;
  if not exists (select 1 from auth.users where id = p_other) then raise exception 'Pessoa não encontrada'; end if;
  v_key := case when auth.uid()::text < p_other::text
                then auth.uid()::text || ':' || p_other::text
                else p_other::text || ':' || auth.uid()::text end;
  insert into chat_rooms (kind, dm_key) values ('dm', v_key) on conflict (dm_key) do nothing;
  select id into v_id from chat_rooms where dm_key = v_key;
  insert into chat_members (room_id, user_id, nickname, avatar_url)
  select v_id, p.id, left(coalesce(p.nickname, 'Jogador'), 30), p.avatar_url
  from profiles p where p.id in (auth.uid(), p_other)
  on conflict (room_id, user_id) do nothing;
  -- quem ainda não tem perfil (raro) entra mesmo assim
  insert into chat_members (room_id, user_id) values (v_id, auth.uid()), (v_id, p_other)
  on conflict (room_id, user_id) do nothing;
  return v_id;
end;
$$;

-- RPC: marca como lido até p_last (nunca volta para trás)
create or replace function public.mark_chat_read(p_room uuid, p_last bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_chat_member(p_room) then return; end if;
  insert into chat_reads (room_id, user_id, last_read_id, updated_at)
  values (p_room, auth.uid(), greatest(coalesce(p_last, 0), 0), now())
  on conflict (room_id, user_id) do update
    set last_read_id = greatest(chat_reads.last_read_id, excluded.last_read_id), updated_at = now();
end;
$$;

-- RPC: minhas conversas com prévia e contador de não lidas.
-- Na sala Família, quem nunca abriu só conta as mensagens dos últimos 3 dias.
create or replace function public.my_chat_rooms()
returns table (
  id uuid, kind text, name text, code text, owner_id uuid, created_at timestamptz,
  other_id uuid, other_name text, other_avatar text,
  last_id bigint, last_body text, last_kind text, last_at timestamptz, last_name text,
  unread int
)
language sql stable security definer set search_path = public
as $$
  select r.id, r.kind, r.name, r.code, r.owner_id, r.created_at,
         o.user_id, coalesce(op.nickname, o.nickname), coalesce(op.avatar_url, o.avatar_url),
         lm.id, lm.body, lm.kind, lm.created_at, lm.nickname,
         (select count(*)::int from chat_messages m
           where m.room_id = r.id and m.user_id <> auth.uid()
             and m.id > coalesce(rd.last_read_id, 0)
             and (rd.last_read_id is not null or r.kind <> 'familia' or m.created_at > now() - interval '3 days'))
  from chat_rooms r
  left join chat_reads rd on rd.room_id = r.id and rd.user_id = auth.uid()
  left join lateral (
    select cm.user_id, cm.nickname, cm.avatar_url from chat_members cm
    where r.kind = 'dm' and cm.room_id = r.id and cm.user_id <> auth.uid() limit 1
  ) o on true
  left join profiles op on op.id = o.user_id
  left join lateral (
    select m.id, m.body, m.kind, m.created_at, m.nickname from chat_messages m
    where m.room_id = r.id order by m.id desc limit 1
  ) lm on true
  where auth.uid() is not null
    and (r.kind = 'familia' or exists (select 1 from chat_members x where x.room_id = r.id and x.user_id = auth.uid()));
$$;

grant execute on function public.create_chat_room(text, text) to authenticated;
grant execute on function public.join_chat_room(text, text) to authenticated;
grant execute on function public.open_dm(uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid, bigint) to authenticated;
grant execute on function public.my_chat_rooms() to authenticated;

-- =====================================================================
-- v3: REALTIME
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'radio_rooms', 'radio_members', 'radio_library', 'radio_queue', 'radio_queue_votes', 'radio_voice',
    'lobo_sons', 'chat_rooms', 'chat_members', 'chat_messages'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
