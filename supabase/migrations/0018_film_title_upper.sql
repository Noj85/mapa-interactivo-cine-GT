-- Los títulos de las producciones se guardan siempre en MAYÚSCULAS (con acentos: «ÚLTIMO»).
-- 1) estandariza lo que ya existe, 2) un trigger lo exige en cada insert/update (aunque algo escriba sin pasar por la app).
-- Los slugs no cambian. Aplicar después de 0017. Se puede correr más de una vez.

create or replace function public.films_title_upper()
returns trigger
language plpgsql
as $$
begin
  new.title := upper(regexp_replace(btrim(new.title), '\s+', ' ', 'g'));
  return new;
end;
$$;

drop trigger if exists films_title_upper on public.films;
create trigger films_title_upper
  before insert or update of title on public.films
  for each row execute function public.films_title_upper();

-- producciones que ya estaban guardadas
update public.films
   set title = upper(regexp_replace(btrim(title), '\s+', ' ', 'g'))
 where title is distinct from upper(regexp_replace(btrim(title), '\s+', ' ', 'g'));

-- aportes pendientes de producciones: el nombre de la lista y el título propuesto
update public.submissions
   set label = upper(regexp_replace(btrim(label), '\s+', ' ', 'g')),
       payload = case
         when payload ? 'title' and jsonb_typeof(payload -> 'title') = 'string'
           then jsonb_set(payload, '{title}', to_jsonb(upper(regexp_replace(btrim(payload ->> 'title'), '\s+', ' ', 'g'))))
         else payload
       end
 where kind = 'film';

-- la lista de «faltantes» de las entidades ahora dice «Locación» en vez de «Ubicación»
update public.organizations
   set missing_fields = array_replace(missing_fields, 'Ubicación', 'Locación')
 where 'Ubicación' = any (missing_fields);

comment on function public.films_title_upper() is 'Fuerza el título de la producción en mayúsculas.';
