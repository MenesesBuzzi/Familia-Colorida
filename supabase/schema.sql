-- =====================================================================
-- Família Colorida v3 — esquema COMPLETO do Supabase (v1 + v2 + v3)
-- Cole TUDO no SQL Editor do Supabase e clique em "Run".
-- Já rodou a v2? Pode rodar só o supabase/v3-upgrade.sql (é o mesmo bloco v3 do final deste arquivo).
-- Pode rodar quantas vezes quiser (idempotente), inclusive num banco que já tem a v1/v2:
-- nada é apagado, só cria/atualiza o que falta.
-- Login: Authentication > Sign In / Providers > Google e Email ligados
-- ("Allow anonymous sign-ins" é opcional: só para o botão "visitante").
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

-- RPC: criar sala (redefinida na v2, mais abaixo, para guardar a foto)
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
-- v2: PERFIS (apelido + foto do Google)
-- =====================================================================

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null default 'Jogador' check (char_length(nickname) between 1 and 30),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 1000),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Perfis só têm apelido e foto: qualquer pessoa logada pode ver (para mostrar nas salas).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Apelido inicial a partir dos dados do provedor (Google: full_name/name; e-mail: nickname)
create or replace function public.fc_nick_from_meta(meta jsonb, email text)
returns text language sql immutable
as $$
  select left(coalesce(
    nullif(trim(meta->>'nickname'), ''),
    nullif(split_part(trim(coalesce(meta->>'full_name', meta->>'name', '')), ' ', 1), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Jogador'
  ), 30);
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, nickname, avatar_url)
    values (
      new.id,
      public.fc_nick_from_meta(coalesce(new.raw_user_meta_data, '{}'::jsonb), new.email),
      coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
    )
    on conflict (id) do nothing;
  exception when others then
    -- nunca impedir o cadastro por causa do perfil (o app cria o perfil depois, se faltar)
    null;
  end;
  return new;
end;
$$;

drop trigger if exists fc_on_auth_user_created on auth.users;
create trigger fc_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Cria perfil para quem já existia (usuários da v1)
insert into public.profiles (id, nickname, avatar_url)
select u.id,
       public.fc_nick_from_meta(coalesce(u.raw_user_meta_data, '{}'::jsonb), u.email),
       coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u
on conflict (id) do nothing;

create or replace function public.my_avatar()
returns text language sql stable security definer set search_path = public
as $$ select avatar_url from profiles where id = auth.uid(); $$;

-- =====================================================================
-- v2: LOBISOMEM — foto dos jogadores + chat da sala (vila e fantasmas)
-- =====================================================================

alter table public.ww_players add column if not exists avatar_url text;

create table if not exists public.ww_chat (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.ww_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 40),
  channel    text not null default 'vila' check (channel in ('vila', 'fantasmas')),
  kind       text not null default 'jogador' check (kind in ('jogador', 'ia', 'sistema')),
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists ww_chat_room_idx on public.ww_chat (room_id, channel, id);
alter table public.ww_chat enable row level security;

create or replace function public.ww_am_alive(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from ww_players where room_id = r and user_id = auth.uid() and alive); $$;

create or replace function public.ww_am_dead(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from ww_players where room_id = r and user_id = auth.uid() and not alive); $$;

-- Ler: chat da vila = todos da sala. Chat dos fantasmas = só mortos (ou todos depois do fim).
drop policy if exists ww_chat_select on public.ww_chat;
create policy ww_chat_select on public.ww_chat
  for select to authenticated using (
    public.is_ww_member(room_id)
    and (
      channel = 'vila'
      or (channel = 'fantasmas' and (public.ww_am_dead(room_id) or public.ww_room_status(room_id) = 'fim'))
    )
  );
-- Escrever: vivos falam na vila (no lobby/fim todos falam); mortos só no canal dos fantasmas;
-- mensagens da IA/sistema só o anfitrião publica.
drop policy if exists ww_chat_insert on public.ww_chat;
create policy ww_chat_insert on public.ww_chat
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_ww_member(room_id)
    and (
      (kind = 'jogador' and channel = 'vila'
        and (public.ww_room_status(room_id) <> 'jogando' or public.ww_am_alive(room_id)))
      or (kind = 'jogador' and channel = 'fantasmas'
        and public.ww_room_status(room_id) = 'jogando' and public.ww_am_dead(room_id))
      or (kind in ('ia', 'sistema') and channel = 'vila' and public.is_ww_host(room_id))
    )
  );
drop policy if exists ww_chat_host_delete on public.ww_chat;
create policy ww_chat_host_delete on public.ww_chat
  for delete to authenticated using (public.is_ww_host(room_id));

-- RPCs do Lobisomem agora guardam a foto do perfil (mesma assinatura da v1)
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
  insert into ww_players (room_id, user_id, nickname, avatar_url)
  values (v_id, auth.uid(), trim(p_nickname), public.my_avatar());
  return json_build_object('id', v_id, 'code', v_code);
end;
$$;

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
    update ww_players set nickname = trim(p_nickname), avatar_url = public.my_avatar()
    where room_id = r.id and user_id = auth.uid();
    return r.id;
  end if;
  if r.status <> 'lobby' then raise exception 'A partida já começou'; end if;
  if (select count(*) from ww_players where room_id = r.id) >= 20 then raise exception 'Sala cheia (máx. 20)'; end if;
  insert into ww_players (room_id, user_id, nickname, avatar_url)
  values (r.id, auth.uid(), trim(p_nickname), public.my_avatar());
  return r.id;
end;
$$;

-- =====================================================================
-- v2: RÁDIO AMIGO
-- =====================================================================

create table if not exists public.radio_rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null check (char_length(name) between 1 and 60),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.radio_members (
  room_id    uuid not null references public.radio_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 30),
  avatar_url text,
  joined_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.radio_songs (
  id            bigint generated always as identity primary key,
  room_id       uuid not null references public.radio_rooms(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  artist        text not null check (char_length(artist) between 1 and 120),
  added_by      uuid references auth.users(id) on delete set null,
  added_by_name text,
  source        text not null default 'membro' check (source in ('membro', 'ia')),
  reason        text check (reason is null or char_length(reason) <= 300),
  created_at    timestamptz not null default now()
);
create unique index if not exists radio_songs_unique on public.radio_songs (room_id, lower(title), lower(artist));

-- value: 1 = 👍, -1 = 👎, 0 = voto retirado (não apagamos linhas: o realtime avisa todo mundo)
create table if not exists public.radio_votes (
  song_id    bigint not null references public.radio_songs(id) on delete cascade,
  room_id    uuid not null references public.radio_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  value      smallint not null default 0 check (value in (-1, 0, 1)),
  updated_at timestamptz not null default now(),
  primary key (song_id, user_id)
);
create index if not exists radio_votes_room_idx on public.radio_votes (room_id);

alter table public.radio_rooms   enable row level security;
alter table public.radio_members enable row level security;
alter table public.radio_songs   enable row level security;
alter table public.radio_votes   enable row level security;

create or replace function public.is_radio_member(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from radio_members where room_id = r and user_id = auth.uid()); $$;

create or replace function public.is_radio_owner(r uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from radio_rooms where id = r and owner_id = auth.uid()); $$;

-- radio_rooms
drop policy if exists radio_rooms_select on public.radio_rooms;
create policy radio_rooms_select on public.radio_rooms
  for select to authenticated using (public.is_radio_member(id) or owner_id = auth.uid());
drop policy if exists radio_rooms_update on public.radio_rooms;
create policy radio_rooms_update on public.radio_rooms
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists radio_rooms_delete on public.radio_rooms;
create policy radio_rooms_delete on public.radio_rooms
  for delete to authenticated using (owner_id = auth.uid());

-- radio_members (entrar só pelas RPCs)
drop policy if exists radio_members_select on public.radio_members;
create policy radio_members_select on public.radio_members
  for select to authenticated using (public.is_radio_member(room_id));
drop policy if exists radio_members_delete on public.radio_members;
create policy radio_members_delete on public.radio_members
  for delete to authenticated using (user_id = auth.uid() or public.is_radio_owner(room_id));

-- radio_songs
drop policy if exists radio_songs_select on public.radio_songs;
create policy radio_songs_select on public.radio_songs
  for select to authenticated using (public.is_radio_member(room_id));
drop policy if exists radio_songs_insert on public.radio_songs;
create policy radio_songs_insert on public.radio_songs
  for insert to authenticated with check (added_by = auth.uid() and public.is_radio_member(room_id));
drop policy if exists radio_songs_delete on public.radio_songs;
create policy radio_songs_delete on public.radio_songs
  for delete to authenticated using (added_by = auth.uid() or public.is_radio_owner(room_id));

-- radio_votes
drop policy if exists radio_votes_select on public.radio_votes;
create policy radio_votes_select on public.radio_votes
  for select to authenticated using (public.is_radio_member(room_id));
drop policy if exists radio_votes_insert on public.radio_votes;
create policy radio_votes_insert on public.radio_votes
  for insert to authenticated with check (
    user_id = auth.uid()
    and public.is_radio_member(room_id)
    and exists (select 1 from radio_songs s where s.id = song_id and s.room_id = radio_votes.room_id)
  );
drop policy if exists radio_votes_update on public.radio_votes;
create policy radio_votes_update on public.radio_votes
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and public.is_radio_member(room_id)
    and exists (select 1 from radio_songs s where s.id = song_id and s.room_id = radio_votes.room_id)
  );

create or replace function public.create_radio_room(p_name text, p_nickname text)
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
    exit when not exists (select 1 from radio_rooms where code = v_code);
  end loop;
  insert into radio_rooms (code, name, owner_id) values (v_code, trim(p_name), auth.uid())
  returning id into v_id;
  insert into radio_members (room_id, user_id, nickname, avatar_url)
  values (v_id, auth.uid(), trim(p_nickname), public.my_avatar());
  return json_build_object('id', v_id, 'code', v_code);
end;
$$;

create or replace function public.join_radio_room(p_code text, p_nickname text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  r radio_rooms;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into r from radio_rooms where code = upper(trim(p_code));
  if not found then raise exception 'Código não encontrado'; end if;
  if (select count(*) from radio_members where room_id = r.id) >= 50
     and not exists (select 1 from radio_members where room_id = r.id and user_id = auth.uid()) then
    raise exception 'Rádio cheia (máx. 50)';
  end if;
  insert into radio_members (room_id, user_id, nickname, avatar_url)
  values (r.id, auth.uid(), trim(p_nickname), public.my_avatar())
  on conflict (room_id, user_id) do update set nickname = excluded.nickname, avatar_url = excluded.avatar_url;
  return r.id;
end;
$$;

-- Adiciona música (ignora repetida: devolve null). p_source: 'membro' ou 'ia'
create or replace function public.add_radio_song(
  p_room uuid, p_title text, p_artist text, p_source text default 'membro', p_reason text default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
  v_nick text;
begin
  if not public.is_radio_member(p_room) then raise exception 'Você não é desta rádio'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_artist), '') = '' then
    raise exception 'Informe música e artista';
  end if;
  select nickname into v_nick from radio_members where room_id = p_room and user_id = auth.uid();
  insert into radio_songs (room_id, title, artist, added_by, added_by_name, source, reason)
  values (
    p_room, left(trim(p_title), 120), left(trim(p_artist), 120), auth.uid(), v_nick,
    case when p_source = 'ia' then 'ia' else 'membro' end,
    nullif(left(trim(coalesce(p_reason, '')), 300), '')
  )
  on conflict (room_id, lower(title), lower(artist)) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_radio_room(text, text) to authenticated;
grant execute on function public.join_radio_room(text, text) to authenticated;
grant execute on function public.add_radio_song(uuid, text, text, text, text) to authenticated;

-- =====================================================================
-- REALTIME: publica as tabelas que o app escuta
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'ss_groups', 'ss_members', 'ss_messages',
    'ww_rooms', 'ww_players', 'ww_roles', 'ww_actions', 'ww_private', 'ww_feed', 'ww_whispers',
    'ww_chat', 'radio_rooms', 'radio_members', 'radio_songs', 'radio_votes'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- #####################################################################
-- Família Colorida v3 (o mesmo conteúdo de supabase/v3-upgrade.sql)
-- #####################################################################

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
