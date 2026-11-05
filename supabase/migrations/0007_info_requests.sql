-- Solicitudes de información: enlace privado + contraseña para que alguien del equipo de una
-- producción o entidad complete sus datos. Lo que envíen llega como aporte de «recopilación».
--
-- Sin llave de servicio: el acceso anónimo pasa solo por funciones SECURITY DEFINER que
-- verifican el enlace y la contraseña (bcrypt). La tabla solo la lee el equipo.
-- (La 0008 reemplaza info_request_open para incluir también los festivales.)

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.info_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('film', 'org')),
  target_id uuid not null,
  token_hash text not null unique,
  password_hash text not null,
  recipient text check (recipient is null or char_length(recipient) <= 200),
  recipient_email text check (recipient_email is null or char_length(recipient_email) <= 200),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  failed_attempts integer not null default 0,
  last_used_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists info_requests_target_idx on public.info_requests (kind, target_id);

alter table public.info_requests enable row level security;
drop policy if exists info_requests_team on public.info_requests;
create policy info_requests_team on public.info_requests for all
  using (public.is_team()) with check (public.is_team());

-- Origen del aporte: formulario público o enlace de recopilación.
alter table public.submissions
  add column if not exists origin text not null default 'publico' check (origin in ('publico', 'recopilacion')),
  add column if not exists request_id uuid references public.info_requests (id) on delete set null,
  add column if not exists submitter text check (submitter is null or char_length(submitter) <= 200);

-- El formulario público solo puede crear aportes «públicos»: la recopilación pasa únicamente por la función.
drop policy if exists submissions_insert_public on public.submissions;
create policy submissions_insert_public on public.submissions for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and origin = 'publico'
    and request_id is null
    and submitter is null
    and reviewer_note is null
    and result_id is null
    and reviewed_at is null
    and pg_column_size(payload) < 40000
    and note is not null and char_length(btrim(note)) >= 8
    and contact is not null and contact ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );

-- ───────────────────────── funciones ─────────────────────────

-- Crea una solicitud (solo el equipo). La contraseña se guarda con bcrypt.
create or replace function public.info_request_create(
  p_kind text,
  p_target uuid,
  p_token_hash text,
  p_password text,
  p_recipient text,
  p_email text,
  p_expires timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public.is_team() then
    raise exception 'No autorizado';
  end if;
  insert into public.info_requests (kind, target_id, token_hash, password_hash, recipient, recipient_email, expires_at)
  values (p_kind, p_target, p_token_hash, crypt(p_password, gen_salt('bf')), nullif(btrim(p_recipient), ''), nullif(btrim(p_email), ''), p_expires)
  returning id into v_id;
  return v_id;
end;
$$;

-- Verifica enlace y contraseña. Cuenta los intentos fallidos y bloquea tras 10.
-- Solo la usan las funciones de abajo (no se expone).
create or replace function public.info_request_verify(p_token_hash text, p_password text)
returns table (status text, req_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.info_requests;
begin
  select * into r from public.info_requests where token_hash = p_token_hash;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if r.revoked_at is not null then
    return query select 'revoked'::text, r.id;
    return;
  end if;
  if r.expires_at < now() then
    return query select 'expired'::text, r.id;
    return;
  end if;
  if r.failed_attempts >= 10 then
    return query select 'locked'::text, r.id;
    return;
  end if;
  if r.password_hash <> crypt(coalesce(p_password, ''), r.password_hash) then
    update public.info_requests set failed_attempts = failed_attempts + 1 where id = r.id;
    return query select 'bad_password'::text, r.id;
    return;
  end if;
  update public.info_requests set failed_attempts = 0 where id = r.id;
  return query select 'ok'::text, r.id;
end;
$$;
revoke all on function public.info_request_verify(text, text) from public, anon, authenticated;

-- Abre una solicitud: devuelve la solicitud y el registro (aunque esté oculto).
create or replace function public.info_request_open(p_token_hash text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v record;
  r public.info_requests;
  rec jsonb;
begin
  select * into v from public.info_request_verify(p_token_hash, p_password);
  if v.status <> 'ok' then
    return jsonb_build_object('status', v.status);
  end if;
  select * into r from public.info_requests where id = v.req_id;
  if r.kind = 'film' then
    select to_jsonb(f) || jsonb_build_object(
      'film_locations',
      coalesce((select jsonb_agg(to_jsonb(l) order by l.position) from public.film_locations l where l.film_id = f.id), '[]'::jsonb)
    ) into rec from public.films f where f.id = r.target_id;
  else
    select to_jsonb(o) into rec from public.organizations o where o.id = r.target_id;
  end if;
  if rec is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'request', to_jsonb(r) - 'token_hash' - 'password_hash' - 'created_by'
      || jsonb_build_object('submissions_count', (select count(*) from public.submissions s where s.request_id = r.id)),
    'record', rec
  );
end;
$$;

-- Envía un aporte de recopilación por el enlace.
create or replace function public.info_request_submit(
  p_token_hash text,
  p_password text,
  p_payload jsonb,
  p_note text,
  p_contact text,
  p_submitter text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v record;
  r public.info_requests;
  v_label text;
begin
  select * into v from public.info_request_verify(p_token_hash, p_password);
  if v.status <> 'ok' then
    return jsonb_build_object('status', v.status);
  end if;
  select * into r from public.info_requests where id = v.req_id;

  if p_payload is null or pg_column_size(p_payload) >= 40000 then
    raise exception 'Aporte demasiado grande';
  end if;
  if p_note is null or char_length(btrim(p_note)) < 8 or char_length(p_note) > 1500 then
    raise exception 'Indica la fuente de la información';
  end if;
  if p_contact is null or p_contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(p_contact) > 200 then
    raise exception 'Correo no válido';
  end if;

  if r.kind = 'film' then
    select title into v_label from public.films where id = r.target_id;
  else
    select name into v_label from public.organizations where id = r.target_id;
  end if;
  if v_label is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.submissions (kind, target_id, label, payload, note, contact, status, origin, request_id, submitter)
  values (r.kind, r.target_id, left(v_label, 300), p_payload, left(btrim(p_note), 1500), lower(btrim(p_contact)), 'pending', 'recopilacion', r.id, left(nullif(btrim(p_submitter), ''), 200));

  update public.info_requests set last_used_at = now() where id = r.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.info_request_create(text, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.info_request_create(text, uuid, text, text, text, text, timestamptz) to authenticated;
revoke all on function public.info_request_open(text, text) from public;
grant execute on function public.info_request_open(text, text) to anon, authenticated;
revoke all on function public.info_request_submit(text, text, jsonb, text, text, text) from public;
grant execute on function public.info_request_submit(text, text, jsonb, text, text, text) to anon, authenticated;
