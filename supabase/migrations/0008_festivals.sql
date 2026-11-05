-- Festivales y premios por producción + catálogo de festivales.
-- Después de aplicarla, entra a Admin → Festivales y pulsa «Cargar catálogo base».

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.festivals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 1 and 300),
  aliases text[] not null default '{}',
  country text,
  city text,
  founded smallint,
  source text,
  /** Nombre y alias sin acentos ni mayúsculas, para buscar. Lo calcula la aplicación. */
  search text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists festivals_search_idx on public.festivals using gin (search extensions.gin_trgm_ops);
create index if not exists festivals_name_idx on public.festivals (name);

create table if not exists public.film_festivals (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references public.films (id) on delete cascade,
  position smallint not null default 0,
  -- null cuando el festival se escribió a mano y no está en el catálogo
  festival_id uuid references public.festivals (id) on delete set null,
  name text not null check (char_length(name) between 1 and 300),
  year smallint,
  country text,
  city text,
  result text not null default 'seleccion' check (result in ('seleccion', 'nominacion', 'premio', 'mencion', 'proyeccion')),
  section text,
  award text,
  url text
);
create index if not exists film_festivals_film_idx on public.film_festivals (film_id);
create index if not exists film_festivals_festival_idx on public.film_festivals (festival_id);

alter table public.festivals enable row level security;
alter table public.film_festivals enable row level security;

-- El catálogo es público (sirve para el autocompletado del formulario); solo el equipo lo modifica.
drop policy if exists festivals_read on public.festivals;
create policy festivals_read on public.festivals for select using (true);
drop policy if exists festivals_write on public.festivals;
create policy festivals_write on public.festivals for all
  using (public.is_team()) with check (public.is_team());

drop policy if exists film_festivals_read on public.film_festivals;
create policy film_festivals_read on public.film_festivals for select
  using (
    public.is_team()
    or exists (select 1 from public.films f where f.id = film_id and f.status = 'published')
  );
drop policy if exists film_festivals_write on public.film_festivals;
create policy film_festivals_write on public.film_festivals for all
  using (public.is_team()) with check (public.is_team());

-- La función de solicitudes (0007) ahora también devuelve los festivales de la producción.
create or replace function public.info_request_open(p_token_hash text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v record;
  r public.info_requests;
  rec jsonb;
begin
  select * into v from public.info_request_verify(p_token_hash, p_password);
  if v.status <> 'ok' then
    return jsonb_build_object('status', v.status);
  end if;
  select * into r from public.info_requests where id = v.req_id;
  if r.kind = 'film' then
    select to_jsonb(f) || jsonb_build_object(
      'film_locations',
      coalesce((select jsonb_agg(to_jsonb(l) order by l.position) from public.film_locations l where l.film_id = f.id), '[]'::jsonb),
      'film_festivals',
      coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from public.film_festivals x where x.film_id = f.id), '[]'::jsonb)
    ) into rec from public.films f where f.id = r.target_id;
  else
    select to_jsonb(o) into rec from public.organizations o where o.id = r.target_id;
  end if;
  if rec is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'request', to_jsonb(r) - 'token_hash' - 'password_hash' - 'created_by'
      || jsonb_build_object('submissions_count', (select count(*) from public.submissions s where s.request_id = r.id)),
    'record', rec
  );
end;
$$;
revoke all on function public.info_request_open(text, text) from public;
grant execute on function public.info_request_open(text, text) to anon, authenticated;
