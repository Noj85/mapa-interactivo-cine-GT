-- Formato, naturaleza y géneros de las producciones.
-- Reemplaza al antiguo campo único «kind» (ficción, documental, serie, comercial, corto, otro):
--   format  = largometraje, cortometraje, serie, video musical…
--   nature  = ficción, documental o híbrido
--   genres  = géneros estándar de festivales o propios, por su nombre
-- Aplicar después de 0009 y 0010. La columna «kind» se conserva sin uso, por si hay que volver atrás.

alter table public.films
  add column if not exists format text,
  add column if not exists nature text,
  add column if not exists genres text[] not null default '{}';

alter table public.films drop constraint if exists films_format_check;
alter table public.films add constraint films_format_check check (
  format is null or format in (
    'largometraje', 'mediometraje', 'cortometraje', 'serie', 'miniserie',
    'video_musical', 'publicidad', 'programa_tv', 'web', 'videoarte', 'otro'
  )
);

alter table public.films drop constraint if exists films_nature_check;
alter table public.films add constraint films_nature_check check (nature is null or nature in ('ficcion', 'documental', 'hibrido'));

-- ya no se escribe «kind»: se le quita el check para que pueda quedar vacío
alter table public.films drop constraint if exists films_kind_check;

-- Conversión de lo que ya existía (solo donde todavía no hay formato ni naturaleza)
update public.films set nature = 'ficcion' where kind = 'ficcion' and nature is null;
update public.films set nature = 'documental' where kind = 'documental' and nature is null;
update public.films set format = 'cortometraje' where kind = 'corto' and format is null;
update public.films set format = 'serie' where kind = 'serie' and format is null;
update public.films set format = 'publicidad' where kind = 'comercial' and format is null;

create index if not exists films_genres_idx on public.films using gin (genres);
create index if not exists films_format_idx on public.films (format);

comment on column public.films.format is 'Formato: largometraje, cortometraje, serie, video_musical…';
comment on column public.films.nature is 'Naturaleza: ficcion, documental, hibrido.';
comment on column public.films.genres is 'Géneros (estándar o propios), por su nombre.';
comment on column public.films.kind is 'En desuso: reemplazado por format y nature.';
