-- Casas productoras de una producción: lista de { name, country }.
-- Vive dentro de `films` (jsonb), así que la lectura pública ya queda cubierta por las políticas de la fila.
-- «producer» sigue existiendo, pero ahora es la persona productora (Productor/a).

alter table public.films
  add column if not exists companies jsonb not null default '[]'::jsonb;

comment on column public.films.companies is 'Casas productoras: [{"name": "...", "country": "..."}]';
comment on column public.films.producer is 'Productor/a (persona). Las casas productoras van en companies.';
