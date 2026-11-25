# Mapa del Cine de Guatemala

Mapa público e interactivo de la Academia Guatemalteca de Artes y Ciencias Cinematográficas: dónde se filma, dónde se ve y quién hace cine en Guatemala, por departamento (22), municipio (340) y locación. Tres capas: **Producción**, **Circulación** (taxonomía del Atlas del Círculo de Industria) e **Industria**.

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
| `NEXT_PUBLIC_SITE_URL` | URL pública del sitio, sin `/` al final. Se usa en las imágenes al compartir enlaces; debe existir al construir. En Vercel, si falta, se usa el dominio del proyecto. |
| `ANTHROPIC_API_KEY` | Activa el análisis con Claude en la carga inteligente. Sin clave se usa un reconocimiento básico de columnas y de PDF. |
| `ANTHROPIC_MODEL` | Opcional. Modelo de Claude a usar (por defecto `claude-sonnet-5`). |
| `ADMIN_PASSWORD` | Modo local: contraseña única del equipo. Defínela en `.env.local` (nunca en `.env.example`, que se sube al repositorio). En desarrollo, si no está definida, `/admin` queda abierto. Reinicia `next dev` después de cambiarla. |

## Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el editor SQL ejecuta, **en orden**, las migraciones (las seis primeras abajo; después `0007` a `0020`, ver cada sección) de `supabase/migrations/`:
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

Además de CSV, Excel y Word, el asistente acepta **PDF** (catálogos, directorios, listados, hasta 25 MB). El PDF se convierte en filas (nombre, categoría, lugar, contacto, página del PDF…) y sigue el mismo camino de revisión.

- **Con `ANTHROPIC_API_KEY`**: Claude lee el PDF por partes de 6 páginas (texto, tablas y maquetación en columnas) y entrega producciones y entidades. Solo transcribe lo que el documento dice; lo que no aparece queda vacío. Un PDF largo puede tardar un par de minutos (la ruta permite hasta 300 s; en Vercel eso requiere un plan que lo soporte, y las peticiones están limitadas a ~4.5 MB).
- **Sin clave**: lectura básica de dos maquetaciones: *fichas* (un nombre en letra grande y datos con etiquetas que se repiten, como un directorio de servicios) y *tablas* con fila de encabezados. Si no reconoce ninguna, lo dice y sugiere Excel o activar Claude.
- Los PDF escaneados (solo imagen) no tienen texto: la lectura básica no los entiende.

### Word (.docx)

También se aceptan documentos de **Word** (`.docx`, hasta 15 MB; `/api/import/docx`). El `.docx` se abre en el servidor (`lib/import/docx.ts`, con `fflate`) y se leen sus párrafos, títulos, viñetas y tablas (celdas combinadas resueltas; una tabla de una celda combinada hacia abajo repite su valor en cada fila). Los `.doc` antiguos se rechazan con la instrucción de guardarlos como `.docx`.

- **Tablas**: las que repiten el mismo encabezado (porque el documento las partió) se juntan en una hoja; varias tablas de dos columnas «etiqueta | valor» con etiquetas parecidas son **fichas** y cada una se vuelve una fila. Si las fichas no traen el nombre como etiqueta, se usa el título que las antecede. Esto funciona sin clave.
- **Con `ANTHROPIC_API_KEY`**: si el documento es sobre todo texto corrido o fichas sueltas (o tiene pocas filas en tablas), Claude lee el contenido completo (títulos, viñetas y tablas como filas con «|») por fragmentos de ~30 000 caracteres y entrega producciones y entidades, con los lugares de rodaje y festivales como listas. Si el documento es sobre todo una tabla grande (20 filas o más), se lee la tabla directo, que es más exacta. Si Claude falla, se cae a las tablas.
- Sin clave y sin tablas legibles, lo dice y sugiere Excel o activar Claude. Texto dentro de imágenes, encabezados, pies de página y notas al pie no se leen.


### Formato, naturaleza y géneros al importar

La columna «Tipo», «Formato» o «Categoría» va a formato; «Naturaleza» o «Clase», a naturaleza; y «Género» o «Géneros», a géneros (ya no al tipo de obra). Una misma columna puede alimentar varios campos: un «Tipo» con «Largometraje documental» llena formato y naturaleza, y una columna de géneros que trae «Documental» o «Ficción» pone eso en la naturaleza. Los géneros se separan por `;`, `,`, `/` o `|`, se traducen a la lista estándar (también del inglés: sci-fi, horror, thriller…) y los que no están se conservan como propios. Un formato que no se reconoce no se guarda como «Otro»: se pregunta («¿Qué formato es “Telefilme”?»). En el paso «Lo que entendimos» un aviso lista las columnas del archivo que no se van a usar. En los PDF, Claude también entrega los festivales y los lugares de rodaje como listas (cada uno extra es otra fila con el mismo título) y el país de la casa productora.

### Cómo se interpreta el archivo

Antes de revisar, el asistente deja el archivo en una **tabla normalizada** con las columnas del sistema (`lib/import/normalized.ts`): **Producción** (una fila por locación, con casas productoras, equipo, presupuesto…), **Festivales**, **Circulación** e **Industria**, cada una con las columnas «Origen (filas del archivo)» y «Estado de la carga». En la revisión se ve en **«Vista normalizada»** y se baja con **«Descargar Excel normalizado»**; sus encabezados son los que la carga reconoce sola, así que ese mismo Excel se puede volver a cargar sin ajustes.

Además de tablas simples, la lectura entiende (`lib/import/parse.ts`, `lib/import/heuristic.ts`; funciona sin Claude):

- **Encabezados en dos filas** (grupo arriba, columna abajo, también con celdas combinadas): «Locación 1 | Lugar», «Locación 1 | Días»… Una fila de título encima se ignora.
- **Fichas clave/valor** en Excel (una columna de etiquetas, otra de valores): cada ficha pasa a ser una fila; si la etiqueta del título se repite, hay varias fichas en la hoja. Una etiqueta repetida dentro de una ficha junta sus valores con «; ».
- **Varias locaciones por fila** con grupos de columnas repetidos y numerados («Lugar 1», «Días 1», «Lugar 2», «Días 2», «Segundo lugar»…). El primer grupo usa los campos normales y los siguientes `place__2`, `days__2`, etc.
- **Entidades de Circulación e Industria en la misma hoja**: la capa se decide por la categoría de cada fila.
- **Logo (enlace)** de las entidades y **enlace del festival o premio** (también en PDF/Word con Claude).

A Claude se le manda una muestra de ~60 filas del inicio, el medio y el final del archivo (no solo las primeras), con el catálogo de campos, categorías y formatos y avisos de si la hoja venía en dos filas o como ficha. Si la respuesta se corta (archivos con muchas columnas de lista), se reintenta una vez con una muestra más corta; si aun así no hay plan, se cae al reconocimiento básico de columnas y el aviso dice «la respuesta de Claude llegó incompleta», no el error técnico.

### Campos con varias entradas (locaciones, festivales, casas productoras)

Una celda puede traer varias entradas y todas se importan (`lib/import/multi.ts`, `lib/import/transform.ts`). Los campos repetibles se agrupan en **locación**, **festival** y **casa productora**:

- **Separadores**: `;`, salto de línea y `|` siempre separan. La coma, `/` y « y » dependen de cada columna: en «Lo que entendimos», bajo cada campo con varias entradas, una casilla por separador y un ejemplo de cuántas entradas salen de la primera fila. En lugares la coma se resuelve primero con el catálogo: «Petén, Izabal» son dos locaciones, pero «Panajachel, Sololá» es una sola (el municipio con su propio departamento) y un texto con una parte desconocida se queda entero y se pregunta.
- **Columnas paralelas**: si «Departamentos» trae `Petén; Izabal; …` y «Días» trae `3; 2; …`, la entrada n de una se une con la n de la otra. Un solo valor (año de festival, departamento común) se aplica a todas; otros valores sueltos se quedan en la primera entrada.
- **Columnas de cuenta** («Cantidad de locaciones», «N.º de festivales», «N.º de casas productoras») no crean nada: sirven para validar. Si el archivo dice 5 y se encuentran 3, la revisión avisa («El archivo dice 5 locaciones y encontramos 3…»). También avisa si las columnas paralelas no coinciden en cantidad. En archivos con una fila por locación la cuenta no se valida.
- **Datos dentro de textos** (solo con Claude, **opcional**): Claude propone en «Lo que entendimos» las columnas de texto libre (sinopsis, notas, ficha) donde podría haber locaciones, festivales o casas, y cada una nace **apagada**; la persona la activa. Se leen por lotes de 25 filas (hasta 600 filas) y cada hallazgo debe traer una **cita literal** del texto, o se descarta. Entran a la revisión como **sugerencias sin marcar** («Sugerencias del texto»: cita, origen, «poco segura»), con «Agregar» o «Agregar todas»; nada se guarda sin aceptarlo. Solo cuenta donde se **rodó** (no donde transcurre la historia) y festivales con selección o premio.
- En la revisión cada producción puede abrir «Ver las N locaciones», y cada lugar sin resolver genera su propia pregunta (hasta 60).

### Coincidencias, colisiones y «nunca pisar»

Cada renglón del archivo se compara con lo guardado (incluidos borradores) y con el resto del archivo (`lib/import/duplicates.ts`, `lib/import/transform.ts → mergeInFile`):

- **Producciones**: título sin tildes, sin artículo inicial («La casa» = «Casa») y sin subtítulo; año (±1 cuenta como distinto pero cercano) y director/a (comparten al menos un nombre). **Entidades**: nombre sin artículo ni sufijo legal (S.A.), **misma capa** y municipio.
- Nivel de la coincidencia: **segura** (título casi idéntico y además mismo año, director/a o municipio, sin contradicciones), **probable** (título muy parecido y nada que lo contradiga) y **dudosa** (el año, el director/a o el municipio no cuadran, o hay dos candidatos igual de buenos). Se muestran hasta 3 candidatos.
- Dentro del archivo, lo repetido (otra fila, u otra hoja como «Festivales») se **fusiona** en un solo registro: nunca se crea dos veces. Si dos filas traen valores distintos para lo mismo, se usa el primero y se avisa.
- Locaciones, festivales y casas productoras también se comparan: una locación es la misma si coincide el municipio (o el país y la ciudad) y el sitio es igual o casi (similitud 0,85); un festival es el mismo aunque se escriba más largo o corto («Festival Internacional de Cine de Sundance» = «Sundance») y se une al del catálogo en vez de crear uno parecido; una casa productora se compara sin sufijos legales.

Qué pasa al confirmar (`lib/import/commit-server.ts`; el servidor **vuelve a cotejar** contra lo guardado en ese momento, así que reintentar una carga o subir el mismo archivo dos veces no crea nada nuevo):

- **Nuevo**: se crea.
- **Coincidencia segura o probable**: solo se **completa lo vacío** y se **agregan** elementos (locaciones, festivales, casas, géneros, categorías, póster/logo si no había). Un valor que ya existe **nunca se cambia desde la carga**, y una celda vacía nunca borra.
- **Diferencias** (el archivo trae otro valor que el guardado) y **coincidencias dudosas**: no se aplica ni se crea nada; quedan como aporte de tipo **«Carga de archivo»** en `/admin/aportes` (filtro «Carga de archivo»). La revisión también deja elegir «Enviar a Aportes» o «No, crear nueva».

En Aportes, un aporte «Carga de archivo» se revisa campo por campo: la página recalcula contra el registro **tal como está hoy**, con una casilla por campo (valor actual → valor del archivo, **todo desmarcado**) y solo se aplica lo marcado. En una coincidencia dudosa se elige con cuál de los candidatos se corresponde (o «Es nuevo»). Requiere `supabase/migrations/0017_submission_import.sql` (después de 0016): permite el origen `carga` y agrega `import_id` y `candidates` a `submissions`; solo el equipo los crea. Sin ella, la carga falla al crear aportes (los registros nuevos y los completados se guardan igual, pero conviene aplicarla antes de cargar).

El resumen final dice «N nuevos · N completados · N sin cambios · N enviados a Aportes» y enlaza a los aportes.

### Actualizar producciones que ya existen

Si el archivo trae una producción o entidad parecida a una guardada, la revisión muestra **«Qué se completaría»**:

- **Completa**: campos que estaban vacíos y el archivo llena (la moneda viaja con el presupuesto; el póster y el logo solo si no había; una locación sin municipio se completa en vez de duplicarse).
- **Agrega**: locaciones, festivales, casas productoras y géneros nuevos.
- **Ya tiene otro valor**: se muestra «en el sistema / en el archivo» sin casilla; no se cambia y va a Aportes (ver arriba).

Cada elemento que completa o agrega tiene su casilla. El título y el estado no cambian. Si el archivo no trae nada nuevo, la coincidencia queda en «Omitir» y, aunque se fuerce, el registro no se guarda.

### Primera carga

El mapa arranca vacío y se llena desde cero: entra a `/admin/agregar` y sube un archivo (CSV, Excel, Word o PDF) o registra una producción o entidad a mano. El proyecto no trae datos de producciones ni entidades; solo trae el catálogo base de festivales (ver «Festivales y premios»). Las producciones sin lugar de rodaje salen en la zona **«Sin locación»** del mapa (ver abajo) hasta que les agregues sus locaciones desde `/admin/peliculas`; el botón «Publicar todas» de esa pantalla publica de una vez los borradores que ya tienen título.

## Dos partes: mapa público y equipo

La app es una sola, con dos áreas separadas. **`/` siempre es el mapa público**, incluso si tienes sesión del equipo. **`/admin` es la única puerta del equipo**: sin sesión muestra el acceso (la URL no cambia, no existe `/login`); con sesión muestra el mismo mapa con borradores, botón «Editar» y la barra de herramientas . El menú del equipo tiene cinco opciones: **Mapa**, **Resumen** (`/admin/resumen`: cifras y lo que falta), **Aportes**, **Agregar datos** (`/admin/agregar`: cargar un archivo, o registrar una producción o entidad a mano, más las cargas recientes) y **Registros** (`/admin/peliculas` y `/admin/entidades`, con pestañas Producciones | Entidades, para revisar, editar y publicar). Aparte, el engranaje **Ajustes** (`/admin/ajustes`, arriba a la derecha, no es una sexta opción del menú) reúne la configuración: hoy el catálogo de **Festivales** y las **Cifras públicas** del mapa; ya se ven, desactivadas y con la etiqueta «Pronto», Categorías y países, Cambiar mi contraseña, Usuarios administradores, Roles y permisos, Vigencia y mensaje de las solicitudes, Respaldo y exportación e Historial de cambios. Los intentos de entrada están limitados por IP y `/admin` no se indexa.

| | Mapa público (`/`, `/descargas`, `/aportar`) | Equipo (`/admin/*`) |
|---|---|---|
| Quién | Cualquier persona, sin cuenta | Solo el equipo (login) |
| Qué hace | Explorar el mapa, descargar datos filtrados, **aportar** | Revisar aportes, cargar archivos (CSV/Excel/Word/PDF), editar producciones y entidades, preguntas pendientes, pósters, exportar para informes |

**Aportes del público.** El botón «Aportar al mapa» lleva la capa que se estaba viendo (`/aportar?capa=circulacion`): con Producción abre el formulario de producción; con Circulación o Industria abre el de entidad con esa capa ya elegida. En `/aportar` cualquiera puede sugerir una producción o entidad nueva (con varias locaciones), y desde la ficha de cada registro, «Sugerir corrección» abre el mismo formulario con los datos actuales. Nada se publica de inmediato: el aporte queda **pendiente** en `/admin/aportes`, donde el equipo ve los datos propuestos (en una corrección, lo que cambia frente al registro actual) y puede **aprobar y publicar**, **aprobar como borrador y editar**, **aplicar la corrección** o **rechazar** con una nota. El número de pendientes aparece en el menú y en el resumen.

**Aceptar solo parte de una corrección.** En una corrección a un registro que ya existe (del público o de recopilación), la revisión trae una casilla por cada cambio: cada campo (p. ej. Nacionalidad) y cada locación por separado (agregada, modificada o quitada), más el póster o logo nuevos. Cambios y agregados vienen marcados; quitar o vaciar algo, no. «Aplicar solo lo marcado» aplica únicamente eso sobre el registro **tal como está hoy**; con todo marcado el botón vuelve a ser «Aplicar corrección» y aprueba el aporte entero, como siempre. La nota de revisión deja constancia de lo aplicado y lo no aplicado, y si la imagen propuesta no se acepta se borra. Los registros nuevos se aprueban enteros. No requiere migración: los aportes que ya estaban pendientes se revisan igual.

- Solo registros individuales: el público no puede subir archivos (Excel, CSV, PDF). `/api/aportes` rechaza todo lo que no sea JSON, y las cargas masivas exigen sesión del equipo. Quien quiera aportar una base de datos escribe a contacto@academiadecinegt.org.
- Sin cuenta: la **fuente** (un enlace, un catálogo o cómo se sabe) y un **correo** son obligatorios para enviar, de modo que la curaduría pueda corroborar los datos; el correo solo lo ve el equipo. Protecciones: campo trampa, tiempo mínimo, límite de 10 aportes por hora por IP, texto sin HTML y enlaces solo http(s). Los aportes **nunca** tocan los registros publicados hasta que se aprueban.
- Con Supabase, aplica `supabase/migrations/0003_submissions.sql`: el público solo puede insertar aportes «pendientes»; leer, aprobar o borrar es solo del equipo.

## Lugar, categorías y contacto

- **Lugar**: siempre es *Departamento → Municipio* (con la lista del INE) y una **dirección exacta** opcional. Vale igual para locaciones de producciones y para entidades. En el mapa de «Elegir en el mapa» se ven ciudades y calles, hay vista satelital y se centra en el lugar elegido.
- **Categorías**: una entidad puede tener varias (por ejemplo, producción, posproducción y efectos especiales). La primera es la principal; es la que usan el color y el resumen, y el resto cuenta en filtros y descargas. En archivos importados se pueden separar con «;», «,» o «/».
- **Contacto**: teléfono y/o correo, en campos separados. Los teléfonos de Guatemala se guardan como `+502 5555 1234`; los extranjeros con su código de país. En archivos importados se extraen y estandarizan, y lo que no sea teléfono ni correo (nombres, notas) se avisa en la revisión y no se guarda.

## Varias locaciones, «Sin locación» y «Fuera de Guatemala»

- Una producción puede tener **todas las locaciones que haga falta** (cada una con su lugar, sitio, días, inversión local y empleos). En el editor: «Agregar locación», o «Pegar varios lugares» para escribir una lista (uno por línea o separados por «;») que se resuelve con los códigos del INE. En un archivo importado, una fila por locación, o varias en una misma celda separadas por «;» (ver «Campos con varias entradas»). Los días de rodaje y los empleos se guardan como números enteros: una fracción se redondea a la jornada o al empleo más cercano, el formulario lo avisa al escribirla y la carga de archivos lo deja como duda en la revisión.
- Las producciones **sin lugar de rodaje** no se pierden: con tener título se publican y se agrupan en el marcador «Sin locación» (un pin punteado con «?»), en el Pacífico frente a la costa. Por defecto el mapa muestra solo las producciones **con locación**, así que ese marcador aparece al elegir «Sin locación» o «Todas» en el chip de la lista; el chip muestra cuántas hay en cada opción. Tocar el marcador abre la lista de esas producciones (`?sinlugar=1`). Al agregarles un lugar pasan solas al mapa.
- Una producción guatemalteca puede haberse rodado **en otro país**, y eso **no es «Sin locación»**: sí dice dónde se rodó. En el editor, cada locación tiene la casilla **«Fuera de Guatemala»**, que cambia departamento y municipio por **País** (con sugerencias) y **Ciudad o lugar**. Esas producciones salen en un segundo marcador del Pacífico, un globo con una flecha, más al este que «Sin locación», con la etiqueta «Fuera de Guatemala» y su conteo; tocarla abre la lista agrupada por país (`?fuera=1`). Una producción con locaciones dentro y fuera aparece en el territorio y en la zona. Las locaciones de afuera no suman a departamentos ni a los totales de Guatemala, pero **sí cuentan** para la completitud («Locaciones» deja de faltar y «Municipio por confirmar» las ignora). Las descargas traen las columnas «País (si fue fuera de Guatemala)» y «Ciudad (fuera de Guatemala)».
- Al **importar** (Excel, CSV, Word, PDF), un lugar que nombra otro país («Oaxaca, México», «Madrid - España») se reconoce solo como locación fuera de Guatemala; si el asistente pregunta dónde se rodó una producción, hay una opción «Está fuera de Guatemala» que pide el país.
- **Un municipio distinto por locación.** Dentro de un departamento (en Guatemala), solo cuenta como locación aparte la que tiene un **municipio distinto**: una fila sin municipio es la misma locación (aunque el departamento ya tenga una con municipio), y dos filas del mismo municipio también, sin importar el sitio. Al unir, **nunca se suman cifras**: se conserva la mayor de días, inversión local y empleos, y el sitio y las coordenadas se completan si faltan; la fila con municipio es la que se queda. Un departamento con **dos o más municipios** y además una fila sin municipio queda en **revisión manual** (no se sabe de cuál es duplicada) y no se toca. La regla vive en `lib/locations.ts` y se aplica al guardar (editor, aportes, archivos, fusión de duplicados; el editor avisa antes de guardar) y en la carga de archivos (las filas del archivo y la comparación con lo que ya existe). Las locaciones fuera de Guatemala no se tocan.
- **Unificar lo que ya existe.** En Registros → Producciones, un aviso lleva a `/admin/peliculas/locaciones`: lista las producciones afectadas con lo que se uniría y qué cifras pasarían de una fila a otra, aparte los casos de revisión manual, y permite aplicar a una producción o a todas (con confirmación). Es irreversible; conviene un respaldo de Supabase antes. No requiere migración.
- Requiere `supabase/migrations/0014_location_country.sql` (después de 0013): agrega `country` y `city` a `film_locations`. Sin ella todo lo demás sigue funcionando; solo falla guardar locaciones con país.

## Publicar o no en el mapa

En **Registros** (`/admin/peliculas` y `/admin/entidades`) cada fila tiene un interruptor **En el mapa**, hay búsqueda, filtros (estado, completitud, categoría, origen, **locación** con/sin y, en producciones, **festivales** con/sin…) y casillas para aplicar «Publicar» o «Ocultar» a varias filas a la vez. Lo que ves como registrado en el equipo puede ser más que lo que se muestra en el mapa público: solo aparece lo publicado.

## Solicitar información (recopilación)

Desde el editor de una producción o entidad, o desde varias filas seleccionadas, el botón **Solicitar información** genera un **enlace privado** (`/completar/<código>`) y una **clave** de 5 caracteres alfanuméricos (sin 0/o ni 1/l/i, se muestra una sola vez) y arma un mensaje corto y cordial, listo para copiar y pegar en WhatsApp o correo, que presenta a PROCINE (proyecto de fortalecimiento del sector cinematográfico) y a la Academia Guatemalteca de Artes y Ciencias Cinematográficas (que lo ejecuta). El mensaje no incluye la dirección del mapa, solo el enlace privado. El enlace sirve varias veces hasta que venza o lo revoques (panel «Solicitudes» del registro). Quien lo abre escribe la clave y ve el formulario con los datos actuales, resaltando lo que falta. Lo que envía llega a `/admin/aportes` con origen **recopilación**; nada se publica hasta que lo apruebes («Aplicar y poner en el mapa»). Los códigos se guardan con hash y las claves con bcrypt, con bloqueo tras 10 intentos fallidos. Requiere `supabase/migrations/0007_info_requests.sql`.

**Un enlace para varias producciones del mismo director/a.** Al solicitar una producción, si el director/a tiene otras, el cuadro las lista con casillas (vienen marcadas las que tienen datos pendientes) para sumarlas al mismo enlace; con varias filas seleccionadas, el cuadro las agrupa por director/a y ofrece «Un solo enlace para las N de …» (se puede apagar). Se reconoce al mismo director/a por nombre (sin importar tildes o mayúsculas; «Ana López y Luis Paz» coincide con cualquiera de los dos). Quien abre el enlace ve la lista de sus producciones con lo que falta de cada una y la marca «Enviada», completa cada una por separado (nombre, rol y correo se piden una vez) y cada producción llega a Aportes como su propio aporte, que se aprueba por separado. Hasta 20 producciones por enlace. Los enlaces valen siempre 30 días; el mensaje no menciona la fecha y, si alguien abre uno vencido, la página le pide solicitar uno nuevo. El mensaje es corto y de tú, con el enlace y la clave en líneas separadas. Las entidades siguen de una en una. Requiere `supabase/migrations/0013_info_request_multi.sql` (después de 0012); sin ella, las solicitudes de una sola producción siguen funcionando, pero no las consolidadas.

## Duración en minutos

Cada producción guarda su duración en minutos (entero de 1 a 2000, opcional). Se captura en el campo «Duración (min)» del formulario (admin y aportes), aparece en la ficha y las tarjetas («95 min»), viaja en los aportes del público y se descarga como columna «Duración (min)» en las hojas de producciones, locaciones y festivales. No cuenta en la completitud ni tiene filtro.

Al importar, la columna «Duración», «Minutos», «Runtime» o «Metraje» va a este campo (una «Duración del rodaje» sigue siendo lugar o días). Se entiende «95», «95 min», «1h 35min», «1,5 h», «01:35:00» y «1:35»; con dos partes, un primer número de 1 a 4 son horas y uno mayor son minutos y segundos. Si en el paso «Lo que entendimos» una columna quedó sin asignar, escribe en «Instrucciones para el análisis» algo como «la columna Minutos es la duración de la producción» y pulsa «Volver a analizar». En una producción que ya existe sin duración, aparece como «completar»; si ya tenía otra distinta, como conflicto.

Requiere `supabase/migrations/0012_film_duration.sql` (después de 0011). **Sin esta migración, guardar producciones falla.**

## Formato, naturaleza y géneros

Cada producción se describe con tres datos distintos:

- **Formato** (uno): largometraje, mediometraje, cortometraje, serie, miniserie, video musical, publicidad / comercial, programa de TV, contenido web / digital, videoarte u otro.
- **Naturaleza** (una, opcional, aplica a cualquier formato): ficción, documental o híbrido.
- **Géneros** (varios, hasta 8): los estándar de festivales (acción, aventura, animación, biográfico, ciencia ficción, comedia, crimen, drama, experimental, familiar, fantasía, guerra, histórico, misterio, musical, noir, romance, suspenso / thriller, terror, western, deportes, música, coming of age, road movie) y **géneros propios** que se escriben a mano (cada uno hasta 40 caracteres, sin repetir aunque cambie la tilde o la mayúscula).

La ficha y las tarjetas muestran la etiqueta combinada («Largometraje documental», «Cortometraje de ficción», «Serie») y los géneros como etiquetas. En el filtro del mapa y de `/descargas` hay tres filtros (formato, naturaleza y género; el género acepta cualquiera de los elegidos y agrupa bajo «Otros» los propios que existan). Las descargas traen tres columnas: «Formato», «Naturaleza» y «Géneros» (separados por «; »). La completitud cuenta **Formato** y **Naturaleza**; los géneros no.

Requiere `supabase/migrations/0011_film_format_genres.sql` (después de 0009 y 0010): agrega `format`, `nature` y `genres`, convierte el antiguo «tipo» (ficción → naturaleza ficción; documental → naturaleza documental; corto → formato cortometraje; serie → formato serie; comercial → formato publicidad; otro → sin formato) y deja la columna `kind` sin uso ni restricción. **Sin esta migración, guardar producciones falla.** Después conviene revisar en `/admin/peliculas` las que quedaron sin formato (filtro «Sin formato (por revisar)»). El modo local (`.data/db.json`) y los aportes guardados antes del cambio se convierten solos al leerlos.

## Director/a, productor/a y casas productoras

«Director/a» es la persona que dirigió la producción y «Productor/a» la persona productora; ninguno es una dirección física. Las **casas productoras** (empresas) son una lista aparte, con su país, y lo que se pide depende de la nacionalidad elegida: en una producción **guatemalteca** solo el nombre (el país es Guatemala); en una **coproducción internacional** o **extranjera**, nombre y país de cada casa, tantas como haga falta (el país sugiere una lista, pero se puede escribir cualquiera). Se ven en la ficha, en las descargas y en la búsqueda, y suman a la completitud como «Casa productora». En archivos importados, las columnas «Productora», «Casa productora» o «Empresa» van a casas productoras (varias separadas por «;», con el país entre paréntesis o en una columna «País de la productora»), y «Productor/a» a la persona. Requiere `supabase/migrations/0009_film_companies.sql`.

**Director/a de fotografía y Guionista** son dos campos de texto más por producción, opcionales: se editan junto a Director/a y Productor/a (equipo, aportes públicos y enlaces de /completar), se ven en la ficha, se buscan, salen como columnas en las descargas y se importan desde columnas como «Director/a de fotografía», «DP», «Fotografía», «Guionista» o «Guion» (y los reconoce Claude en PDF y Word). **No cuentan en el porcentaje de completitud** ni se piden en el mensaje de solicitud de información. Requieren `supabase/migrations/0016_film_crew.sql` (después de 0015); sin ella, guardar producciones falla.

## Equipo, reparto e idiomas

Además de Director/a, Productor/a, Director/a de fotografía y Guionista (que siguen igual, en su cuadrícula), cada producción admite una **lista flexible de equipo** con más roles, un **reparto principal** (con el personaje) e **idiomas**. Los roles están en `lib/crew.ts`, agrupados: imagen (dirección de arte, vestuario, maquillaje…), sonido y música (sonido directo, diseño sonoro, mezcla, música original, supervisión musical), edición y postproducción (edición/montaje, colorización, efectos visuales, animación…), producción y dirección (dirección de producción, asistencia de dirección, casting…), reparto y «Otro rol» (nombre libre). Una persona puede tener varios roles y un rol varias personas.

- **Formulario** (registros, aportes del público, enlaces de /completar): debajo de los cuatro campos de siempre hay la sección plegable «Más equipo y reparto» (cerrada si no hay datos) y, junto a los géneros, los **idiomas** (estándar o propios, hasta 8, como los géneros).
- **Ficha pública:** igual que antes si no hay datos nuevos. Con equipo extra aparece el bloque plegable «Equipo completo», agrupado por área; los idiomas salen como etiquetas junto a los géneros.
- **Filtros y búsqueda:** el filtro **Idioma** solo se ofrece si alguna producción tiene idiomas (mapa y `/descargas`); la búsqueda encuentra a las personas del equipo extra y del reparto.
- **Descargas:** la tabla de producciones suma las columnas «Idiomas», una por cada rol extra que alguna producción use, y «Reparto»; no aparecen columnas vacías.
- **Carga de archivos:** columnas como «Edición», «Montaje», «Sonido», «Música original», «Dirección de arte», «Reparto» o «Idiomas» se reconocen solas (varias personas por celda, separadas por «;»; en reparto, `Nombre (Personaje)`). En el paso «Lo que entendimos» los roles extra van agrupados en el bloque «Equipo y reparto». Con coincidencia con un registro existente solo se **agregan** personas e idiomas que faltan. Claude también extrae estos créditos de PDF y Word. El Excel normalizado que se baja en la revisión se vuelve a cargar sin ajustes.
- **Completitud:** no cambia; el equipo extra, el reparto y los idiomas son opcionales.

**Base de datos.** Requiere `supabase/migrations/0020_film_crew_languages.sql`: agrega `films.crew` (jsonb) y `films.languages` (text[]) y copia a `crew` los cuatro campos de persona que ya existían. Las columnas `director`, `producer`, `cinematographer` y `screenwriter` se siguen escribiendo (texto derivado del equipo) para poder volver atrás. **Aplícala antes de publicar este cambio: sin ella, guardar producciones falla.** En modo local (`.data/db.json`) las producciones se convierten solas al leerlas.

**Títulos en mayúsculas.** Los títulos de las producciones se guardan y se ven siempre en MAYÚSCULAS (con sus acentos: «ÚLTIMO»). La app los estandariza al guardar (editor, aportes, archivos y enlaces de /completar), y `supabase/migrations/0018_film_title_upper.sql` hace dos cosas en la base: pasa a mayúsculas los títulos que ya existían y crea un trigger que lo exige en cada insert o update. Los slugs no cambian y la búsqueda sigue ignorando mayúsculas y acentos. En modo local, `.data/db.json` se estandariza al leerlo.

**Fusionar producciones duplicadas.** En Registros → Producciones, marca dos filas y usa **Fusionar** (o abre el aviso «posibles duplicados», que agrupa las de mismo título y año). La pantalla `/admin/peliculas/fusionar` muestra las dos versiones: eliges cuál **se queda** (conserva su dirección en el mapa; de entrada, la más completa), qué valor conservar en cada campo que difiere (A o B; viene elegido el que tiene dato), el póster, y con casillas qué locaciones, festivales, casas productoras y géneros conservar (lo repetido sale una vez, como «En ambas», y una locación repetida se completa con los datos de la otra). Al confirmar, la que se queda guarda lo elegido y queda en el mapa si cualquiera de las dos lo estaba; los aportes, solicitudes de información y preguntas de carga de la otra pasan a ella; la otra se borra (con sus locaciones y festivales) y se borran los pósters que ya nadie usa. No se puede deshacer. No requiere migración. Los enlaces compartidos con la dirección de la que se borró dejan de abrir esa ficha.

**Locación, no «ubicación».** En todo el sitio se dice «locación» («Sin locación», «Locación pendiente»). Los sinónimos «ubicación» siguen reconociéndose como encabezado al importar archivos.

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

## Mapa público y filtros del equipo

**El mapa público no tiene leyenda.** Junto al desplegable de **departamento** (debajo de las capas, ver abajo) tiene el botón **Filtros**, el mismo del equipo: se agregan filtros uno a uno (formato, naturaleza, género, nacionalidad, año como rango, presupuesto, buscar…) y los enlaces compartidos con filtros (`formato_obra=…`) se abren ya filtrados. En el teléfono es un ícono junto al de departamento. Los filtros de **días de rodaje, inversión local y empleos** solo se ofrecen al público si esa cifra está activada en Ajustes → Cifras públicas. También hay filtros en `/descargas`.

### Cifras de la tarjeta (Ajustes → Cifras públicas)

La tarjeta de la vista general y la de cada departamento o municipio pueden mostrar cuatro cifras de Producción: **producciones con locación**, **días de rodaje**, **inversión local** y **empleos**. Cuando los datos son pocos, un «0» resta; por eso el equipo decide cuáles se ven en **Ajustes → Cifras públicas** (`/admin/ajustes/cifras`), con un interruptor por cifra, su valor actual y la cobertura («dato en 12 de 80 producciones»). Por defecto solo se muestra «Producciones con locación»; si no hay ninguna cifra encendida, la cuadrícula desaparece. El equipo siempre ve las cuatro en `/admin`, marcadas «Oculta al público» las apagadas y con la cobertura en la vista general. La ficha de una producción muestra días, inversión y empleos solo si tienen dato (sin guiones). Los ajustes se guardan en la tabla `site_settings` (lectura pública, escritura del equipo) con `supabase/migrations/0015_site_settings.sql`; sin ella el mapa usa los valores por defecto y la página avisa que falta aplicarla. En modo local viven en `.data/db.json`.

**Zona del mapa.** En **Ajustes → Zona del mapa** (`/admin/ajustes/mapa`) un interruptor decide si el mapa muestra **solo Guatemala** (por defecto: el mapa base de afuera se tapa y los rótulos de países, mares y carreteras vecinas se ocultan) o también los países vecinos y el mar, atenuados. Aplica al mapa público y al de `/admin`, y se guarda en `site_settings` con la clave `map_scope` (sin migración nueva). Los marcadores «Sin locación» y «Fuera de Guatemala» quedan en la esquina superior derecha en ambos casos.

## Filtro por departamento y filtros del equipo

En el mapa público y en `/admin`, el desplegable «Todo el país» (debajo de las capas) tiene una **casilla por departamento**: se marcan uno o varios, la cámara los encuadra juntos, se atenúa el resto del país y el mapa, la lista y las cifras del panel quedan recortados a lo rodado (o a las entidades que hay) en esos departamentos. Con uno marcado se abre su ficha de territorio (`?lugar=d9`); con dos o más, la vista general filtrada (`?deptos=3,9,14`). Se puede compartir el enlace; la «×» o «Todo el país» lo quita. La ruta «Guatemala › departamento» ya no se muestra: el desplegable dice qué hay marcado.

Solo en `/admin`, junto al departamento hay un botón **«Filtros»** que abre un panel compacto. Sin filtros el mapa no muestra nada más; los filtros se **añaden a la carta** («+ Añadir filtro») y se quitan con la «×»:

- **Producción:** formato, naturaleza, género, nacionalidad, año, presupuesto (con moneda), días de rodaje, inversión local, empleos, «locación registrada» (con o sin), «solo con todas las locaciones en un municipio» y búsqueda por texto.
- **Mapa público:** no tiene el panel de filtros. El mapa arranca mostrando **solo las producciones con locación** (lista y mapa). Un chip en el encabezado de la lista («Con locación 84 ▾») cambia a **Sin locación** o **Todas**, con el conteo de cada opción; recorta a la vez la lista y el mapa. En la URL, «con» no se escribe (es lo normal) y las otras son `?locacion=sin` y `?locacion=todas`; la elección se mantiene al cambiar de capa. «Sin locación» deja solo su marcador en el Pacífico. Una producción rodada solo fuera de Guatemala cuenta como «con locación».
- **En el teléfono (público):** arriba, el logo, un botón «Aportar» compacto y un menú ⋯ (Descargas y modo oscuro); debajo, una barra de búsqueda grande que abre la búsqueda a pantalla completa con sugerencias; luego las capas y un botón de departamento. La hoja inferior tiene tres alturas: mínima (el chip de locación y «Ver lista»), media y completa; el mapa se acerca con los dedos (sin botones +/−). El equipo conserva la distribución de siempre.
- **Circulación e Industria (entidades):** categoría (varias), naturaleza y búsqueda por texto.
- **Industria → Personas:** debajo de las capas aparece el selector **Entidades | Personas**. Con Personas, el mapa muestra a las del directorio en el **centro de su municipio** (ubicación aproximada: no hay dirección exacta). Solo se ven las publicadas con departamento o municipio; el correo, el teléfono y los enlaces quedan en `/directorio`. Filtros: oficio y búsqueda. Enlace: `?capa=industria&tipo=personas&persona=<slug>`. Desde la ficha del directorio, «Ver en el mapa» abre esa vista.
- El mapa siempre mide el número de producciones (ya no hay «Medir por»; los enlaces con `?metrica=` se abren igual). El **año** es un rango «Desde / Hasta» (cada lado opcional; solo se aplica con años de 4 dígitos y, si quedan invertidos, se intercambian). Los menús desplegables del card de filtros se muestran por encima del card, sin cortarse.
- Los filtros se aplican al mapa y los paneles, y viven en la URL con los mismos parámetros que `/descargas` (`formato_obra`, `naturaleza`, `genero`, `desde`, `hasta`, `presupuesto_min`, `dias_min`, `categoria`…), así que «Copiar enlace de esta vista» y «Descargar estos datos» llevan exactamente lo que se ve. Los enlaces anteriores con `?categoria=` o `?clase=` (el antiguo «tipo de obra») siguen funcionando: se convierten a formato y naturaleza.

## Pósters

Una producción tiene un póster (`poster_url`). Hay tres formas de subirlo y todas pasan por `/api/posters`, que valida que sea una imagen real (JPG, PNG o WebP, hasta 5 MB), la endereza, y guarda dos WebP: póster de 900 px y miniatura de 400 px.

1. **Una por una**: en el editor de la producción, arrastra la imagen al recuadro «Póster».
2. **En lote**: en `/admin/peliculas`, «Subir pósters en lote» y suelta muchas imágenes. El nombre del archivo debe coincidir con el título o el slug (`la-llorona.jpg` para «La Llorona»).
3. **Con la carga de archivos**: si el Excel trae una columna «Póster (URL)», el asistente la reconoce, descarga cada imagen y la guarda como archivo propio.

Con Supabase los archivos van al bucket público `posters`; en modo local, a `.data/uploads/`.

## Producciones extranjeras y enlaces de video

**Producciones extranjeras.** La nacionalidad «Extranjera» incluye producciones rodadas en Guatemala y producciones que tratan sobre Guatemala aunque se rodaran afuera (en ese caso la locación se registra con su país y cae en la zona «Fuera de Guatemala»). Para separarlas se usa el filtro **Nacionalidad** (ya no hay chip «Origen»). Las extranjeras llevan la etiqueta «Producción extranjera» (con el país de las casas productoras) en la lista y en la ficha.

**Tráiler y película completa.** Cada producción puede tener dos enlaces de video (`trailer_url` y `film_url`), ambos opcionales y sin efecto en la completitud. Al pegar el enlace (en el editor del equipo o en `/aportar`) se busca la miniatura y se guarda en nuestro almacenamiento (`trailer_thumb` y `film_thumb`: WebP de 1280 px y miniatura de 480 px):

- YouTube (watch, `youtu.be`, shorts, embed): la imagen del propio video, en la mayor resolución disponible.
- Vimeo: oEmbed.
- Cualquier otra plataforma (Netflix, Prime Video, Filmin, etc.): la imagen que la página declara para compartirse (`og:image` o `twitter:image`). Si no hay ninguna, el enlace se guarda sin miniatura.

La búsqueda corre en el servidor por `/api/videos/miniatura` (solo http/https, direcciones públicas, redirecciones validadas una por una, límite de tamaño y de tiempo; el público tiene un límite de 12 consultas por hora por IP y sus archivos llevan el prefijo `ap-`, así que se borran si el aporte se rechaza). Si un enlace llega sin miniatura (carga de archivo, aporte, aprobación) se resuelve al guardar, y si el enlace cambia o se borra se elimina la miniatura anterior. En la ficha, el **tráiler** de YouTube o Vimeo se reproduce ahí mismo (`youtube-nocookie.com` o `player.vimeo.com`, tras tocar la miniatura) y el de otras plataformas abre en otra pestaña; la **película completa** siempre abre en la plataforma. Las revisiones de aportes, la fusión de duplicados, la carga de archivos (columnas «Tráiler» y «Película completa») y la exportación incluyen los dos enlaces. **Con Supabase aplica `supabase/migrations/0019_film_videos.sql`; sin ella, guardar producciones falla.**

**Imagen al compartir.** `app/opengraph-image.tsx` dibuja la marca (cinta y pin) y escribe «MAPA DEL CINE DE GUATEMALA» en Montserrat, con la frase «Dónde se filma, dónde se ve y quién hace cine en Guatemala.». WhatsApp y las redes guardan la vista previa en caché; para verla de inmediato, comparte el enlace con `?v=2` al final.

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
/api/export?tipo=producciones&depto=17&orden=director
```

| Parámetro | Valores |
| --- | --- |
| `tipo` | `producciones` (por defecto), `circulacion` (festivales, salas, cineclubs…), `entidades` (capa de industria) |
| `filas` | solo en producciones: `producciones` (por defecto) o `locaciones` (una fila por lugar de rodaje) |
| `formato` | `csv` (por defecto), `xlsx` (con hoja «Léeme» que lista los filtros aplicados) |
| `orden` | campo por el que sale ordenado el archivo; sin él, el orden del mapa. Producciones y locaciones: `anio_desc`, `anio_asc`, `titulo`, `director`, `locacion` (en «una fila por locación» ordena por departamento, municipio y sitio). Festivales: las mismas, con `festival` en lugar de `locacion`. Circulación y entidades: `nombre`, `departamento`, `categoria`. Personas: `nombre`, `departamento`. Lo alfabético va de la A a la Z, lo vacío al final; una clave que no corresponde a la descarga se ignora. El director/a se ordena por el texto guardado (nombre de pila primero). |
| `depto`, `muni` | códigos INE separados por coma (basta con que una locación esté ahí) |
| `formato_obra` | `largometraje`, `mediometraje`, `cortometraje`, `serie`, `miniserie`, `video_musical`, `publicidad`, `programa_tv`, `web`, `videoarte`, `otro` (el parámetro `formato` es el tipo de archivo: csv o xlsx) |
| `naturaleza` | `ficcion`, `documental`, `hibrido` |
| `genero` | nombres separados por coma (`Drama,Terror`); basta con que la producción tenga uno. Sirven los estándar y los propios que existan en los datos |
| `clase` | enlaces anteriores: `ficcion`, `documental`, `serie`, `comercial`, `corto`, `otro`; se convierten a formato y naturaleza |
| `nacionalidad` | `guatemalteca`, `coproduccion`, `extranjera` |
| `desde`, `hasta` | año |
| `presupuesto_min`, `presupuesto_max`, `moneda` | monto y `GTQ` o `USD` (otra moneda se compara a Q 7.70 por dólar); solo salen producciones con presupuesto registrado |
| `locacion` | `con` o `sin`: solo producciones con o sin locación registrada (dentro o fuera de Guatemala) |
| `q` | texto en título, director/a, productor/a o casa productora (o nombre y descripción en entidades) |
| `categoria`, `iniciativa` | solo para `tipo=circulacion` y `tipo=entidades` |
| `borradores=1` | incluye borradores; solo con sesión del equipo |

Los enlaces anteriores (`tipo=peliculas`, `tipo=locaciones`, `tipo=entidades&capa=circulacion`) siguen funcionando; `tipo=entidades` ahora trae solo la industria. Sin sesión sale únicamente lo publicado. En el mapa, el panel de cada lugar y la vista general tienen un botón «Descargar» que abre esta página con los filtros ya puestos, y la fila de categorías también filtra la capa de Producción por formato y naturaleza.

## Identidad visual

Tipografía: **Montserrat** (licencia SIL Open Font License 1.1, libre para usar y redistribuir) en toda la interfaz. Viene del paquete `@fontsource/montserrat` y se carga desde el propio sitio en `app/layout.tsx` (sin pedir nada a Google); `--font-sans` se define en `app/globals.css`. Texto en Regular (400), etiquetas y botones en Medium (500), títulos en SemiBold (600) y h1 en Bold (700), más la cursiva Regular; cada peso se descarga solo si una página lo usa. Si llega la tipografía institucional de PROCINE, se cambia ahí, en `scripts/brand-mapa-logo.mjs` y en `app/opengraph-image.tsx`. Las etiquetas dibujadas dentro del mapa (nombres de pueblos y rutas) vienen del servidor de mapas y no pueden usar esta fuente. **Logo del mapa:** viene de la lámina de identidad `brand-source/mapa-identidad.pdf` (cinta de película con el pin y «MAPA DEL CINE DE GUATEMALA»). `node scripts/brand-mapa.mjs` extrae de ella la marca sola (cinta y pin), para fondo claro y oscuro con transparencia real (`public/brand/mapa-mark-*.png`), y genera los íconos sobre el azul institucional: `app/icon.png`, `app/favicon.ico`, `app/apple-icon.png`, `public/icon-192.png` y `icon-512.png`. **El nombre «MAPA DEL CINE DE GUATEMALA» se escribe en Montserrat** (no es el dibujo de la lámina): `node scripts/brand-mapa-logo.mjs`, que se corre después del anterior, arma el logo horizontal (`public/brand/mapa-logo-{light,dark}.png`: marca + «MAPA DEL CINE» en Bold + «DE GUATEMALA» en SemiBold). Ese es el único logo del mapa: lo usan la barra del mapa, la pantalla de carga, el encabezado de las demás páginas (componente `MapLogo`) y la imagen al compartir, así que todos son iguales. El script mide el texto y ajusta el tamaño para que el logo mida siempre 3700 x 710 px; si cambia la tipografía, se vuelve a correr. La imagen que se ve al compartir cualquier enlace es `app/opengraph-image.tsx` (logo en su versión oscura más los logos de la Academia y PROCINE), y `app/manifest.ts` define el icono al instalar la app. Para que esas imágenes tengan URL absoluta hay que definir `NEXT_PUBLIC_SITE_URL` (p. ej. `https://mapa.academiadecinegt.org`) **antes de construir**; las redes sociales guardan las vistas previas en caché. **Paleta:** azul marino institucional de base, con modo claro y oscuro, y el acento tomado del logo y de PROCINE: violeta para enlaces, foco y selección, y degradado magenta a violeta (el del pin) en los botones principales. Las capas del mapa usan colores de PROCINE: Producción magenta, Circulación cian e Industria naranja (`lib/map/colors.ts`; el amarillo marca lo incompleto). El tema sigue la preferencia del sistema hasta que alguien elige; se recuerda en el navegador). Los colores viven como variables en `app/globals.css`; los de las capas del mapa, en `lib/map/colors.ts`.

## Acceso de solo lectura para terceros

Para que una empresa o persona externa jale los datos **sin entrar al panel de Supabase ni a la organización** (el rol «Read-only» del panel no existe en el plan gratuito), se usa un usuario de base de datos que solo puede leer. Requiere `supabase/migrations/0022_readonly_role.sql`: crea el rol `lector_externo`, con `SELECT` solo en `films`, `film_locations`, `film_festivals`, `festivals`, `organizations`, `people` y `site_settings`. Las políticas RLS existentes hacen que vea únicamente lo **publicado** (no borradores). No ve aportes, correos, cuentas del equipo ni solicitudes. Además tiene sesiones de solo lectura, 30 s máximo por consulta y 5 conexiones.

- **Dar acceso:** en el editor SQL, `alter role lector_externo with password 'CLAVE_LARGA';` (la clave nunca se guarda en el repositorio) y se comparte la cadena de conexión del pooler (Connect → Session pooler) con el usuario `lector_externo.<ref-del-proyecto>`.
- **Cambiar la clave o quitar el acceso:** el mismo `alter role … with password '…'`, o `alter role lector_externo with nologin;` (se reactiva con `login`).
- Si se agrega una tabla pública nueva y ellos la necesitan: `grant select on public.<tabla> to lector_externo;`.

## Exportación para informes (equipo)

Desde `/admin` el equipo descarga también los borradores (`borradores=1`).

## Geodatos

Los límites vienen de `public/geo/` (departamentos, municipios con código INE, lagos, país). Para regenerarlos: `npm run geo:build`. Los mapas base son de [OpenFreeMap](https://openfreemap.org) y la vista satelital de Esri.

## Estructura

- `components/map/`: MapLibre (coropletas, clusters, rutas de rodaje).
- `components/explorer/`: la experiencia pública (paneles, buscador ⌘K; los filtros solo en /admin).
- `components/import/` y `lib/import/`: asistente de carga y su lógica.
- `lib/claude/`: llamadas a Claude (mapeo de columnas y resolución de lugares).
- `lib/data/`: almacén (Supabase o archivo local).
- `app/admin/`: panel del equipo.

## Licencia y créditos

- **Código propio:** © Javier Oswaldo Borrayo Mazariegos, todos los derechos reservados (ver [`LICENSE`](LICENSE)). No es software libre: copiarlo, modificarlo o distribuirlo requiere autorización escrita o un acuerdo firmado.
- **Componentes de terceros:** las librerías de código abierto conservan sus licencias (MIT, BSD, Apache-2.0, ISC y LGPL para los binarios de libvips que usa `sharp`). Sus avisos están en [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) y en `public/licencias.txt`. Se generan con `npm run licenses`; vuelve a correrlo cuando cambien las dependencias y sube los dos archivos.
- **Datos y marcas:** los datos no se reclaman como propiedad de nadie y son descargables con filtros desde `/descargas`; los logotipos son marcas de sus titulares.
- **Aportes de datos:** `/creditos` da un agradecimiento especial a Alberto Jiménez (director ejecutivo de la Redccapfa) por su investigación y reconoce a la Comisión de Investigación y Preservación de PROCINE 2025; el pie de página y el panel del mapa lo resumen en una línea.
- **Completitud:** el porcentaje, la marca «Incompleta», el aviso «Información pendiente» y el anillo de los pines incompletos solo se ven en el panel del equipo; la vista pública no los muestra.
- **En el sitio:** la página `/creditos` («Créditos y licencias») reconoce la autoría, a quienes aportaron datos, los mapas (© colaboradores de OpenStreetMap, OpenFreeMap, OpenMapTiles, Esri, MINFIN / INE) y las librerías; está enlazada desde el pie de página y desde la atribución del mapa.
