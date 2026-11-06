/** Países en español para sugerir al escribir (casas productoras y similares). Nunca restringe: se puede escribir cualquier texto. */

const ISO =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(
    " ",
  );

export const HOME_COUNTRY = "Guatemala";

function build(): string[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames("es", { type: "region" });
  } catch {
    names = null;
  }
  const list = names ? ISO.map((c) => names!.of(c) ?? "").filter((n) => n && !/^[A-Z]{2}$/.test(n)) : [HOME_COUNTRY];
  return [...new Set(list)].sort((a, b) => a.localeCompare(b, "es"));
}

/** Nombres de países en español, en orden alfabético. */
export const COUNTRIES: string[] = build();

const ALIASES: Record<string, string> = {
  eeuu: "Estados Unidos",
  "ee uu": "Estados Unidos",
  usa: "Estados Unidos",
  "u s a": "Estados Unidos",
  "estados unidos de america": "Estados Unidos",
  uk: "Reino Unido",
  inglaterra: "Reino Unido",
  mexico: "México",
  "republica dominicana": "República Dominicana",
};

let byName: Map<string, string> | null = null;
const countryIndex = () => {
  if (!byName) {
    byName = new Map(COUNTRIES.map((c) => [norm(c), c]));
    for (const [k, v] of Object.entries(ALIASES)) byName.set(k, COUNTRIES.find((c) => norm(c) === norm(v)) ?? v);
  }
  return byName;
};
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Si el texto de un lugar nombra un país (casi siempre al final: «Oaxaca, México»), devuelve ese país y el resto como ciudad o lugar.
 * Guatemala no cuenta: un lugar de Guatemala se resuelve con el catálogo de municipios.
 */
export function detectCountry(text: string): { country: string; city: string } | null {
  const parts = text.split(/[,;|]|\s[-–—/]\s/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = countryIndex().get(norm(parts[i]));
    if (!c) continue;
    if (norm(c) === norm(HOME_COUNTRY)) return null;
    return { country: c, city: parts.filter((_, j) => j !== i).join(", ") };
  }
  return null;
}
