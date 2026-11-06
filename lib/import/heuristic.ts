import { FORMATS, parseFormat, parseNature } from "@/lib/film-types";
import { cleanText } from "./normalize";
import { normalize } from "@/lib/utils";
import { guessLayer } from "./normalize";
import type { ImportPlan, ParsedFile, ParsedSheet, PlanQuestion, SheetPlan } from "./types";

type Syn = [field: string, patterns: RegExp[]];

const FILM_SYN: Syn[] = [
  ["festival_year", [/^(ano|anio|year|edicion|fecha)( del| de)? (festival|premio|seleccion)$/, /^(festival|premio) (ano|anio|year|edicion)$/]],
  ["festival_result", [/^(resultado|result|reconocimiento|estatus|seleccion|premiada?|ganadora?)( (en )?(el )?(festival|premio))?$/]],
  ["festival_section", [/^(seccion|section|competencia|categoria de (festival|seleccion))( del festival)?$/]],
  ["festival_award", [/^(premio|premios|award|awards|galardon|distincion|premio obtenido)$/]],
  ["festival_url", [/^(enlace|url|link|sitio)( del| de)? (festival|premio)$/]],
  ["festival", [/^(festival|festivales|festival(es)? (de seleccion|donde participo|y premios?)|selecciones|festival name)$/]],
  ["title", [/^(titulo|title|nombre( de la)?( pelicula| produccion| proyecto| obra)?|pelicula|produccion|proyecto|obra)$/]],
  ["year", [/^(ano|year|anio|ano de (estreno|produccion|rodaje|lanzamiento)|estreno|fecha)$/]],
  ["duration_min", [/^(duracion|duration|runtime|running time|minutos|minutaje|metraje|mins?|duracion( en| \(?en)? ?(min|minutos|minutes)\)?|(min|minutos) de duracion|duracion total)$/]],
  ["format", [/^(formato|tipo|categoria|type|format|clasificacion)( de (la )?(produccion|obra|proyecto|pelicula|contenido))?$/]],
  ["nature", [/^(naturaleza|clase|nature|ficcion o documental|documental o ficcion|ficcion documental)( de (la )?(produccion|obra|proyecto|pelicula))?$/]],
  ["genres", [/^(genero|generos|genre|genres|subgenero|subgeneros|genero(s)? (cinematografico|principal|de la (obra|pelicula)))$/]],
  ["director", [/^(direccion|director|directora|director a|dirigida por|directed by|realizacion|realizador|realizadora)$/]],
  ["poster", [/^(poster|poster url|poster enlace|afiche|afiche url|cartel|portada|miniatura|thumbnail)$/]],
  ["company", [/^(casas? productoras?|productoras?|empresas? productoras?|empresas?|production compan(y|ies)|produccion por)$/]],
  ["company_country", [/^pais(es)? (de )?(la |las )?(casas? )?(productoras?|empresas?)$/, /^(casas? )?productoras? pais(es)?$/]],
  ["producer", [/^(productor|productor a|productor es|productores|producer|producers)$/]],
  ["cinematographer", [/^(director a de fotografia|directora de fotografia|director de fotografia|direccion de fotografia|dir de fotografia|dir\.? fotografia|fotografia|fotografo|fotografa|cinematografia|cinematografo|cinematographer|director of photography|dop|dp)$/]],
  ["screenwriter", [/^(guionista|guionistas|guionista s|guion|guiones|escritor|escritora|escrita por|argumentista|libreto|screenwriter|screenwriters|writer|writers|written by)$/]],
  ["nationality", [/^(nacionalidad|origen|pais( de origen)?|nationality)$/]],
  ["budget", [/^(presupuesto|budget|costo|inversion total)$/]],
  ["currency", [/^(moneda|currency|divisa)$/]],
  ["synopsis", [/^(sinopsis|synopsis|resumen|descripcion|argumento)$/]],
  ["muni", [/^(municipio|muni|municipality|ciudad|localidad|pueblo)$/]],
  ["depto", [/^(departamento|depto|dpto|department|region)$/]],
  ["place", [/^(lugar|lugares|locacion|locaciones|ubicacion|ubicaciones|locacion(es)? de rodaje|donde|sitio|place|location|locations|filming locations?)$/]],
  ["site", [/^(sitio de rodaje|escenario|set|lugar especifico|punto)$/]],
  ["lat", [/^(lat|latitud|latitude)$/]],
  ["lng", [/^(lng|lon|long|longitud|longitude)$/]],
  ["days", [/^(dias( de (rodaje|filmacion|produccion))?|dias rodados|days|shooting days)$/]],
  ["local_spend", [/^(inversion( local| en (el )?territorio)?|gasto( local)?|gasto en (guatemala|locacion)|spend|local spend|aporte local)$/]],
  ["jobs", [/^(empleos|empleo|puestos de trabajo|contrataciones|jobs|personas contratadas|empleos generados)$/]],
];

const ORG_SYN: Syn[] = [
  ["name", [/^(nombre|name|entidad|organizacion|iniciativa|empresa|razon social|espacio|festival|proyecto)$/]],
  ["category", [/^(categoria|tipo( de (espacio|entidad|iniciativa|servicio))?|rubro|servicio|giro|actividad|category)$/]],
  ["initiative_type", [/^(naturaleza|tipo de iniciativa|sector|tipo de organizacion|publica o privada|initiative)$/]],
  ["muni", [/^(municipio|muni|ciudad|localidad)$/]],
  ["depto", [/^(departamento|depto|dpto|region)$/]],
  ["place", [/^(lugar|ubicacion|direccion|sede|place|location)$/]],
  ["city", [/^(ciudad|ciudad o referencia)$/]],
  ["lat", [/^(lat|latitud)$/]],
  ["lng", [/^(lng|lon|long|longitud)$/]],
  ["web", [/^(web|sitio web|pagina web|website|url|pagina|sitio)$/]],
  ["instagram", [/^(instagram|ig|redes|redes sociales|red social)$/]],
  ["contact", [/^(contacto|correo( electronico)?|email|e mail|telefono|celular|movil|tel|whatsapp|contact)$/]],
  ["description", [/^(descripcion|description|resumen|sobre|acerca|detalle|observaciones)$/]],
];

/** Segunda pasada, más tolerante: encabezados largos como "Nombre del proyecto" o "Dónde se filmó". */
const FILM_LOOSE: Syn[] = [
  ["festival", [/\bfestival/, /\bselecciones?\b/]],
  ["title", [/\b(titulo|pelicula|proyecto|obra|nombre)\b/]],
  ["year", [/\b(ano|anio|year|estreno)\b/]],
  ["duration_min", [/\b(duracion|duration|runtime|minutaje)\b(?!.*(rodaje|filmacion|shooting))/, /\bminutos\b/]],
  ["format", [/\b(formato|format)\b/, /\btipo de (obra|produccion|contenido)\b/]],
  ["nature", [/naturaleza|\bnature\b/]],
  ["genres", [/\bgeneros?\b/, /\bgenres?\b/]],
  ["director", [/\bdirec(?!.*fotograf)/, /realiza/]],
  ["poster", [/\bposter\b/, /\bafiche\b/, /\bcartel\b/, /thumbnail|miniatura/]],
  ["company", [/\bcasas? productoras?/, /production compan/, /\bproductoras?\b/]],
  ["producer", [/\bproductor\b/, /\bproducer\b/]],
  ["cinematographer", [/fotograf/, /cinematograf/, /director of photography/]],
  ["screenwriter", [/\bguion/, /screenplay|screenwrit/]],
  ["nationality", [/nacionalidad/]],
  ["budget", [/\b(presupuesto|budget)\b/]],
  ["synopsis", [/sinopsis/]],
  ["muni", [/\bmunicipio/]],
  ["depto", [/\bdepartamento/]],
  ["place", [/(donde|lugar|locacion|ubicacion|filmo|rodo|rodaje)/]],
  ["days", [/\bdias\b/]],
  ["jobs", [/\b(empleos?|contrataciones)\b/]],
];
const ORG_LOOSE: Syn[] = [
  ["name", [/\b(nombre|entidad|organizacion|iniciativa)\b/]],
  ["category", [/\b(categoria|tipo|rubro)\b/]],
  ["muni", [/\bmunicipio/]],
  ["depto", [/\bdepartamento/]],
  ["place", [/(donde|lugar|ubicacion|sede)/]],
  ["web", [/\b(web|sitio|url)\b/]],
  ["instagram", [/\b(instagram|redes)\b/]],
  ["contact", [/\b(contacto|correo|email|telefono)\b/]],
  ["description", [/\b(descripcion|detalle|observaciones)\b/]],
];

function mapColumns(headers: string[], syn: Syn[], loose: Syn[]) {
  const columns: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const taken = new Set<string>();
  const pass = (table: Syn[], conf: number) => {
    for (const [field, pats] of table) {
      if (columns[field]) continue;
      for (const h of headers) {
        if (taken.has(h)) continue;
        const n = normalize(h);
        if (pats.some((p) => p.test(n))) {
          columns[field] = h;
          confidence[field] = conf;
          taken.add(h);
          break;
        }
      }
    }
  };
  pass(syn, 0.75);
  pass(loose, 0.55);
  return { columns, confidence };
}

/**
 * Una columna puede alimentar más de un campo: «Largometraje documental» trae el formato y la naturaleza.
 * Si los valores de una de las dos columnas dicen también lo de la otra, se asigna la misma columna a las dos.
 */
function shareColumns(m: { columns: Record<string, string>; confidence: Record<string, number> }, sheet: ParsedSheet) {
  const { columns, confidence } = m;
  const some = (h: string, test: (v: string) => unknown) => sheet.rows.some((r) => !!r[h] && !!test(r[h]));
  if (columns.format && !columns.nature && some(columns.format, parseNature)) {
    columns.nature = columns.format;
    confidence.nature = Math.min(confidence.format ?? 0.6, 0.6);
  }
  if (columns.nature && !columns.format && some(columns.nature, parseFormat)) {
    columns.format = columns.nature;
    confidence.format = Math.min(confidence.nature ?? 0.6, 0.6);
  }
}

/** Valores de la columna de formato que no se reconocen (y que tampoco son una naturaleza): se preguntan, no se guardan como «Otro». */
function unknownFormatQuestions(sp: SheetPlan, sheet: ParsedSheet): PlanQuestion[] {
  const col = sp.columns.format;
  if (!col) return [];
  const seen = new Map<string, number>();
  for (const r of sheet.rows) {
    const v = cleanText(r[col]);
    if (!v || parseFormat(v) || parseNature(v)) continue;
    seen.set(v, (seen.get(v) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([v, n]) => ({
      id: `format-${sp.sheet}-${v}`,
      question: `En la columna «${col}» aparece «${v}» (${n} ${n === 1 ? "vez" : "veces"}). ¿Qué formato es?`,
      options: [...FORMATS.map((f) => f.label), "Dejarlo sin formato"],
      sheet: sp.sheet,
      field: "format",
      value: v,
    }));
}

function planSheet(sheet: ParsedSheet, fromPdf = false): SheetPlan {
  const film = mapColumns(sheet.headers, FILM_SYN, FILM_LOOSE);
  const org = mapColumns(sheet.headers, ORG_SYN, ORG_LOOSE);

  const filmScore = (film.columns.title ? 3 : 0) + (film.columns.year ? 1 : 0) + (film.columns.director ? 1 : 0) + (film.columns.days ? 1 : 0);
  const orgScore = (org.columns.name ? 2 : 0) + (org.columns.category ? 2 : 0) + (org.columns.web ? 1 : 0) + (org.columns.instagram ? 1 : 0);

  const isFilm = filmScore >= 3 && filmScore >= orgScore;
  if (isFilm) {
    shareColumns(film, sheet);
    // Si el título se repite en varias filas, hay una fila por locación.
    const col = film.columns.title;
    const titles = sheet.rows.map((r) => normalize(r[col] ?? "")).filter(Boolean);
    const seen = new Set(titles);
    // en un PDF o Word leído por Claude, un lugar o un festival de más es otra fila con el mismo título: basta con que alguno se repita
    const grain = seen.size < sheet.rows.length * 0.75 || (fromPdf && seen.size < titles.length) ? "row_per_location" : "row_per_film";
    return {
      sheet: sheet.name,
      entity: "film",
      grain,
      columns: film.columns,
      confidence: film.confidence,
      multi_place: !!film.columns.place,
    };
  }
  if (orgScore >= 3 || (org.columns.name && org.columns.category)) {
    const guessed = org.columns.category ? guessLayer(sheet.rows.map((r) => r[org.columns.category] ?? "")) : null;
    return {
      sheet: sheet.name,
      entity: "org",
      layer: guessed ?? "circulacion",
      layerGuessed: !!guessed,
      grain: "row_per_film",
      columns: org.columns,
      confidence: org.confidence,
    };
  }
  return { sheet: sheet.name, entity: "ignore", grain: "row_per_film", columns: {}, confidence: {}, note: "No se reconocieron columnas de producciones ni de entidades." };
}

/** Análisis sin conexión: reconoce encabezados comunes en español e inglés. */
export function heuristicPlan(file: ParsedFile): ImportPlan {
  const sheets = file.sheets.map((s) => planSheet(s, file.doc?.engine === "claude"));
  const films = sheets.filter((s) => s.entity === "film").length;
  const orgs = sheets.filter((s) => s.entity === "org").length;
  return {
    sheets,
    engine: "heuristic",
    summary: `Reconocimos ${films} hoja(s) de producciones y ${orgs} de entidades por los nombres de las columnas. Revisa que cada columna esté bien asignada.`,
    questions: [
      ...sheets.flatMap((sp) => {
        const sheet = file.sheets.find((s) => s.name === sp.sheet);
        return sp.entity === "film" && sheet ? unknownFormatQuestions(sp, sheet) : [];
      }),
      ...sheets
      .filter((s) => s.entity === "org" && !s.layerGuessed)
      .map((s) => ({
        id: `layer-${s.sheet}`,
        question: `La hoja “${s.sheet}”: ¿pertenece a Circulación (festivales, salas, cineclubs) o a Industria (productoras, servicios, formación)?`,
        options: ["circulacion", "industria"],
        sheet: s.sheet,
        field: "layer",
      })),
    ],
  };
}
