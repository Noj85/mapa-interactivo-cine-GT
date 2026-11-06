-- Locaciones fuera de Guatemala: una producción guatemalteca puede haberse rodado en otro país.
-- Esa locación no tiene departamento ni municipio; se guarda con país (y ciudad o lugar).
-- Una locación con `country` distinto de Guatemala se muestra en la zona «Rodadas fuera de Guatemala»
-- y no cuenta como «Sin ubicación». Aplicar después de 0013.

alter table public.film_locations add column if not exists country text;
alter table public.film_locations add column if not exists city text;
