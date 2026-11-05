-- Una entidad puede tener varias categorías (p. ej. Productoras, Postproducción, Efectos especiales).
-- `category` sigue siendo la principal (la primera de `categories`).

alter table public.organizations add column if not exists categories text[] not null default '{}';

update public.organizations
set categories = array[category]
where coalesce(array_length(categories, 1), 0) = 0 and category is not null and category <> '';

create index if not exists organizations_categories_idx on public.organizations using gin (categories);
