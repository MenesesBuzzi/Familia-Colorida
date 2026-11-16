-- =====================================================================
-- Família Colorida — esquema do Supabase
-- Cole TUDO no SQL Editor do Supabase e clique em "Run".
-- Pode rodar de novo sem problema (é idempotente na maior parte).
-- Requer: Authentication > Sign In / Providers > "Allow anonymous sign-ins" LIGADO.
-- =====================================================================

-- gen_random_uuid() já vem no Postgres 13+ (Supabase usa 15+)

-- ---------------------------------------------------------------------
-- Utilitário: gera código de sala com 6 caracteres (sem 0/O/1/I)
-- ---------------------------------------------------------------------
create or replace function public.gen_room_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return result;
end;
$$;

-- =====================================================================
-- AMIGO SECRETO
-- =====================================================================

create table if not exists public.ss_groups (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null check (char_length(name) between 1 and 60),
  value_limit   text,
  exchange_date date,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'aberto' check (status in ('aberto', 'sorteado')),
  created_at    timestamptz not null default now()
);

create table if not exists public.ss_members (
  group_id  uuid not null references public.ss_groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  nickname  text not null check (char_length(nickname) between 1 and 30),
  wishlist  text not null default '' check (char_length(wishlist) <= 1000),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Resultado do sorteio. Cada pessoa só enxerga a PRÓPRIA linha (RLS).
create table if not exists public.ss_pairs (
  group_id    uuid not null references public.ss_groups(id) on delete cascade,
  giver_id    uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  primary key (group_id, giver_id)
);

-- Sala da Comunidade (chat do grupo)
create table if not exists public.ss_messages (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.ss_groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  nickname   text not null,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists ss_messages_group_idx on public.ss_messages (group_id, created_at);

-- Mensagens anônimas (sem SELECT direto; só via funções que escondem o remetente)
create table if not exists public.ss_anon_messages (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.ss_groups(id) on delete cascade,
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

alter table public.ss_groups        enable row level security;
alter table public.ss_members       enable row level security;
alter table public.ss_pairs         enable row level security;
alter table public.ss_messages      enable row level security;
alter table public.ss_anon_messages enable row level security;

create or replace function public.is_ss_member(g uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from ss_members where group_id = g and user_id = auth.uid());
$$;

-- ss_groups
drop policy if exists ss_groups_select on public.ss_groups;
create policy ss_groups_select on public.ss_groups
  for select to authenticated using (public.is_ss_member(id));
drop policy if exists ss_groups_delete on public.ss_groups;
create policy ss_groups_delete on public.ss_groups
  for delete to authenticated using (owner_id = auth.uid());

-- ss_members
drop policy if exists ss_members_select on public.ss_members;
create policy ss_members_select on public.ss_members
  for select to authenticated using (public.is_ss_member(group_id));
drop policy if exists ss_members_update on public.ss_members;
create policy ss_members_update on public.ss_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ss_members_delete on public.ss_members;
create policy ss_members_delete on public.ss_members
  for delete to authenticated using (
    user_id = auth.uid()
    and exists (select 1 from ss_groups g where g.id = group_id and g.status = 'aberto')
  );
-- só dá para editar apelido e lista de desejos
revoke update on public.ss_members from anon, authenticated;
grant update (wishlist, nickname) on public.ss_members to authenticated;

-- ss_pairs: cada um só vê quem ELE tirou
drop policy if exists ss_pairs_select_own on public.ss_pairs;
create policy ss_pairs_select_own on public.ss_pairs
  for select to authenticated using (giver_id = auth.uid());

-- ss_messages
drop policy if exists ss_messages_select on public.ss_messages;
create policy ss_messages_select on public.ss_messages
  for select to authenticated using (public.is_ss_member(group_id));
drop policy if exists ss_messages_insert on public.ss_messages;
create policy ss_messages_insert on public.ss_messages
  for insert to authenticated with check (user_id = auth.uid() and public.is_ss_member(group_id));

-- ss_anon_messages: nenhuma policy => ninguém lê/escreve direto (só pelas RPCs abaixo)

-- RPC: criar grupo
create or replace function public.create_ss_group(
  p_name text, p_value_limit text, p_exchange_date date, p_nickname text
) returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  loop
    v_code := gen_room_code();
    exit when not exists (select 1 from ss_groups where code = v_code);
  end loop;
  insert into ss_groups (code, name, value_limit, exchange_date, owner_id)
  values (v_code, trim(p_name), nullif(trim(coalesce(p_value_limit, '')), ''), p_exchange_date, auth.uid())
  returning id into v_id;
  insert into ss_members (group_id, user_id, nickname) values (v_id, auth.uid(), trim(p_nickname));
  return json_build_object('id', v_id, 'code', v_code);
end;
$$;

-- RPC: entrar com código
create or replace function public.join_ss_group(p_code text, p_nickname text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  g ss_groups;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into g from ss_groups where code = upper(trim(p_code));
  if not found then raise exception 'Código não encontrado'; end if;
  if g.status = 'sorteado' and not exists (
    select 1 from ss_members where group_id = g.id and user_id = auth.uid()
  ) then
    raise exception 'O sorteio deste grupo já foi feito';
  end if;
  insert into ss_members (group_id, user_id, nickname)
  values (g.id, auth.uid(), trim(p_nickname))
  on conflict (group_id, user_id) do update set nickname = excluded.nickname;
  return g.id;
end;
$$;

-- RPC: sorteio (só o organizador). Embaralha e forma um ciclo único:
-- ninguém tira a si mesmo e o resultado fica protegido por RLS.
create or replace function public.draw_ss_group(p_group uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  arr uuid[];
  n int;
  i int;
begin
  if not exists (select 1 from ss_groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Só o organizador pode fazer o sorteio';
  end if;
  select array_agg(user_id order by random()) into arr from ss_members where group_id = p_group;
  n := coalesce(array_length(arr, 1), 0);
  if n < 3 then raise exception 'São necessárias pelo menos 3 pessoas'; end if;

  delete from ss_pairs where group_id = p_group;
  delete from ss_anon_messages where group_id = p_group;
  for i in 1..n loop
    insert into ss_pairs (group_id, giver_id, receiver_id)
    values (p_group, arr[i], arr[(i % n) + 1]);
  end loop;
  update ss_groups set status = 'sorteado' where id = p_group;
end;
$$;

-- RPC: mensagem anônima. p_to = 'amigo' (quem eu tirei) ou 'oculto' (quem me tirou)
create or replace function public.send_ss_anon(p_group uuid, p_body text, p_to text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_to uuid;
begin
  if not public.is_ss_member(p_group) then raise exception 'Você não é deste grupo'; end if;
  if p_to = 'amigo' then
    select receiver_id into v_to from ss_pairs where group_id = p_group and giver_id = auth.uid();
  else
    select giver_id into v_to from ss_pairs where group_id = p_group and receiver_id = auth.uid();
  end if;
  if v_to is null then raise exception 'O sorteio ainda não foi feito'; end if;
  insert into ss_anon_messages (group_id, from_id, to_id, body) values (p_group, auth.uid(), v_to, trim(p_body));
end;
$$;

-- RPC: lê minhas mensagens anônimas sem revelar quem é o "oculto"
create or replace function public.get_ss_anon(p_group uuid)
returns table (id bigint, body text, created_at timestamptz, direction text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.body, m.created_at,
    case
      when m.from_id = auth.uid() and m.to_id = r.receiver_id then 'eu_para_amigo'
      when m.from_id = auth.uid() then 'eu_para_oculto'
      when m.to_id = auth.uid() and m.from_id = r.receiver_id then 'amigo_para_mim'
      else 'oculto_para_mim'
    end as direction
  from ss_anon_messages m
  left join ss_pairs r on r.group_id = p_group and r.giver_id = auth.uid()
  where m.group_id = p_group and (m.from_id = auth.uid() or m.to_id = auth.uid())
  order by m.created_at;
$$;

-- =====================================================================
-- LOBISOMEM
-- =====================================================================

create table if not exists public.ww_rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  host_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'lobby' check (status in ('lobby', 'jogando', 'fim')),
  phase      text not null default 'lobby',
  round      int  not null default 0,
  settings   jsonb not null default '{}'::jsonb,
  state      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ww_players (
  room_id       uuid not null references public.ww_rooms(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  nickname      text not null check (char_length(nickname) between 1 and 30),
  alive         boolean not null default true,
  revealed_role text,
  joined_at     timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Papéis secretos
create table if not exists public.ww_roles (
  room_id uuid not null references public.ww_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    text not null,
  data    jsonb not null default '{}'::jsonb,   -- ex.: poções da bruxa
  primary key (room_id, user_id)
);

-- Ações (noite, bruxa, caçador, voto). Uma por jogador por etapa por rodada.
create table if not exists public.ww_actions (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.ww_rooms(id) on delete cascade,
  round      int  not null,
  step       text not null check (step in ('noite', 'bruxa', 'cacador', 'voto')),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  target     uuid,
  created_at timestamptz not null default now(),
  unique (room_id, round, step, user_id)
);

-- Informações privadas enviadas pelo anfitrião (resultado da vidente, aviso pra bruxa)
create table if not exists public.ww_private (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.ww_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  round      int  not null,
  kind       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Sussurros dos fantasmas (texto cru: só o autor e o anfitrião enxergam)
create table if not exists public.ww_whispers (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.ww_rooms(id) on delete cascade,
  round      int  not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 80),
  used       boolean not null default false,
  created_at timestamptz not null default now()
);

-- Mural público (narração, pistas dos fantasmas, objetos falantes)
create table if not exists public.ww_feed (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.ww_rooms(id) on delete cascade,
  round      int  not null,
  kind       text not null,
  text       text not null,
  created_at timestamptz not null default now()
);

alter table public.ww_rooms    enable row level security;
alter table public.ww_players  enable row level security;
alter table public.ww_roles    enable row level security;
alter table public.ww_actions  enable row level security;
alter table public.ww_private  enable row level security;
alter table public.ww_whispers enable row level security;
alter table public.ww_feed     enable row level security;

create or replace function public.is_ww_member(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from ww_players where room_id = r and user_id = auth.uid()); $$;

create or replace function public.is_ww_host(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from ww_rooms where id = r and host_id = auth.uid()); $$;

create or replace function public.my_ww_role(r uuid)
returns text language sql stable security definer set search_path = public
as $$ select role from ww_roles where room_id = r and user_id = auth.uid(); $$;

create or replace function public.ww_room_status(r uuid)
returns text language sql stable security definer set search_path = public
as $$ select status from ww_rooms where id = r; $$;

-- ww_rooms
drop policy if exists ww_rooms_select on public.ww_rooms;
create policy ww_rooms_select on public.ww_rooms
  for select to authenticated using (public.is_ww_member(id) or host_id = auth.uid());
drop policy if exists ww_rooms_update on public.ww_rooms;
create policy ww_rooms_update on public.ww_rooms
  for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists ww_rooms_delete on public.ww_rooms;
create policy ww_rooms_delete on public.ww_rooms
  for delete to authenticated using (host_id = auth.uid());

-- ww_players
drop policy if exists ww_players_select on public.ww_players;
create policy ww_players_select on public.ww_players
  for select to authenticated using (public.is_ww_member(room_id));
drop policy if exists ww_players_update on public.ww_players;
create policy ww_players_update on public.ww_players
  for update to authenticated using (public.is_ww_host(room_id)) with check (public.is_ww_host(room_id));
drop policy if exists ww_players_delete on public.ww_players;
create policy ww_players_delete on public.ww_players
  for delete to authenticated using (user_id = auth.uid() or public.is_ww_host(room_id));

-- ww_roles: vejo o meu; lobos veem lobos; anfitrião vê tudo; no fim todos veem
drop policy if exists ww_roles_select on public.ww_roles;
create policy ww_roles_select on public.ww_roles
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_ww_host(room_id)
    or (role = 'lobisomem' and public.my_ww_role(room_id) = 'lobisomem')
    or (public.ww_room_status(room_id) = 'fim' and public.is_ww_member(room_id))
  );
drop policy if exists ww_roles_host_write on public.ww_roles;
create policy ww_roles_host_write on public.ww_roles
  for all to authenticated using (public.is_ww_host(room_id)) with check (public.is_ww_host(room_id));

-- ww_actions
drop policy if exists ww_actions_select on public.ww_actions;
create policy ww_actions_select on public.ww_actions
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_ww_host(room_id)
    or (kind = 'matar' and public.my_ww_role(room_id) = 'lobisomem')
  );
drop policy if exists ww_actions_insert on public.ww_actions;
create policy ww_actions_insert on public.ww_actions
  for insert to authenticated with check (user_id = auth.uid() and public.is_ww_member(room_id));
drop policy if exists ww_actions_update on public.ww_actions;
create policy ww_actions_update on public.ww_actions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists ww_actions_host_delete on public.ww_actions;
create policy ww_actions_host_delete on public.ww_actions
  for delete to authenticated using (public.is_ww_host(room_id));

-- ww_private
drop policy if exists ww_private_select on public.ww_private;
create policy ww_private_select on public.ww_private
  for select to authenticated using (user_id = auth.uid() or public.is_ww_host(room_id));
drop policy if exists ww_private_host_write on public.ww_private;
create policy ww_private_host_write on public.ww_private
  for all to authenticated using (public.is_ww_host(room_id)) with check (public.is_ww_host(room_id));

-- ww_whispers
drop policy if exists ww_whispers_select on public.ww_whispers;
create policy ww_whispers_select on public.ww_whispers
  for select to authenticated using (user_id = auth.uid() or public.is_ww_host(room_id));
drop policy if exists ww_whispers_insert on public.ww_whispers;
create policy ww_whispers_insert on public.ww_whispers
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from ww_players p where p.room_id = ww_whispers.room_id
                and p.user_id = auth.uid() and p.alive = false)
  );
drop policy if exists ww_whispers_host on public.ww_whispers;
create policy ww_whispers_host on public.ww_whispers
  for update to authenticated using (public.is_ww_host(room_id)) with check (public.is_ww_host(room_id));
drop policy if exists ww_whispers_host_delete on public.ww_whispers;
create policy ww_whispers_host_delete on public.ww_whispers
  for delete to authenticated using (public.is_ww_host(room_id));

-- ww_feed
drop policy if exists ww_feed_select on public.ww_feed;
create policy ww_feed_select on public.ww_feed
  for select to authenticated using (public.is_ww_member(room_id));
drop policy if exists ww_feed_host_write on public.ww_feed;
create policy ww_feed_host_write on public.ww_feed
  for all to authenticated using (public.is_ww_host(room_id)) with check (public.is_ww_host(room_id));

-- RPC: criar sala
create or replace function public.create_ww_room(p_nickname text, p_settings jsonb default '{}'::jsonb)
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
    exit when not exists (select 1 from ww_rooms where code = v_code);
  end loop;
  insert into ww_rooms (code, host_id, settings) values (v_code, auth.uid(), coalesce(p_settings, '{}'::jsonb))
  returning id into v_id;
  insert into ww_players (room_id, user_id, nickname) values (v_id, auth.uid(), trim(p_nickname));
  return json_build_object('id', v_id, 'code', v_code);
end;
$$;

-- RPC: entrar na sala
create or replace function public.join_ww_room(p_code text, p_nickname text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  r ww_rooms;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into r from ww_rooms where code = upper(trim(p_code));
  if not found then raise exception 'Código não encontrado'; end if;
  if exists (select 1 from ww_players where room_id = r.id and user_id = auth.uid()) then
    update ww_players set nickname = trim(p_nickname) where room_id = r.id and user_id = auth.uid();
    return r.id;
  end if;
  if r.status <> 'lobby' then raise exception 'A partida já começou'; end if;
  if (select count(*) from ww_players where room_id = r.id) >= 20 then raise exception 'Sala cheia (máx. 20)'; end if;
  insert into ww_players (room_id, user_id, nickname) values (r.id, auth.uid(), trim(p_nickname));
  return r.id;
end;
$$;

grant execute on function public.create_ss_group(text, text, date, text) to authenticated;
grant execute on function public.join_ss_group(text, text) to authenticated;
grant execute on function public.draw_ss_group(uuid) to authenticated;
grant execute on function public.send_ss_anon(uuid, text, text) to authenticated;
grant execute on function public.get_ss_anon(uuid) to authenticated;
grant execute on function public.create_ww_room(text, jsonb) to authenticated;
grant execute on function public.join_ww_room(text, text) to authenticated;

-- =====================================================================
-- REALTIME: publica as tabelas que o app escuta
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'ss_groups', 'ss_members', 'ss_messages',
    'ww_rooms', 'ww_players', 'ww_roles', 'ww_actions', 'ww_private', 'ww_feed', 'ww_whispers'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
