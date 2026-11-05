-- Vínculo opcional entre una entrada del catálogo de festivales y su entidad de Circulación (categoría «Festivales»).
-- El catálogo sigue siendo una lista de referencia; esto solo permite saltar de uno al otro.
-- Si se borra la entidad, el vínculo se suelta y la entrada del catálogo se conserva.

alter table public.festivals
  add column if not exists org_id uuid references public.organizations (id) on delete set null;

-- una entidad se vincula a una sola entrada del catálogo
create unique index if not exists festivals_org_unique on public.festivals (org_id) where org_id is not null;
