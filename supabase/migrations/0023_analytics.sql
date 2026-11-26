-- Estadísticas de visitas (medición propia, anónima y sin cookies). Aplicar después de 0022.
--
-- Qué guarda `site_events`: un evento por visita a una página o por acción en el mapa (ficha abierta,
-- búsqueda, descarga...). NUNCA guarda la IP ni nada que identifique a una persona: `visitor` es un hash
-- que cambia cada día (IP + navegador + fecha + sal secreta), calculado en el servidor; sirve solo para
-- contar «visitantes únicos por día».
--
-- Quién puede qué: cualquiera puede INSERTAR eventos (el sitio público los envía con la clave anónima,
-- con límites de tipo y de largo); solo el equipo (`public.is_team()`) puede LEERLOS o borrarlos.

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('view', 'film', 'place', 'search', 'layer', 'download', 'contribute')),
  path text check (char_length(path) <= 200),
  visitor text check (char_length(visitor) <= 40),
  country text check (char_length(country) <= 2),
  device text check (device in ('desktop', 'mobile', 'tablet')),
  browser text check (char_length(browser) <= 30),
  ref_host text check (char_length(ref_host) <= 100),
  label text check (char_length(label) <= 120),
  meta jsonb check (meta is null or pg_column_size(meta) <= 600)
);

create index if not exists site_events_created_idx on public.site_events (created_at desc);
create index if not exists site_events_kind_created_idx on public.site_events (kind, created_at desc);

alter table public.site_events enable row level security;

drop policy if exists site_events_insert on public.site_events;
create policy site_events_insert on public.site_events for insert
  to anon, authenticated
  with check (true);

drop policy if exists site_events_read on public.site_events;
create policy site_events_read on public.site_events for select using (public.is_team());

drop policy if exists site_events_delete on public.site_events;
create policy site_events_delete on public.site_events for delete using (public.is_team());

-- Resumen del periodo [p_from, p_to). Corre con los permisos de quien llama (security invoker): si no es
-- del equipo, la política de lectura no le deja ver filas y recibe todo en cero.
-- Los días se cuentan en hora de Guatemala.
create or replace function public.analytics_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with e as (
    select * from public.site_events where created_at >= p_from and created_at < p_to
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'views',         (select count(*) from e where kind = 'view'),
      'visitors',      (select count(distinct visitor) from e where kind = 'view'),
      'films',         (select count(*) from e where kind = 'film'),
      'downloads',     (select count(*) from e where kind = 'download'),
      'searches',      (select count(*) from e where kind = 'search'),
      'contributions', (select count(*) from e where kind = 'contribute')
    ),
    'daily', (
      select coalesce(jsonb_agg(x order by x.d), '[]'::jsonb) from (
        select to_char((created_at at time zone 'America/Guatemala')::date, 'YYYY-MM-DD') as d,
               count(*) filter (where kind = 'view') as views,
               count(distinct visitor) filter (where kind = 'view') as visitors,
               count(*) filter (where kind = 'film') as films,
               count(*) filter (where kind = 'download') as downloads
        from e group by 1
      ) x
    ),
    'topPaths',      (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select path as name, count(*)::int as n from e where kind = 'view' and path is not null group by 1 order by 2 desc, 1 limit 10) x),
    'topFilms',      (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select label as name, count(*)::int as n from e where kind = 'film' and label is not null group by 1 order by 2 desc, 1 limit 10) x),
    'topPlaces',     (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select label as name, count(*)::int as n from e where kind = 'place' and label is not null group by 1 order by 2 desc, 1 limit 10) x),
    'topSearches',   (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select label as name, count(*)::int as n from e where kind = 'search' and label is not null group by 1 order by 2 desc, 1 limit 10) x),
    'layers',        (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select label as name, count(*)::int as n from e where kind = 'layer' and label is not null group by 1 order by 2 desc, 1) x),
    'downloads',     (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select label as name, count(*)::int as n from e where kind = 'download' and label is not null group by 1 order by 2 desc, 1 limit 10) x),
    'contributions', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select label as name, count(*)::int as n from e where kind = 'contribute' and label is not null group by 1 order by 2 desc, 1) x),
    'countries',     (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select country as name, count(distinct visitor)::int as n from e where kind = 'view' and country is not null group by 1 order by 2 desc, 1 limit 10) x),
    'devices',       (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select device as name, count(distinct visitor)::int as n from e where kind = 'view' and device is not null group by 1 order by 2 desc, 1) x),
    'browsers',      (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select browser as name, count(distinct visitor)::int as n from e where kind = 'view' and browser is not null group by 1 order by 2 desc, 1 limit 8) x),
    'referrers',     (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select ref_host as name, count(distinct visitor)::int as n from e where kind = 'view' and ref_host is not null group by 1 order by 2 desc, 1 limit 10) x)
  );
$$;

revoke execute on function public.analytics_overview(timestamptz, timestamptz) from public, anon;
grant execute on function public.analytics_overview(timestamptz, timestamptz) to authenticated;

-- Limpieza: borra eventos de más de 13 meses. Ejecutarla de vez en cuando desde el SQL Editor
--   select public.analytics_prune();
-- o programarla (extensión pg_cron):
--   select cron.schedule('analytics-prune', '0 4 1 * *', $$select public.analytics_prune()$$);
-- Solo borra si quien llama es del equipo (la política de borrado lo exige).
create or replace function public.analytics_prune()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare n integer;
begin
  delete from public.site_events where created_at < now() - interval '13 months';
  get diagnostics n = row_count;
  return n;
end
$$;
