-- Acceso de solo lectura para terceros (p. ej. una empresa que necesita jalar los datos).
--
-- Crea el rol `lector_externo`: puede hacer SELECT en las tablas públicas del mapa y nada más.
-- No ve aportes, correos, cuentas del equipo, solicitudes de información ni cargas internas.
-- Como el repositorio es público, AQUÍ NO VA NINGUNA CLAVE: se define aparte (ver README,
-- «Acceso de solo lectura para terceros»).
--
-- Las políticas RLS de las tablas (`*_read`) no nombran rol, así que aplican también a este
-- rol: solo ve registros publicados (los borradores no). `public.is_team()` devuelve falso
-- para él porque no es un usuario autenticado.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lector_externo') then
    -- Sin contraseña: no puede iniciar sesión hasta que el administrador la defina.
    create role lector_externo login;
  end if;
end
$$;

-- Defensas adicionales: sesiones de solo lectura, tiempo máximo por consulta y pocas conexiones.
alter role lector_externo set default_transaction_read_only = on;
alter role lector_externo set statement_timeout = '30s';
alter role lector_externo connection limit 5;

-- Empezar de cero y dar únicamente lo necesario.
revoke all on all tables in schema public from lector_externo;
revoke create on schema public from lector_externo;
grant usage on schema public to lector_externo;

grant select on
  public.films,
  public.film_locations,
  public.film_festivals,
  public.festivals,
  public.organizations,
  public.people,
  public.site_settings
to lector_externo;

-- Tablas que NO se dan (contienen correos, hashes o material interno):
--   team_allowlist, profiles, submissions, info_requests, imports, import_questions.
