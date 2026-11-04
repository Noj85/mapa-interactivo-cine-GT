import { normalize } from "@/lib/utils";
import { guessLayer } from "./normalize";
import type { ImportPlan, ParsedFile, ParsedSheet, SheetPlan } from "./types";

type Syn = [field: string, patterns: RegExp[]];

const FILM_SYN: Syn[] = [
  ["title", [/^(titulo|title|nombre( de la)?( pelicula| produccion| proyecto| obra)?|pelicula|produccion|proyecto|obra)$/]],
  ["year", [/^(ano|year|anio|ano de (estreno|produccion|rodaje|lanzamiento)|estreno|fecha)$/]],
  ["kind", [/^(tipo|genero|formato|categoria|type)( de (produccion|obra|proyecto))?$/]],
  ["director", [/^(direccion|director|directora|director a|dirigida por|directed by|realizacion|realizador|realizadora)$/]],
  ["poster", [/^(poster|poster url|poster enlace|afiche|afiche url|cartel|portada|miniatura|thumbnail)$/]],
  ["producer", [/^(productora|productor|casa productora|empresa|production company|produccion por)$/]],
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
  ["title", [/\b(titulo|pelicula|proyecto|obra|nombre)\b/]],
  ["year", [/\b(ano|anio|year|estreno)\b/]],
  ["director", [/\bdirec/, /realiza/]],
  ["poster", [/\bposter\b/, /\bafiche\b/, /\bcartel\b/, /thumbnail|miniatura/]],
  ["producer", [/\bproduct/]],
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

function planSheet(sheet: ParsedSheet): SheetPlan {
  const film = mapColumns(sheet.headers, FILM_SYN, FILM_LOOSE);
  const org = mapColumns(sheet.headers, ORG_SYN, ORG_LOOSE);

  const filmScore = (film.columns.title ? 3 : 0) + (film.columns.year ? 1 : 0) + (film.columns.director ? 1 : 0) + (film.columns.days ? 1 : 0);
  const orgScore = (org.columns.name ? 2 : 0) + (org.columns.category ? 2 : 0) + (org.columns.web ? 1 : 0) + (org.columns.instagram ? 1 : 0);

  const isFilm = filmScore >= 3 && filmScore >= orgScore;
  if (isFilm) {
    // Si el título se repite en varias filas, hay una fila por locación.
    const col = film.columns.title;
    const seen = new Set(sheet.rows.map((r) => normalize(r[col] ?? "")).filter(Boolean));
    const grain = seen.size < sheet.rows.length * 0.75 ? "row_per_location" : "row_per_film";
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
  return { sheet: sheet.name, entity: "ignore", grain: "row_per_film", columns: {}, confidence: {}, note: "No se reconocieron columnas de películas ni de entidades." };
}

/** Análisis sin conexión: reconoce encabezados comunes en español e inglés. */
export function heuristicPlan(file: ParsedFile): ImportPlan {
  const sheets = file.sheets.map(planSheet);
  const films = sheets.filter((s) => s.entity === "film").length;
  const orgs = sheets.filter((s) => s.entity === "org").length;
  return {
    sheets,
    engine: "heuristic",
    summary: `Reconocimos ${films} hoja(s) de películas y ${orgs} de entidades por los nombres de las columnas. Revisa que cada columna esté bien asignada.`,
    questions: sheets
      .filter((s) => s.entity === "org" && !s.layerGuessed)
      .map((s) => ({
        id: `layer-${s.sheet}`,
        question: `La hoja “${s.sheet}”: ¿pertenece a Circulación (festivales, salas, cineclubs) o a Industria (productoras, servicios, formación)?`,
        options: ["circulacion", "industria"],
        sheet: s.sheet,
        field: "layer",
      })),
  };
}
