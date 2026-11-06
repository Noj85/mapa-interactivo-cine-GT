-- Equipo creativo por producción: Director/a de fotografía y Guionista (personas, opcionales).
-- Igual que `director` y `producer`: texto libre, sin vínculo con otra tabla. Aplicar después de 0015.

alter table public.films add column if not exists cinematographer text;
alter table public.films add column if not exists screenwriter text;

comment on column public.films.cinematographer is 'Director/a de fotografía (persona).';
comment on column public.films.screenwriter is 'Guionista (persona).';
