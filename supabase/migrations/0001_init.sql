-- Mapa del Cine de Guatemala · esquema inicial
-- Lectura pública de lo publicado; escritura solo para el equipo (tabla profiles).

create extension if not exists pgcrypto;

-- ───────────────────────── equipo ─────────────────────────
create table public.team_allowlist (
  email text primary key,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);

create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- La primera persona que entra queda como admin; el resto debe estar en team_allowlist.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed record;
begin
  select * into allowed from public.team_allowlist where lower(email) = lower(new.email);
  if allowed is not null then
    insert into public.profiles (id, email, role) values (new.id, new.email, allowed.role);
  elsif not exists (select 1 from public.profiles) then
    insert into public.profiles (id, email, role) values (new.id, new.email, 'admin');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── imports ─────────────────────────
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text,
  sheets jsonb not null default '[]',
  mapping jsonb,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'analyzed', 'reviewing', 'committed', 'cancelled')),
  summary jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── películas ─────────────────────────
create table public.films (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  year smallint check (year between 1890 and 2100),
  kind text check (kind in ('ficcion', 'documental', 'serie', 'comercial', 'corto', 'otro')),
  director text,
  producer text,
  nationality text check (nationality in ('guatemalteca', 'coproduccion', 'extranjera')),
  budget numeric,
  currency text not null default 'GTQ' check (currency in ('GTQ', 'USD')),
  synopsis text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  completeness smallint not null default 0 check (completeness between 0 and 100),
  missing_fields text[] not null default '{}',
  source text,
  import_id uuid references public.imports (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.film_locations (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references public.films (id) on delete cascade,
  position smallint not null default 0,
  depto_ine smallint check (depto_ine between 1 and 22),
  muni_ine integer check (muni_ine between 101 and 2299),
  site text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  days integer check (days >= 0),
  local_spend numeric check (local_spend >= 0),
  jobs integer check (jobs >= 0),
  confidence real check (confidence between 0 and 1)
);
create index film_locations_film_idx on public.film_locations (film_id);
create index film_locations_muni_idx on public.film_locations (muni_ine);
create index film_locations_depto_idx on public.film_locations (depto_ine);

-- ───────────────────────── organizaciones (circulación e industria) ─────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  layer text not null check (layer in ('circulacion', 'industria')),
  category text not null,
  initiative_type text check (initiative_type in ('publica', 'privada', 'comunitaria', 'transnacional')),
  depto_ine smallint check (depto_ine between 1 and 22),
  muni_ine integer check (muni_ine between 101 and 2299),
  city text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  web text,
  instagram text,
  contact text,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  completeness smallint not null default 0 check (completeness between 0 and 100),
  missing_fields text[] not null default '{}',
  source text,
  import_id uuid references public.imports (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_layer_idx on public.organizations (layer);
create index organizations_muni_idx on public.organizations (muni_ine);

-- ───────────────────────── preguntas pendientes de la carga ─────────────────────────
create table public.import_questions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  record_ref text,
  field text,
  question text not null,
  options jsonb,
  answer text,
  status text not null default 'open' check (status in ('open', 'answered', 'deferred')),
  created_at timestamptz not null default now()
);
create index import_questions_import_idx on public.import_questions (import_id);

-- ───────────────────────── updated_at ─────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger films_touch before update on public.films for each row execute function public.touch_updated_at();
create trigger orgs_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger imports_touch before update on public.imports for each row execute function public.touch_updated_at();

-- ───────────────────────── vistas de agregados (coropleta) ─────────────────────────
-- security_invoker: respetan RLS, así el público solo agrega lo publicado.
create or replace view public.film_agg_depto with (security_invoker = on) as
select
  fl.depto_ine,
  count(distinct fl.film_id) as films,
  coalesce(sum(fl.days), 0) as days,
  coalesce(sum(fl.local_spend), 0) as spend,
  coalesce(sum(fl.jobs), 0) as jobs
from public.film_locations fl
join public.films f on f.id = fl.film_id and f.status = 'published'
where fl.depto_ine is not null
group by fl.depto_ine;

create or replace view public.film_agg_muni with (security_invoker = on) as
select
  fl.muni_ine,
  max(fl.depto_ine) as depto_ine,
  count(distinct fl.film_id) as films,
  coalesce(sum(fl.days), 0) as days,
  coalesce(sum(fl.local_spend), 0) as spend,
  coalesce(sum(fl.jobs), 0) as jobs
from public.film_locations fl
join public.films f on f.id = fl.film_id and f.status = 'published'
where fl.muni_ine is not null
group by fl.muni_ine;

create or replace view public.org_agg_depto with (security_invoker = on) as
select layer, depto_ine, count(*) as orgs
from public.organizations
where status = 'published' and depto_ine is not null
group by layer, depto_ine;

create or replace view public.org_agg_muni with (security_invoker = on) as
select layer, muni_ine, count(*) as orgs
from public.organizations
where status = 'published' and muni_ine is not null
group by layer, muni_ine;

-- ───────────────────────── RLS ─────────────────────────
alter table public.team_allowlist enable row level security;
alter table public.profiles enable row level security;
alter table public.imports enable row level security;
alter table public.films enable row level security;
alter table public.film_locations enable row level security;
alter table public.organizations enable row level security;
alter table public.import_questions enable row level security;

-- allowlist: solo admins
create policy allowlist_admin on public.team_allowlist for all
  using (public.is_admin()) with check (public.is_admin());

-- perfiles: cada quien ve el suyo; el equipo ve a todos; solo admin modifica
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_team());
create policy profiles_admin_write on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- películas
create policy films_read on public.films for select
  using (status = 'published' or public.is_team());
create policy films_write on public.films for all
  using (public.is_team()) with check (public.is_team());

create policy film_locations_read on public.film_locations for select
  using (
    public.is_team()
    or exists (select 1 from public.films f where f.id = film_id and f.status = 'published')
  );
create policy film_locations_write on public.film_locations for all
  using (public.is_team()) with check (public.is_team());

-- organizaciones
create policy orgs_read on public.organizations for select
  using (status = 'published' or public.is_team());
create policy orgs_write on public.organizations for all
  using (public.is_team()) with check (public.is_team());

-- cargas y preguntas: solo equipo
create policy imports_team on public.imports for all
  using (public.is_team()) with check (public.is_team());
create policy import_questions_team on public.import_questions for all
  using (public.is_team()) with check (public.is_team());

-- ───────────────────────── Storage ─────────────────────────
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

create policy imports_files_team on storage.objects for all
  using (bucket_id = 'imports' and public.is_team())
  with check (bucket_id = 'imports' and public.is_team());
