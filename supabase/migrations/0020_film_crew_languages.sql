-- Equipo, reparto e idiomas por producción. Aplicar después de 0019.
--
--   crew      = lista de { "role": "...", "name": "...", "detail": "..." }: equipo y reparto, varias personas por rol.
--               Los roles están en lib/crew.ts (direccion, produccion, fotografia, guion, edicion, sonido, musica_original,
--               reparto, etc.); agregar un rol nuevo no necesita migración.
--   languages = idiomas de la producción, por su nombre (estándar o propios).
--
-- Los cuatro campos de texto de antes (director, producer, cinematographer, screenwriter) se conservan:
-- la aplicación los sigue actualizando (derivados de «crew») para que se pueda volver atrás.

alter table public.films add column if not exists crew jsonb not null default '[]'::jsonb;
alter table public.films add column if not exists languages text[] not null default '{}';

-- Equipo a partir de lo que ya existía (solo donde todavía no hay equipo). Cada texto queda como una entrada.
update public.films f
set crew = coalesce(
  (
    select jsonb_agg(jsonb_build_object('role', x.role, 'name', x.name, 'detail', null) order by x.ord)
    from (
      values
        (1, 'direccion',  f.director),
        (2, 'produccion', f.producer),
        (3, 'fotografia', f.cinematographer),
        (4, 'guion',      f.screenwriter)
    ) as x(ord, role, name)
    where x.name is not null and btrim(x.name) <> ''
  ),
  '[]'::jsonb
)
where f.crew = '[]'::jsonb;

create index if not exists films_languages_idx on public.films using gin (languages);

comment on column public.films.crew is 'Equipo y reparto: [{"role": "edicion", "name": "...", "detail": null}]. Roles en lib/crew.ts.';
comment on column public.films.languages is 'Idiomas de la producción (estándar o propios), por su nombre.';
comment on column public.films.director is 'Derivado de crew (rol direccion). Se conserva por compatibilidad.';
comment on column public.films.producer is 'Derivado de crew (rol produccion). Se conserva por compatibilidad.';
comment on column public.films.cinematographer is 'Derivado de crew (rol fotografia). Se conserva por compatibilidad.';
comment on column public.films.screenwriter is 'Derivado de crew (rol guion). Se conserva por compatibilidad.';
