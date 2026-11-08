"use client";

import { useEffect, useRef, useState } from "react";
import { posterThumb } from "@/lib/poster-url";
import { cn } from "@/lib/utils";

/**
 * Póster con su proporción real: la interfaz fija el alto (`heightClass`) y el ancho sale de la propia imagen,
 * sin recortar ni estirar. `maxWidthClass` solo frena pósters extremadamente anchos.
 *
 * Usa la miniatura (con respaldo al archivo grande); con `full` usa siempre el archivo grande.
 * Mientras carga, el marco ocupa un 2:3 para que la página no salte.
 */
export function PosterImage({
  src,
  alt = "",
  heightClass,
  maxWidthClass = "max-w-[14rem]",
  className,
  full,
  loading = "lazy",
  onBroken,
}: {
  src: string | null | undefined;
  alt?: string;
  /** Clase de Tailwind con el alto, por ejemplo `h-14`. */
  heightClass: string;
  maxWidthClass?: string;
  /** Borde, redondeo y fondo del marco. */
  className?: string;
  full?: boolean;
  loading?: "lazy" | "eager";
  /** Se llama si la imagen no carga (para mostrar un ícono en su lugar). */
  onBroken?(): void;
}) {
  const first = full ? src : posterThumb(src) ?? src;
  const [url, setUrl] = useState(first);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  // otra imagen: se vuelve a empezar
  useEffect(() => {
    setUrl(first);
    setLoaded(false);
    setBroken(false);
  }, [first]);

  // una imagen en caché puede haber cargado antes de que React la escuche
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) setLoaded(true);
  }, [url]);

  if (!url || broken) return null;
  return (
    <span className={cn("inline-flex w-fit shrink-0 overflow-hidden", heightClass, maxWidthClass, !loaded && "aspect-[2/3]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={url}
        alt={alt}
        loading={loading}
        className="block h-full w-auto max-w-full object-contain"
        onLoad={() => setLoaded(true)}
        onError={() => {
          // la miniatura puede no existir: se prueba con el archivo grande
          if (src && url !== src) setUrl(src);
          else {
            setBroken(true);
            onBroken?.();
          }
        }}
      />
    </span>
  );
}
