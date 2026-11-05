-- Aportes del público: la fuente (note) y el correo (contact) pasan a ser obligatorios al enviar.
-- Solo afecta a las inserciones nuevas (política); los aportes anteriores y su revisión no se tocan.

drop policy if exists submissions_insert_public on public.submissions;
create policy submissions_insert_public on public.submissions for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and reviewer_note is null
    and result_id is null
    and reviewed_at is null
    and pg_column_size(payload) < 40000
    and note is not null and char_length(btrim(note)) >= 8
    and contact is not null and contact ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );
