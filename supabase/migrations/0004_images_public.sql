-- Logos de entidades e imágenes que envía el público en sus aportes.

alter table public.organizations add column if not exists logo_url text;

-- Bucket de imágenes de aportes: cualquiera puede subir (solo WebP/JPG/PNG de hasta 3 MB),
-- pero solo el equipo puede reemplazar o borrar. La lectura es pública porque las URL son
-- impredecibles (UUID) y se usan en el mapa una vez aprobado el aporte.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aportes', 'aportes', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists aportes_read on storage.objects;
create policy aportes_read on storage.objects for select
  using (bucket_id = 'aportes');

drop policy if exists aportes_public_insert on storage.objects;
create policy aportes_public_insert on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'aportes');

drop policy if exists aportes_team_update on storage.objects;
create policy aportes_team_update on storage.objects for update
  using (bucket_id = 'aportes' and public.is_team())
  with check (bucket_id = 'aportes' and public.is_team());

drop policy if exists aportes_team_delete on storage.objects;
create policy aportes_team_delete on storage.objects for delete
  using (bucket_id = 'aportes' and public.is_team());
