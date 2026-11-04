-- Aportes del público: propuestas de películas y entidades (nuevas o correcciones)
-- que el equipo revisa antes de que lleguen al mapa.

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('film', 'org')),
  target_id uuid,
  label text not null check (char_length(label) between 1 and 300),
  payload jsonb not null,
  note text check (note is null or char_length(note) <= 1500),
  contact text check (contact is null or char_length(contact) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  result_id uuid,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists submissions_status_idx on public.submissions (status, created_at desc);

alter table public.submissions enable row level security;

-- Cualquiera puede enviar un aporte, pero solo como «pendiente» y con tamaño acotado.
drop policy if exists submissions_insert_public on public.submissions;
create policy submissions_insert_public on public.submissions for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewer_note is null
    and result_id is null
    and reviewed_at is null
    and pg_column_size(payload) < 40000
  );

-- Solo el equipo lee, revisa y borra aportes (el correo de contacto es privado).
drop policy if exists submissions_team on public.submissions;
create policy submissions_team on public.submissions for all
  using (public.is_team()) with check (public.is_team());
