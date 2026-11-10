-- Glanx Flow: tablas (mismo Supabase que Glanx Guiones; todo lleva el prefijo flow_ y no toca lo de guiones).
-- Pegar entero en Supabase › SQL Editor › New query › Run. Se puede volver a ejecutar sin romper nada.

-- ===== Equipo =====
create table if not exists public.flow_team (
  email text primary key,
  name text,
  role text not null default 'equipo' check (role in ('admin', 'equipo')),
  specialty text,                       -- edición, diseño, guion, motion, sonido...
  added_at timestamptz not null default now()
);

create or replace function public.flow_email() returns text language sql stable as
$$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- 'admin', 'equipo' o null (null = no es del equipo)
create or replace function public.flow_role() returns text
language sql stable security definer set search_path = public as
$$ select role from flow_team where email = public.flow_email() $$;

-- Nombre de quien hace algo (para el historial)
create or replace function public.flow_actor() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(current_setting('flow.actor', true), ''),
                  (select coalesce(name, email) from flow_team where email = public.flow_email()),
                  nullif(public.flow_email(), ''), 'Sistema')
$$;

-- El primero que lo llame queda como admin (solo funciona mientras no haya ningún admin)
create or replace function public.flow_claim_admin(nm text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'sin sesión'; end if;
  if exists (select 1 from flow_team where role = 'admin') then return 'ya hay admin'; end if;
  insert into flow_team (email, name, role) values (public.flow_email(), nm, 'admin')
    on conflict (email) do update set role = 'admin', name = coalesce(excluded.name, flow_team.name);
  return 'ok';
end $$;

-- ===== Clientes, proyectos, entregables =====
create table if not exists public.flow_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text, email text, phone text,
  notes text,
  color text,
  created_at timestamptz not null default now(),
  created_by text default public.flow_email()
);

create table if not exists public.flow_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.flow_clients on delete set null,   -- null = proyecto interno / personal
  name text not null,
  kind text,                                -- reels, redes, videoclip, publicidad...
  status text not null default 'activo' check (status in ('activo', 'pausado', 'terminado')),
  drive_url text,
  start_date date, due_date date,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),  -- enlace privado del cliente
  created_at timestamptz not null default now(),
  created_by text default public.flow_email()
);

create table if not exists public.flow_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.flow_projects on delete cascade,
  title text not null,
  description text,
  status text not null default 'pendiente' check (status in
    ('pendiente', 'por_iniciar', 'produccion', 'edicion', 'revision_interna', 'revision_cliente', 'correcciones', 'aprobado', 'entregado')),
  assignee text,                             -- correo de alguien de flow_team
  due_date date,
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta', 'urgente')),
  specialty text,
  checklist jsonb not null default '[]',
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flow_deliverables_project on public.flow_deliverables (project_id);

-- ===== Versiones y comentarios (revisión de vídeo) =====
create table if not exists public.flow_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.flow_deliverables on delete cascade,
  project_id uuid references public.flow_projects on delete cascade,  -- lo rellena el sistema
  n int,                                                              -- V1, V2... lo rellena el sistema
  drive_file_id text not null,
  file_name text,
  notes text,
  uploaded_by text default public.flow_actor(),
  created_at timestamptz not null default now(),
  internal_ok boolean not null default false,       -- dirección la da por buena → la ve el cliente
  internal_ok_by text, internal_ok_at timestamptz,
  shared_with_client boolean not null default false,
  approved_at timestamptz, approved_by_name text      -- aprobación del cliente (no se puede cambiar después)
);
create index if not exists flow_versions_deliv on public.flow_versions (deliverable_id);

create table if not exists public.flow_comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.flow_versions on delete cascade,
  project_id uuid references public.flow_projects on delete cascade,   -- lo rellena el sistema
  parent_id uuid references public.flow_comments on delete cascade,
  t double precision,               -- segundo del vídeo (null = comentario general)
  body text not null,
  ink text,                         -- dibujo sobre el fotograma (png en base64)
  author_name text,
  author_email text default nullif(public.flow_email(), ''),
  from_client boolean not null default false,
  internal boolean not null default false,   -- nota interna: el cliente no la ve
  resolved boolean not null default false,
  resolved_by text,
  created_at timestamptz not null default now()
);
create index if not exists flow_comments_version on public.flow_comments (version_id);

-- ===== Documentos y historial =====
create table if not exists public.flow_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.flow_projects on delete cascade,
  title text not null default 'Sin título',
  kind text,                        -- brief, referencias, reunion, notas...
  content jsonb not null default '{}',
  position double precision not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text default public.flow_actor()
);

create table if not exists public.flow_activity (
  id bigint generated always as identity primary key,
  project_id uuid references public.flow_projects on delete cascade,
  deliverable_id uuid references public.flow_deliverables on delete cascade,
  actor text,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists flow_activity_project on public.flow_activity (project_id, created_at desc);

-- ===== Automatizaciones =====
create or replace function public.flow_log(pid uuid, did uuid, act text, det jsonb) returns void
language sql security definer set search_path = public as
$$ insert into flow_activity (project_id, deliverable_id, actor, action, detail) values (pid, did, public.flow_actor(), act, coalesce(det, '{}')) $$;

create or replace function public.flow_versions_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select project_id into new.project_id from flow_deliverables where id = new.deliverable_id;
    select coalesce(max(n), 0) + 1 into new.n from flow_versions where deliverable_id = new.deliverable_id;
    new.approved_at := null; new.approved_by_name := null;
  else
    if old.approved_at is not null and (new.approved_at is distinct from old.approved_at
        or new.approved_by_name is distinct from old.approved_by_name
        or new.drive_file_id is distinct from old.drive_file_id) then
      raise exception 'Esta versión ya está aprobada por el cliente y no se puede cambiar';
    end if;
    if new.internal_ok and not old.internal_ok then
      new.internal_ok_at := now(); new.internal_ok_by := public.flow_actor(); new.shared_with_client := true;
    end if;
    new.n := old.n; new.project_id := old.project_id; new.deliverable_id := old.deliverable_id;
  end if;
  return new;
end $$;

create or replace function public.flow_versions_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update flow_deliverables set status = 'revision_interna', updated_at = now() where id = new.deliverable_id;
    perform public.flow_log(new.project_id, new.deliverable_id, 'version_nueva', jsonb_build_object('n', new.n, 'version_id', new.id));
  else
    if new.internal_ok and not old.internal_ok then
      update flow_deliverables set status = 'revision_cliente', updated_at = now() where id = new.deliverable_id;
      perform public.flow_log(new.project_id, new.deliverable_id, 'enviada_al_cliente', jsonb_build_object('n', new.n));
    end if;
    if new.approved_at is not null and old.approved_at is null then
      update flow_deliverables set status = 'aprobado', updated_at = now() where id = new.deliverable_id;
      perform public.flow_log(new.project_id, new.deliverable_id, 'aprobada', jsonb_build_object('n', new.n, 'por', new.approved_by_name, 'version_id', new.id));
    end if;
  end if;
  return null;
end $$;

drop trigger if exists flow_versions_b on public.flow_versions;
drop trigger if exists flow_versions_a on public.flow_versions;
create trigger flow_versions_b before insert or update on public.flow_versions for each row execute function public.flow_versions_before();
create trigger flow_versions_a after insert or update on public.flow_versions for each row execute function public.flow_versions_after();

create or replace function public.flow_comments_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select project_id into new.project_id from flow_versions where id = new.version_id;
  return new;
end $$;
drop trigger if exists flow_comments_b on public.flow_comments;
create trigger flow_comments_b before insert on public.flow_comments for each row execute function public.flow_comments_before();

create or replace function public.flow_deliv_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.flow_log(new.project_id, new.id, 'estado', jsonb_build_object('de', old.status, 'a', new.status));
  end if;
  if new.assignee is distinct from old.assignee then
    perform public.flow_log(new.project_id, new.id, 'responsable', jsonb_build_object('a', new.assignee));
  end if;
  return null;
end $$;
drop trigger if exists flow_deliv_a on public.flow_deliverables;
create trigger flow_deliv_a after update on public.flow_deliverables for each row execute function public.flow_deliv_after();

-- ===== Permisos: el equipo ve y edita todo; solo admin borra clientes/proyectos y gestiona el equipo =====
alter table public.flow_team enable row level security;
alter table public.flow_clients enable row level security;
alter table public.flow_projects enable row level security;
alter table public.flow_deliverables enable row level security;
alter table public.flow_versions enable row level security;
alter table public.flow_comments enable row level security;
alter table public.flow_pages enable row level security;
alter table public.flow_activity enable row level security;

drop policy if exists t_sel on public.flow_team;
drop policy if exists t_adm on public.flow_team;
drop policy if exists t_self on public.flow_team;
create policy t_sel on public.flow_team for select to authenticated using (public.flow_role() is not null);
create policy t_adm on public.flow_team for all to authenticated using (public.flow_role() = 'admin') with check (public.flow_role() = 'admin');
-- cada uno puede cambiar su nombre y especialidad (no su rol)
create policy t_self on public.flow_team for update to authenticated
  using (email = public.flow_email()) with check (email = public.flow_email() and role = public.flow_role());

do $$
declare tb text;
begin
  foreach tb in array array['flow_clients', 'flow_projects', 'flow_deliverables', 'flow_versions', 'flow_comments', 'flow_pages'] loop
    execute format('drop policy if exists f_sel on public.%I', tb);
    execute format('drop policy if exists f_ins on public.%I', tb);
    execute format('drop policy if exists f_upd on public.%I', tb);
    execute format('drop policy if exists f_del on public.%I', tb);
    execute format('create policy f_sel on public.%I for select to authenticated using (public.flow_role() is not null)', tb);
    execute format('create policy f_ins on public.%I for insert to authenticated with check (public.flow_role() is not null)', tb);
    execute format('create policy f_upd on public.%I for update to authenticated using (public.flow_role() is not null) with check (public.flow_role() is not null)', tb);
    if tb in ('flow_clients', 'flow_projects') then
      execute format('create policy f_del on public.%I for delete to authenticated using (public.flow_role() = ''admin'')', tb);
    else
      execute format('create policy f_del on public.%I for delete to authenticated using (public.flow_role() is not null)', tb);
    end if;
  end loop;
end $$;

drop policy if exists a_sel on public.flow_activity;
create policy a_sel on public.flow_activity for select to authenticated using (public.flow_role() is not null);

-- ===== Portal del cliente (sin cuenta: entra con el código secreto del enlace) =====
create or replace function public.flow_portal(tok text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p flow_projects;
begin
  select * into p from flow_projects where share_token = tok;
  if not found then return null; end if;
  return jsonb_build_object(
    'project', jsonb_build_object('id', p.id, 'name', p.name, 'kind', p.kind, 'status', p.status, 'due_date', p.due_date,
                                  'client', (select name from flow_clients where id = p.client_id)),
    'deliverables', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'status', d.status,
                                  'due_date', d.due_date, 'position', d.position) order by d.position, d.created_at)
                              from flow_deliverables d where d.project_id = p.id), '[]'),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'deliverable_id', v.deliverable_id, 'n', v.n,
                                  'drive_file_id', v.drive_file_id, 'file_name', v.file_name, 'created_at', v.created_at,
                                  'approved_at', v.approved_at, 'approved_by_name', v.approved_by_name) order by v.created_at)
                          from flow_versions v where v.project_id = p.id and v.shared_with_client), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'version_id', c.version_id, 'parent_id', c.parent_id,
                                  't', c.t, 'body', c.body, 'ink', c.ink, 'author_name', c.author_name, 'from_client', c.from_client,
                                  'resolved', c.resolved, 'created_at', c.created_at) order by c.created_at)
                          from flow_comments c join flow_versions v on v.id = c.version_id
                          where c.project_id = p.id and not c.internal and v.shared_with_client), '[]')
  );
end $$;

create or replace function public.flow_portal_comment(tok text, vid uuid, sec double precision, txt text, nm text, drawing text default null, parent uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; cid uuid;
begin
  select v.project_id into pid from flow_versions v join flow_projects p on p.id = v.project_id
   where v.id = vid and p.share_token = tok and v.shared_with_client;
  if pid is null then raise exception 'enlace o versión no válidos'; end if;
  if length(coalesce(txt, '')) = 0 or length(txt) > 4000 then raise exception 'comentario vacío o demasiado largo'; end if;
  if drawing is not null and length(drawing) > 1500000 then raise exception 'dibujo demasiado grande'; end if;
  insert into flow_comments (version_id, parent_id, t, body, ink, author_name, author_email, from_client)
    values (vid, parent, sec, txt, drawing, left(coalesce(nullif(trim(nm), ''), 'Cliente'), 80), null, true)
    returning id into cid;
  return cid;
end $$;

-- El cliente envía sus correcciones → el entregable pasa a «Correcciones»
create or replace function public.flow_portal_request_changes(tok text, did uuid, nm text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select d.project_id into pid from flow_deliverables d join flow_projects p on p.id = d.project_id
   where d.id = did and p.share_token = tok;
  if pid is null then raise exception 'enlace no válido'; end if;
  perform set_config('flow.actor', left(coalesce(nullif(trim(nm), ''), 'Cliente'), 80) || ' (cliente)', true);
  update flow_deliverables set status = 'correcciones', updated_at = now() where id = did and status = 'revision_cliente';
end $$;

-- El cliente aprueba una versión concreta → queda registrado y el entregable pasa a «Aprobado»
create or replace function public.flow_portal_approve(tok text, vid uuid, nm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid; r flow_versions;
begin
  select v.project_id into pid from flow_versions v join flow_projects p on p.id = v.project_id
   where v.id = vid and p.share_token = tok and v.shared_with_client;
  if pid is null then raise exception 'enlace o versión no válidos'; end if;
  perform set_config('flow.actor', left(coalesce(nullif(trim(nm), ''), 'Cliente'), 80) || ' (cliente)', true);
  update flow_versions set approved_at = now(), approved_by_name = left(coalesce(nullif(trim(nm), ''), 'Cliente'), 80)
   where id = vid and approved_at is null returning * into r;
  return jsonb_build_object('approved_at', r.approved_at, 'approved_by_name', r.approved_by_name, 'n', r.n);
end $$;

grant execute on function public.flow_portal(text) to anon, authenticated;
grant execute on function public.flow_portal_comment(text, uuid, double precision, text, text, text, uuid) to anon, authenticated;
grant execute on function public.flow_portal_request_changes(text, uuid, text) to anon, authenticated;
grant execute on function public.flow_portal_approve(text, uuid, text) to anon, authenticated;
grant execute on function public.flow_claim_admin(text) to authenticated;
grant execute on function public.flow_role() to authenticated;

-- ===== Avisos en vivo =====
do $$ begin
  begin alter publication supabase_realtime add table public.flow_deliverables; exception when others then null; end;
  begin alter publication supabase_realtime add table public.flow_versions; exception when others then null; end;
  begin alter publication supabase_realtime add table public.flow_comments; exception when others then null; end;
  begin alter publication supabase_realtime add table public.flow_activity; exception when others then null; end;
  begin alter publication supabase_realtime add table public.flow_pages; exception when others then null; end;
end $$;
