import Link from "next/link";
import type { ReactNode } from "react";

/** Manual básico de la consola: lo que el equipo necesita para operar el mapa sin abrir el README técnico. */
export default function ManualPage() {
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl tracking-tight">Manual de la consola</h2>
      <p className="mt-1 text-sm text-muted">
        Guía corta para el equipo de la Academia. El mapa público está en la página de inicio; todo lo que se publica o se oculta pasa por esta consola.
      </p>

      <Section title="1. Entrar">
        <p>
          Abre <Link className="text-accent underline underline-offset-2" href="/admin">/admin</Link> e inicia sesión con la cuenta del equipo. Sin sesión no se edita nada.
        </p>
      </Section>

      <Section title="2. Ver el mapa con borradores">
        <p>
          En <Link className="text-accent underline underline-offset-2" href="/admin">/admin</Link> ves el mismo mapa que el público, más los borradores. Las cifras apagadas para el público aparecen marcadas «Oculta al público».
        </p>
      </Section>

      <Section title="3. Producciones y entidades">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Lista y edición: <Link className="text-accent underline underline-offset-2" href="/admin/peliculas">Producciones</Link> y{" "}
            <Link className="text-accent underline underline-offset-2" href="/admin/entidades">Entidades</Link>.
          </li>
          <li>Cada ficha puede estar publicada (en el mapa) u oculta (borrador). Se puede publicar u ocultar varias a la vez.</li>
          <li>Indica siempre la fuente cuando registres o completes datos (enlace, catálogo, contacto, etc.).</li>
          <li>
            Locaciones: departamento o municipio (códigos oficiales), o sitio y coordenadas si los tienes. Lo rodado fuera de Guatemala se marca como tal.
          </li>
        </ul>
      </Section>

      <Section title="4. Cargar archivos">
        <p>
          En <Link className="text-accent underline underline-offset-2" href="/admin/cargar">Cargar</Link> puedes importar CSV, Excel, Word o PDF. El sistema propone un mapeo de columnas, detecta duplicados y deja revisar cada fila antes de publicar. Nada entra al mapa sin tu aprobación.
        </p>
      </Section>

      <Section title="5. Aportes del público">
        <p>
          En <Link className="text-accent underline underline-offset-2" href="/admin/aportes">Aportes</Link> llegan propuestas nuevas y correcciones. Revísalas una a una: puedes aceptar todo, solo algunos campos o rechazar. Hasta que apruebes, el registro publicado no cambia.
        </p>
      </Section>

      <Section title="6. Pedir información con enlace privado">
        <p>
          Desde una producción incompleta puedes enviar un enlace con clave a dirección o producción. Quien lo abre completa lo que falta sin entrar a la consola. El aporte vuelve a Aportes para tu revisión. Los enlaces vencen a los 30 días.
        </p>
      </Section>

      <Section title="7. Descargas y ajustes del mapa público">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Descarga filtrada: <Link className="text-accent underline underline-offset-2" href="/descargas">/descargas</Link> (CSV o Excel). Desde el resumen del admin también hay descargas rápidas con borradores.
          </li>
          <li>
            <Link className="text-accent underline underline-offset-2" href="/admin/ajustes/cifras">Cifras públicas</Link>: qué totales ve el público.
          </li>
          <li>
            <Link className="text-accent underline underline-offset-2" href="/admin/ajustes/mapa">Zona del mapa</Link>: solo Guatemala o también los países vecinos.
          </li>
          <li>
            <Link className="text-accent underline underline-offset-2" href="/admin/ajustes/festivales">Festivales</Link>: catálogo para sugerir al registrar.
          </li>
        </ul>
      </Section>

      <Section title="8. Estadísticas de visitas">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Link className="text-accent underline underline-offset-2" href="/admin/visitas">Visitas</Link> (menú superior) muestra cómo se usa el sitio público. Elige el periodo arriba a la derecha: Hoy, 7, 30, 90 días o Todo.
          </li>
          <li>Las tarjetas comparan con el periodo anterior (flecha verde sube, roja baja). La gráfica cambia de métrica con las pestañas y muestra el detalle al pasar el cursor.</li>
          <li>«Visitantes únicos» cuenta personas distintas por día: quien vuelve otro día suma otra vez.</li>
          <li>No se cuentan las visitas del equipo con sesión iniciada, los robots ni quien activa «No rastrear». No se guarda la IP ni se usan cookies.</li>
          <li>Si la página avisa que no puede leer las estadísticas, falta aplicar la migración <code>0023_analytics.sql</code> en Supabase.</li>
        </ul>
      </Section>

      <Section title="9. Buenas prácticas">
        <ul className="list-disc space-y-1 pl-5">
          <li>Publica cuando el dato esté verificado; si duda, déjalo en borrador.</li>
          <li>El porcentaje de completitud orienta qué falta; no obliga a llenar todo para publicar.</li>
          <li>Las producciones sin locación aparecen en el marcador «Sin locación»; las rodadas fuera, en «Fuera de Guatemala».</li>
        </ul>
      </Section>

      <p className="mt-10 text-xs text-muted">
        Para detalle técnico (arquitectura, migraciones, despliegue) ver el README del repositorio y la documentación entregada a la Academia.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted [&_b]:font-medium [&_b]:text-ink">{children}</div>
    </section>
  );
}
