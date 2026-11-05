import type { FilmCompany } from "@/lib/types";

type C = Partial<Pick<FilmCompany, "name" | "country">>;

/** «Casa Uno (Guatemala)». */
export const companyLabel = (c: C) => [c.name?.trim(), c.country?.trim() ? `(${c.country.trim()})` : ""].filter(Boolean).join(" ");

/** Lista legible: una casa productora por separador. */
export const companiesText = (list: C[] | undefined | null, sep = "; ") => (list ?? []).filter((c) => c.name?.trim()).map(companyLabel).join(sep);

/** Nombres sueltos, para buscar por texto. */
export const companyNames = (list: C[] | undefined | null) => (list ?? []).map((c) => c.name ?? "").filter(Boolean);
