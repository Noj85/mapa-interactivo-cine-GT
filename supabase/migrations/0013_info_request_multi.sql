-- Solicitudes de información con varias producciones: un solo enlace y una sola clave para
-- las producciones de un mismo director/a. Aplicar después de 0012.
--
-- `target_id` sigue siendo la primera producción; `target_ids` guarda las demás (en orden).
-- Cada producción se envía como su propio aporte (queda con su `target_id`), así que se aprueban por separado.
--
-- Las tres funciones se eliminan y se vuelven a crear: agregar un parámetro con valor por defecto
-- crea una segunda versión con el mismo nombre y las llamadas quedarían ambiguas.

alter table public.info_requests add column if not exists target_ids uuid[] not null default '{}';
create index if not exists info_requests_target_ids_idx on public.info_requests using gin (target_ids);

-- ───────────────────────── crear ─────────────────────────

drop function if exists public.info_request_create(text, uuid, text, text, text, text, timestamptz);

create or replace function public.info_request_create(
  p_kind text,
  p_target uuid,
  p_token_hash text,
  p_password text,
  p_recipient text,
  p_email text,
  p_expires timestamptz,
  p_extra uuid[] default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_extra uuid[] := '{}';
begin
  if not public.is_team() then
    raise exception 'No autorizado';
  end if;
  -- solo las producciones se consolidan; sin repetidos y como máximo 19 extra (20 en total)
  if p_kind = 'film' and p_extra is not null then
    select coalesce(array_agg(x order by first_pos), '{}')
      into v_extra
      from (
        select t.x, min(t.n) as first_pos
        from unnest(p_extra) with ordinality as t(x, n)
        where t.x <> p_target
        group by t.x
        order by min(t.n)
        limit 19
      ) q;
  end if;
  insert into public.info_requests (kind, target_id, target_ids, token_hash, password_hash, recipient, recipient_email, expires_at)
  values (p_kind, p_target, v_extra, p_token_hash, crypt(p_password, gen_salt('bf')), nullif(btrim(p_recipient), ''), nullif(btrim(p_email), ''), p_expires)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.info_request_create(text, uuid, text, text, text, text, timestamptz, uuid[]) from public, anon;
grant execute on function public.info_request_create(text, uuid, text, text, text, text, timestamptz, uuid[]) to authenticated;

-- ───────────────────────── abrir ─────────────────────────

-- Devuelve la solicitud, `record` (la primera producción, por compatibilidad), `records` (todas, con
-- locaciones y festivales) y `submitted` (producciones que ya recibieron un aporte por este enlace).
create or replace function public.info_request_open(p_token_hash text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v record;
  r public.info_requests;
  recs jsonb;
begin
  select * into v from public.info_request_verify(p_token_hash, p_password);
  if v.status <> 'ok' then
    return jsonb_build_object('status', v.status);
  end if;
  select * into r from public.info_requests where id = v.req_id;
  if r.kind = 'film' then
    select coalesce(jsonb_agg(
      to_jsonb(f) || jsonb_build_object(
        'film_locations',
        coalesce((select jsonb_agg(to_jsonb(l) order by l.position) from public.film_locations l where l.film_id = f.id), '[]'::jsonb),
        'film_festivals',
        coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from public.film_festivals x where x.film_id = f.id), '[]'::jsonb)
      ) order by ids.n
    ), '[]'::jsonb)
    into recs
    from unnest(array_prepend(r.target_id, r.target_ids)) with ordinality as ids(id, n)
    join public.films f on f.id = ids.id;
  else
    select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into recs from public.organizations o where o.id = r.target_id;
  end if;
  if jsonb_array_length(recs) = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'request', to_jsonb(r) - 'token_hash' - 'password_hash' - 'created_by'
      || jsonb_build_object('submissions_count', (select count(*) from public.submissions s where s.request_id = r.id)),
    'record', recs -> 0,
    'records', recs,
    'submitted', to_jsonb(array(select distinct s.target_id from public.submissions s where s.request_id = r.id and s.target_id is not null))
  );
end;
$$;

revoke all on function public.info_request_open(text, text) from public;
grant execute on function public.info_request_open(text, text) to anon, authenticated;

-- ───────────────────────── enviar ─────────────────────────

drop function if exists public.info_request_submit(text, text, jsonb, text, text, text);

-- `p_target` es la producción a la que corresponde el aporte; debe ser una de las de la solicitud.
create or replace function public.info_request_submit(
  p_token_hash text,
  p_password text,
  p_payload jsonb,
  p_note text,
  p_contact text,
  p_submitter text,
  p_target uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v record;
  r public.info_requests;
  v_target uuid;
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

  v_target := coalesce(p_target, r.target_id);
  -- el enlace solo sirve para las producciones que incluye
  if v_target <> r.target_id and not (v_target = any(r.target_ids)) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if r.kind = 'film' then
    select title into v_label from public.films where id = v_target;
  else
    select name into v_label from public.organizations where id = v_target;
  end if;
  if v_label is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  insert into public.submissions (kind, target_id, label, payload, note, contact, status, origin, request_id, submitter)
  values (r.kind, v_target, left(v_label, 300), p_payload, left(btrim(p_note), 1500), lower(btrim(p_contact)), 'pending', 'recopilacion', r.id, left(nullif(btrim(p_submitter), ''), 200));

  update public.info_requests set last_used_at = now() where id = r.id;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.info_request_submit(text, text, jsonb, text, text, text, uuid) from public;
grant execute on function public.info_request_submit(text, text, jsonb, text, text, text, uuid) to anon, authenticated;
