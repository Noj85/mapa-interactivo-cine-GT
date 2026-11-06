-- Aportes «Carga de archivo»: lo que una carga de archivo no puede decidir sola (diferencias con un
-- registro existente y coincidencias dudosas) queda como aporte pendiente para que el equipo lo revise.
-- Aplicar después de 0016.
--
-- Solo el equipo los crea: la política pública sigue exigiendo origin = 'publico', y la del equipo
-- (submissions_team) ya permite insertar.

-- 1. Nuevo origen.
alter table public.submissions drop constraint if exists submissions_origin_check;
alter table public.submissions
  add constraint submissions_origin_check check (origin in ('publico', 'recopilacion', 'carga'));

-- 2. Carga de la que viene el aporte y, en las coincidencias dudosas, los registros que podrían ser el mismo
--    (hasta 3: id, título, año, parecido y nivel).
alter table public.submissions
  add column if not exists import_id uuid references public.imports (id) on delete set null,
  add column if not exists candidates jsonb;

create index if not exists submissions_import_idx on public.submissions (import_id) where import_id is not null;
