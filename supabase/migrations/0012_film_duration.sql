-- Duración en minutos de cada producción. Aplicar después de 0011.

alter table public.films add column if not exists duration_min integer;

alter table public.films drop constraint if exists films_duration_min_check;
alter table public.films add constraint films_duration_min_check check (duration_min is null or duration_min between 1 and 2000);
