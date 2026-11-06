-- Ajustes del sitio (clave → valor). Por ahora guarda qué cifras muestra el mapa público
-- (`public_stats`: producciones con locación, días de rodaje, inversión local y empleos).
-- Lectura pública (el mapa los necesita); solo el equipo escribe. Aplicar después de 0014.

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select using (true);
drop policy if exists site_settings_write on public.site_settings;
create policy site_settings_write on public.site_settings for all
  using (public.is_team()) with check (public.is_team());
