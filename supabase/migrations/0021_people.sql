-- Directorio de técnicas y técnicos: personas (oficios del cine, también producción independiente).
-- Las empresas productoras siguen siendo entidades de Industria.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- ids de oficios (los mismos de lib/crew.ts), de 1 a 5
  roles text[] not null default '{}',
  other_role text,
  depto_ine smallint check (depto_ine between 1 and 22),
  muni_ine integer check (muni_ine between 101 and 2299),
  languages text[] not null default '{}',
  bio text check (bio is null or char_length(bio) <= 600),
  web text,
  instagram text,
  imdb text,
  portfolio text,
  public_email text,
  public_phone text,
  photo_url text,
  -- créditos destacados: [{ title, year, role }], hasta 10
  credits jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'published')),
  completeness smallint not null default 0 check (completeness between 0 and 100),
  missing_fields text[] not null default '{}',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_name_idx on public.people (name);

alter table public.people enable row level security;
create policy people_read on public.people for select
  using (status = 'published' or public.is_team());
create policy people_write on public.people for all
  using (public.is_team()) with check (public.is_team());

create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();

-- los aportes también pueden ser de una persona
alter table public.submissions drop constraint if exists submissions_kind_check;
alter table public.submissions add constraint submissions_kind_check
  check (kind in ('film', 'org', 'person'));
