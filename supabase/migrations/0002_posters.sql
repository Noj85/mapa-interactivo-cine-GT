-- Pósters de películas: URL pública guardada en la película y archivos en Supabase Storage.

alter table public.films add column if not exists poster_url text;

-- Bucket público de lectura; solo el equipo puede subir, reemplazar o borrar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists posters_read on storage.objects;
create policy posters_read on storage.objects for select
  using (bucket_id = 'posters');

drop policy if exists posters_team_insert on storage.objects;
create policy posters_team_insert on storage.objects for insert
  with check (bucket_id = 'posters' and public.is_team());

drop policy if exists posters_team_update on storage.objects;
create policy posters_team_update on storage.objects for update
  using (bucket_id = 'posters' and public.is_team())
  with check (bucket_id = 'posters' and public.is_team());

drop policy if exists posters_team_delete on storage.objects;
create policy posters_team_delete on storage.objects for delete
  using (bucket_id = 'posters' and public.is_team());
