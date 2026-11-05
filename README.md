# Mapa del Cine de Guatemala

Mapa público e interactivo de la Academia de Cine de Guatemala: dónde se rueda, se exhibe y se produce el cine, por departamento (22), municipio (340) y locación. Tres capas: **Producción**, **Circulación** (taxonomía del Atlas del Círculo de Industria) e **Industria**.

El equipo de la Academia entra con usuario y contraseña y carga datos a mano o con un archivo CSV/Excel en cualquier formato: Claude entiende las columnas, ubica los lugares con los códigos del INE, detecta duplicados y pregunta lo que falte. Lo incompleto se publica marcado como incompleto.

## Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:3000
```

Sin ninguna variable de entorno funciona en **modo local**: los datos se guardan en `.data/db.json`, el panel del equipo está abierto en desarrollo y el mapa arranca vacío hasta que agregues datos desde `/admin/agregar` (un archivo o a mano).

## Variables de entorno

Copia `.env.example` a `.env.local` (o configúralas en Vercel).

| Variable | Para qué |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Base de datos y login del equipo (Supabase). Sin ellas se usa el modo local. |
| `ANTHROPIC_API_KEY` | Activa el análisis con Claude en la carga inteligente. Sin clave se usa un reconocimiento básico de columnas y de PDF. |
| `ANTHROPIC_MODEL` | Opcional. Modelo de Claude a usar (por defecto `claude-sonnet-5`). |
| `ADMIN_PASSWORD` | Modo local: contraseña única del equipo. Defínela en `.env.local` (nunca en `.env.example`, que se sube al repositorio). En desarrollo, si no está definida, `/admin` queda abierto. Reinicia `next dev` después de cambiarla. |

## Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el editor SQL ejecuta, **en orden**, las seis migraciones de `supabase/migrations/`:
   - `0001_init.sql`: tablas, políticas RLS y perfiles.
   - `0002_posters.sql`: campo del póster y bucket público `posters` en Storage.
   - `0003_submissions.sql`: aportes del público.
   - `0004_images_public.sql`: logo de las entidades y bucket `aportes` para las imágenes que sube el público.
   - `0005_submissions_required.sql`: la fuente (≥ 8 caracteres) y un correo válido pasan a ser obligatorios en los aportes del público.
   - `0006_org_categories.sql`: varias categorías por entidad (`organizations.categories`). **Sin esta migración, guardar entidades falla.**
3. En *Authentication → Users* crea a las personas del equipo; en la tabla `profiles` asígnales el rol `admin` o `editor`. En *Authentication → Sign In / Providers → Email* desactiva «Allow new users to sign up» para que nadie más pueda crear cuentas.
4. En *Authentication → URL configuration* agrega la URL de producción y `/auth/callback` para el enlace mágico y para recuperar la contraseña.

Contraseña olvidada: en `/admin` se pulsa «Olvidé mi contraseña», llega un correo con un enlace que abre la sesión y lleva a `/admin/restablecer`, donde se elige la nueva (mínimo 10 caracteres). Para que el correo llegue, la dirección `https://tu-sitio/auth/callback` debe estar en las redirecciones permitidas; el correo integrado de Supabase envía pocos mensajes por hora (para uso real conviene configurar un SMTP propio).

La lectura pública solo ve registros con `status = 'published'`. Escribir exige una sesión del equipo (RLS).

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Agrega las variables de entorno de arriba.
3. Deploy. `npm run build` copia el worker de MapLibre a `public/vendor/maplibre/` automáticamente.

## Carga de datos

«Agregar datos → Cargar archivo» (`/admin/cargar`) guía cuatro pasos: **archivo → lo que entendimos → revisión → preguntas**. Nada se publica sin revisión.

### PDF

Además de CSV y Excel, el asistente acepta **PDF** (catálogos, directorios, listados, hasta 25 MB). El PDF se convierte en filas (nombre, categoría, lugar, contacto, página del PDF…) y sigue el mismo camino de revisión.

- **Con `ANTHROPIC_API_KEY`**: Claude lee el PDF por partes de 6 páginas (texto, tablas y maquetación en columnas) y entrega producciones y entidades. Solo transcribe lo que el documento dice; lo que no aparece queda vacío. Un PDF largo puede tardar un par de minutos (la ruta permite hasta 300 s; en Vercel eso requiere un plan que lo soporte, y las peticiones están limitadas a ~4.5 MB).
- **Sin clave**: lectura básica de dos maquetaciones: *fichas* (un nombre en letra grande y datos con etiquetas que se repiten, como un directorio de servicios) y *tablas* con fila de encabezados. Si no reconoce ninguna, lo dice y sugiere Excel o activar Claude.
- Los PDF escaneados (solo imagen) no tienen texto: la lectura básica no los entiende.


### Primera carga

El mapa arranca vacío y se llena desde cero: entra a `/admin/agregar` y sube un archivo (CSV, Excel o PDF) o registra una producción o entidad a mano. El proyecto no trae datos de producciones ni entidades; solo trae el catálogo base de festivales (ver «Festivales y premios»). Las producciones sin lugar de rodaje salen en la zona **«Sin ubicación»** del mapa (ver abajo) hasta que les agregues sus locaciones desde `/admin/peliculas`; el botón «Publicar todas» de esa pantalla publica de una vez los borradores que ya tienen título.

## Dos partes: mapa público y equipo

La app es una sola, con dos áreas separadas. **`/` siempre es el mapa público**, incluso si tienes sesión del equipo. **`/admin` es la única puerta del equipo**: sin sesión muestra el acceso (la URL no cambia, no existe `/login`); con sesión muestra el mismo mapa con borradores, botón «Editar» y la barra de herramientas . El menú del equipo tiene cinco opciones: **Mapa**, **Resumen** (`/admin/resumen`: cifras y lo que falta), **Aportes**, **Agregar datos** (`/admin/agregar`: cargar un archivo, o registrar una producción o entidad a mano, más las cargas recientes) y **Registros** (`/admin/peliculas` y `/admin/entidades`, con pestañas Producciones | Entidades, para revisar, editar y publicar). Aparte, el engranaje **Ajustes** (`/admin/ajustes`, arriba a la derecha, no es una sexta opción del menú) reúne la configuración: hoy el catálogo de **Festivales**; ya se ven, desactivadas y con la etiqueta «Pronto», Categorías y países, Cambiar mi contraseña, Usuarios administradores, Roles y permisos, Vigencia y mensaje de las solicitudes, Respaldo y exportación e Historial de cambios. Los intentos de entrada están limitados por IP y `/admin` no se indexa.

| | Mapa público (`/`, `/descargas`, `/aportar`) | Equipo (`/admin/*`) |
|---|---|---|
| Quién | Cualquier persona, sin cuenta | Solo el equipo (login) |
| Qué hace | Explorar el mapa, descargar datos filtrados, **aportar** | Revisar aportes, cargar archivos (CSV/Excel/PDF), editar producciones y entidades, preguntas pendientes, pósters, exportar para informes |

**Aportes del público.** En `/aportar` cualquiera puede sugerir una producción o entidad nueva (con varias locaciones), y desde la ficha de cada registro, «Sugerir corrección» abre el mismo formulario con los datos actuales. Nada se publica de inmediato: el aporte queda **pendiente** en `/admin/aportes`, donde el equipo ve los datos propuestos (en una corrección, lo que cambia frente al registro actual) y puede **aprobar y publicar**, **aprobar como borrador y editar**, **aplicar la corrección** o **rechazar** con una nota. El número de pendientes aparece en el menú y en el resumen.

- Solo registros individuales: el público no puede subir archivos (Excel, CSV, PDF). `/api/aportes` rechaza todo lo que no sea JSON, y las cargas masivas exigen sesión del equipo. Quien quiera aportar una base de datos escribe a contacto@academiadecinegt.org.
- Sin cuenta: la **fuente** (un enlace, un catálogo o cómo se sabe) y un **correo** son obligatorios para enviar, de modo que la curaduría pueda corroborar los datos; el correo solo lo ve el equipo. Protecciones: campo trampa, tiempo mínimo, límite de 10 aportes por hora por IP, texto sin HTML y enlaces solo http(s). Los aportes **nunca** tocan los registros publicados hasta que se aprueban.
- Con Supabase, aplica `supabase/migrations/0003_submissions.sql`: el público solo puede insertar aportes «pendientes»; leer, aprobar o borrar es solo del equipo.

## Lugar, categorías y contacto

- **Lugar**: siempre es *Departamento → Municipio* (con la lista del INE) y una **dirección exacta** opcional. Vale igual para locaciones de producciones y para entidades. En el mapa de «Elegir en el mapa» se ven ciudades y calles, hay vista satelital y se centra en el lugar elegido.
- **Categorías**: una entidad puede tener varias (por ejemplo, producción, posproducción y efectos especiales). La primera es la principal; es la que usan el color y el resumen, y el resto cuenta en filtros y descargas. En archivos importados se pueden separar con «;», «,» o «/».
- **Contacto**: teléfono y/o correo, en campos separados. Los teléfonos de Guatemala se guardan como `+502 5555 1234`; los extranjeros con su código de país. En archivos importados se extraen y estandarizan, y lo que no sea teléfono ni correo (nombres, notas) se avisa en la revisión y no se guarda.

## Varias locaciones y producciones «Sin ubicación»

- Una producción puede tener **todas las locaciones que haga falta** (cada una con su lugar, sitio, días, inversión local y empleos). En el editor: «Agregar locación», o «Pegar varios lugares» para escribir una lista (uno por línea o separados por «;») que se resuelve con los códigos del INE. En un archivo importado, una fila por locación.
- Las producciones **sin lugar de rodaje** ya no quedan ocultas: con tener título se publican y se muestran en una zona punteada «Sin ubicación» en el Pacífico, fuera del territorio de Guatemala, para que se entienda que no tienen ubicación. Tocarla abre la lista de esas producciones (`?sinlugar=1`), y la vista general avisa cuántas son. Al agregarles un lugar pasan solas al mapa.

## Publicar o no en el mapa

En **Registros** (`/admin/peliculas` y `/admin/entidades`) cada fila tiene un interruptor **En el mapa**, hay búsqueda, filtros (estado, completitud, categoría, origen…) y casillas para aplicar «Publicar» o «Ocultar» a varias filas a la vez. Lo que ves como registrado en el equipo puede ser más que lo que se muestra en el mapa público: solo aparece lo publicado.

## Solicitar información (recopilación)

Desde el editor de una producción o entidad, o desde varias filas seleccionadas, el botón **Solicitar información** genera un **enlace privado** (`/completar/<código>`) y una **clave** de 5 caracteres alfanuméricos (sin 0/o ni 1/l/i, se muestra una sola vez) y arma un mensaje corto y cordial, listo para copiar y pegar en WhatsApp o correo, que presenta a PROCINE (proyecto de fortalecimiento del sector cinematográfico) y a la Academia de Cine de Guatemala (que lo ejecuta). El mensaje no incluye la dirección del mapa, solo el enlace privado. El enlace sirve varias veces hasta que venza o lo revoques (panel «Solicitudes» del registro). Quien lo abre escribe la clave y ve el formulario con los datos actuales, resaltando lo que falta. Lo que envía llega a `/admin/aportes` con origen **recopilación**; nada se publica hasta que lo apruebes («Aplicar y poner en el mapa»). Los códigos se guardan con hash y las claves con bcrypt, con bloqueo tras 10 intentos fallidos. Requiere `supabase/migrations/0007_info_requests.sql`.

## Director/a, productor/a y casas productoras

«Director/a» es la persona que dirigió la producción y «Productor/a» la persona productora; ninguno es una dirección física. Las **casas productoras** (empresas) son una lista aparte, con su país, y lo que se pide depende de la nacionalidad elegida: en una producción **guatemalteca** solo el nombre (el país es Guatemala); en una **coproducción internacional** o **extranjera**, nombre y país de cada casa, tantas como haga falta (el país sugiere una lista, pero se puede escribir cualquiera). Se ven en la ficha, en las descargas y en la búsqueda, y suman a la completitud como «Casa productora». En archivos importados, las columnas «Productora», «Casa productora» o «Empresa» van a casas productoras (varias separadas por «;», con el país entre paréntesis o en una columna «País de la productora»), y «Productor/a» a la persona. Requiere `supabase/migrations/0009_film_companies.sql`.

## Festivales y premios

Cada producción puede tener **varias entradas de festival** (festival, año, resultado —selección, premio, mención…—, sección, premio, enlace, país y ciudad), igual que las locaciones. Se ven en la ficha y en las descargas, no en los filtros del mapa, y no cuentan en la completitud. Al escribir el nombre aparecen sugerencias de un **catálogo** de festivales, pero se puede escribir cualquiera a mano: al aprobar un aporte, los festivales nuevos se agregan al catálogo. Administra el catálogo en **Ajustes → Festivales**, `/admin/ajustes/festivales` (buscar, editar, fusionar duplicados). El catálogo es una lista de referencia y **no es la capa Circulación**; aun así, cada entrada puede vincularse a una entidad de Circulación con categoría «Festivales» (ver abajo).

Aplica `supabase/migrations/0008_festivals.sql` y luego pulsa **Cargar catálogo base** en Ajustes → Festivales: importa `data/festivals.seed.json` (unos 3,300 festivales). Ese archivo se generó con `node scripts/seed-festivals.mjs <csv>` a partir de la «Festival library» de Film Circulation (Zenodo, [zenodo.org/records/7887672](https://zenodo.org/records/7887672)), licencia **CC BY 4.0**; la atribución está en `/creditos`.

### Vínculo con Circulación

Con `supabase/migrations/0010_festival_org_link.sql` (después de 0007, 0008 y 0009), una entrada del catálogo puede enlazarse con **una** entidad de Circulación de categoría «Festivales». El vínculo es opcional y no cambia filtros ni completitud del mapa:

- Al guardar (o aprobar, o importar) una entidad con categoría «Festivales», se vincula sola: si el catálogo tiene un festival con su mismo nombre o alias lo enlaza; si no hay nada parecido, crea la entrada (país Guatemala, fuente «Circulación»); si solo hay entradas parecidas, no decide y la deja «sin vincular» para revisar.
- **Sincronizar con Circulación** (en Ajustes → Festivales) hace lo mismo con las entidades que ya existían y muestra cuántas se vincularon, cuántas se crearon y cuáles quedan por revisar a mano (con botones «Vincular con…» o «Crear entrada nueva»).
- En la tabla: columna **En el mapa** (entidad vinculada y si está publicada), **Vincular / Desvincular** por fila y filtro Todos | Vinculados | Sin vincular.
- En el mapa público, el nombre de un festival vinculado en la ficha de una producción abre la entidad (si está publicada), y la ficha de la entidad muestra **Producciones que participaron** (año, resultado y sección).
- Fusionar festivales conserva el vínculo; eliminar la entidad deja la entrada del catálogo sin vínculo.

## Filtros del mapa

En el mapa, el desplegable «Todo el país» (debajo de las capas) acerca la cámara a un departamento, atenúa el resto del país y deja en el mapa y en el panel solo lo de ese departamento. El filtro vive en la URL (`?lugar=d9`), así que se puede compartir; la «×» o «Todo el país» lo quita.

Junto al departamento hay un botón **«Filtros»** que abre un panel compacto. Sin filtros el mapa no muestra nada más; los filtros se **añaden a la carta** («+ Añadir filtro») y se quitan con la «×»:

- **Producción:** tipo de obra, nacionalidad, año, presupuesto (con moneda), días de rodaje, inversión local, empleos, «solo con todas las locaciones ubicadas» y búsqueda por texto.
- **Circulación e Industria:** categoría (varias), naturaleza y búsqueda por texto.
- **Medir por** (solo Producción): producciones, días de rodaje, inversión local o empleos; cambia los colores y la leyenda.
- Los filtros se aplican al mapa, la leyenda y los paneles, y viven en la URL con los mismos parámetros que `/descargas` (`clase`, `desde`, `presupuesto_min`, `dias_min`, `categoria`…, más `metrica`), así que «Copiar enlace de esta vista» y «Descargar estos datos» llevan exactamente lo que se ve. Los enlaces anteriores con `?categoria=` siguen funcionando.

## Pósters

Una producción tiene un póster (`poster_url`). Hay tres formas de subirlo y todas pasan por `/api/posters`, que valida que sea una imagen real (JPG, PNG o WebP, hasta 5 MB), la endereza, y guarda dos WebP: póster de 900 px y miniatura de 400 px.

1. **Una por una**: en el editor de la producción, arrastra la imagen al recuadro «Póster».
2. **En lote**: en `/admin/peliculas`, «Subir pósters en lote» y suelta muchas imágenes. El nombre del archivo debe coincidir con el título o el slug (`la-llorona.jpg` para «La Llorona»).
3. **Con la carga de archivos**: si el Excel trae una columna «Póster (URL)», el asistente la reconoce, descarga cada imagen y la guarda como archivo propio.

Con Supabase los archivos van al bucket público `posters`; en modo local, a `.data/uploads/`.

### Logos de entidades y fotos en los aportes

- Una entidad tiene un **logo** (`logo_url`): se sube en el editor de la entidad (o en `/aportar`), se guarda en WebP (512 px, miniatura de 128 px, con transparencia) y se ve en la ficha, en las listas, en la tabla de `/admin/entidades` y como **marcador sobre el mapa** solo para la entidad abierta. Ni el póster ni el logo cuentan para la completitud.
- `/aportar` usa **la misma interfaz que el panel** (mismos campos, locaciones con punto en el mapa, días, inversión y empleos, póster y logo). Las imágenes del público pasan por `/api/aportes/imagen`: solo JPG, PNG o WebP de hasta **3 MB** (el equipo, hasta 5 MB); SVG y demás formatos se rechazan, todo se re-codifica con `sharp` y hay un límite de 6 imágenes por hora por IP. Un aporte solo acepta imágenes que ya estén en nuestro almacenamiento (nunca enlaces externos).
- Al **aprobar**, el póster o logo queda en el registro (en una corrección solo reemplaza al actual si el aporte trae uno nuevo); al **rechazar**, las imágenes subidas se borran. La pantalla de revisión muestra la imagen propuesta y, en correcciones, actual → propuesta.
- Con Supabase aplica `supabase/migrations/0004_images_public.sql`: agrega `organizations.logo_url` y el bucket público `aportes` (el público solo puede subir WebP/JPG/PNG de hasta 3 MB; solo el equipo reemplaza o borra).

## Descargas con filtros

La página `/descargas` es pública: cualquiera elige entre **Producciones**, **Circulación** o **Entidades** (la industria), filtra y baja un CSV o un Excel. Los mismos filtros funcionan como parámetros de `/api/export`, así que un enlace sirve para informes que se actualizan solos:

```
/api/export?tipo=producciones&depto=17&formato=xlsx
/api/export?tipo=producciones&nacionalidad=guatemalteca&presupuesto_min=1000000&moneda=GTQ
/api/export?tipo=producciones&filas=locaciones&muni=101&desde=2015
/api/export?tipo=circulacion&categoria=Festivales
```

| Parámetro | Valores |
| --- | --- |
| `tipo` | `producciones` (por defecto), `circulacion` (festivales, salas, cineclubs…), `entidades` (capa de industria) |
| `filas` | solo en producciones: `producciones` (por defecto) o `locaciones` (una fila por lugar de rodaje) |
| `formato` | `csv` (por defecto), `xlsx` (con hoja «Léeme» que lista los filtros aplicados) |
| `depto`, `muni` | códigos INE separados por coma (basta con que una locación esté ahí) |
| `clase` | `ficcion`, `documental`, `serie`, `comercial`, `corto`, `otro` |
| `nacionalidad` | `guatemalteca`, `coproduccion`, `extranjera` |
| `desde`, `hasta` | año |
| `presupuesto_min`, `presupuesto_max`, `moneda` | monto y `GTQ` o `USD` (otra moneda se compara a Q 7.70 por dólar); solo salen producciones con presupuesto registrado |
| `completas=1` | solo producciones con todas las locaciones ubicadas en un municipio |
| `q` | texto en título, director/a, productor/a o casa productora (o nombre y descripción en entidades) |
| `categoria`, `iniciativa` | solo para `tipo=circulacion` y `tipo=entidades` |
| `borradores=1` | incluye borradores; solo con sesión del equipo |

Los enlaces anteriores (`tipo=peliculas`, `tipo=locaciones`, `tipo=entidades&capa=circulacion`) siguen funcionando; `tipo=entidades` ahora trae solo la industria. Sin sesión sale únicamente lo publicado. En el mapa, el panel de cada lugar y la vista general tienen un botón «Descargar» que abre esta página con los filtros ya puestos, y la fila de categorías también filtra la capa de Producción por tipo de obra.

## Identidad visual

Tipografía: **Biennale** (archivos en `fonts/biennale/`, cargados con `next/font/local` en `app/layout.tsx`) en toda la interfaz. **Es temporal** (demostrativa, hasta tener la tipografía institucional de PROCINE): es una fuente comercial, no está licenciada para redistribución y debe reemplazarse antes del lanzamiento. Texto en Regular (400), etiquetas y botones en Medium/SemiBold, títulos en SemiBold (h1 en Bold); también están Hair, Thin, Ultra Light, Light, Book, Heavy y Black, cada una con su cursiva. Las etiquetas dibujadas dentro del mapa (nombres de pueblos y rutas) vienen del servidor de mapas y no pueden usar esta fuente. Paleta azul marino institucional con modo claro y oscuro (sigue la preferencia del sistema hasta que alguien elige; se recuerda en el navegador). Los colores viven como variables en `app/globals.css`; los de las capas del mapa, en `lib/map/colors.ts`.

## Exportación para informes (equipo)

Desde `/admin` el equipo descarga también los borradores (`borradores=1`).

## Geodatos

Los límites vienen de `public/geo/` (departamentos, municipios con código INE, lagos, país). Para regenerarlos: `npm run geo:build`. Los mapas base son de [OpenFreeMap](https://openfreemap.org) y la vista satelital de Esri.

## Estructura

- `components/map/`: MapLibre (coropletas, clusters, rutas de rodaje).
- `components/explorer/`: la experiencia pública (paneles, buscador ⌘K, leyenda, filtros).
- `components/import/` y `lib/import/`: asistente de carga y su lógica.
- `lib/claude/`: llamadas a Claude (mapeo de columnas y resolución de lugares).
- `lib/data/`: almacén (Supabase o archivo local).
- `app/admin/`: panel del equipo.

## Licencia y créditos

- **Código propio:** © Javier Oswaldo Borrayo Mazariegos, todos los derechos reservados (ver [`LICENSE`](LICENSE)). No es software libre: copiarlo, modificarlo o distribuirlo requiere autorización escrita o un acuerdo firmado.
- **Componentes de terceros:** las librerías de código abierto conservan sus licencias (MIT, BSD, Apache-2.0, ISC y LGPL para los binarios de libvips que usa `sharp`). Sus avisos están en [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) y en `public/licencias.txt`. Se generan con `npm run licenses`; vuelve a correrlo cuando cambien las dependencias y sube los dos archivos.
- **Datos y marcas:** los datos del mapa y los logotipos son de la Academia de Cine de Guatemala y PROCINE.
- **En el sitio:** la página `/creditos` («Créditos y licencias») reconoce la autoría, los datos, los mapas (© colaboradores de OpenStreetMap, OpenFreeMap, OpenMapTiles, Esri, MINFIN / INE) y las librerías; está enlazada desde el pie de página y desde la atribución del mapa.
