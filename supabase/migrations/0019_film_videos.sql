-- Enlaces de video de cada película: tráiler y película completa, con la miniatura guardada en nuestro almacenamiento.

alter table public.films add column if not exists trailer_url text;
alter table public.films add column if not exists trailer_thumb text;
alter table public.films add column if not exists film_url text;
alter table public.films add column if not exists film_thumb text;
