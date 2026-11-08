import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCategories, orgCategories } from "@/lib/categories";
import { buildFilm, buildOrg, newId, uniqueSlug } from "@/lib/data/records";
import { cleanLanguages, coreFields, readCrew } from "@/lib/crew";
import { cleanGenres, cleanMinutes, isFormat, isNature, legacyKind, upgradeFilmPayload } from "@/lib/film-types";
import { festivalSearchKey } from "@/lib/festivals";
import { normalize, upperTitle } from "@/lib/utils";
import { hashPassword, hashToken, normPassword, verifyPassword } from "@/lib/info-requests";
import { MAX_FAILED_ATTEMPTS } from "@/lib/request-state";
import type {
  Festival,
  Film,
  FilmCrewMember,
  FilmFestival,
  FilmInput,
  FilmLocation,
  ImportQuestion,
  ImportRecord,
  InfoRequest,
  OpenInfoResult,
  Org,
  OrgInput,
  QuestionStatus,
  RecordStatus,
  ImportSubmissionInput,
  Submission,
  SubmissionInput,
  SubmissionKind,
  SubmissionStatus,
} from "@/lib/types";

export interface FestivalInput {
  id?: string;
  name: string;
  aliases?: string[];
  country?: string | null;
  city?: string | null;
  founded?: number | null;
  source?: string | null;
  /** Sin este campo se conserva el vínculo actual; null lo suelta. */
  org_id?: string | null;
}

export interface NewInfoRequest {
  kind: SubmissionKind;
  target_id: string;
  /** Otras producciones que comparten el mismo enlace (solo producciones; máx. 19). */
  extra_ids?: string[];
  recipient?: string | null;
  recipient_email?: string | null;
  expires_at: string;
  /** Enlace y contraseña en claro: solo se usan para guardar su huella. */
  token: string;
  password: string;
}

export type SubmitInfoResult = { ok: true } | { ok: false; reason: "not_found" | "bad_password" | "expired" | "revoked" | "locked" };

const cleanAliases = (name: string, aliases?: string[]) => {
  const seen = new Set([name.trim().toLowerCase()]);
  const out: string[] = [];
  for (const a of aliases ?? []) {
    const t = a.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
};

/**
 * Capa de almacenamiento. Dos implementaciones con la misma interfaz:
 *  - SupabaseStore: producción (RLS decide quién lee y escribe).
 *  - LocalStore: archivo JSON para desarrollar sin Supabase.
 */
export interface Store {
  mode: "supabase" | "local";
  listFilms(opts?: { drafts?: boolean }): Promise<Film[]>;
  listOrgs(opts?: { drafts?: boolean }): Promise<Org[]>;
  getFilm(id: string): Promise<Film | null>;
  getOrg(id: string): Promise<Org | null>;
  saveFilm(input: FilmInput, extra?: { import_id?: string }): Promise<Film>;
  saveOrg(input: OrgInput, extra?: { import_id?: string }): Promise<Org>;
  deleteFilm(id: string): Promise<void>;
  /**
   * Última parte de una fusión: lo que apuntaba a `fromId` (aportes, solicitudes de información, preguntas de carga)
   * pasa a `intoId`, y se borra `fromId` con sus locaciones y festivales.
   */
  mergeFilmInto(fromId: string, intoId: string): Promise<void>;
  deleteOrg(id: string): Promise<void>;
  saveImport(rec: ImportRecord): Promise<ImportRecord>;
  listImports(): Promise<ImportRecord[]>;
  saveQuestions(list: Omit<ImportQuestion, "id" | "created_at">[]): Promise<void>;
  listQuestions(opts?: { status?: QuestionStatus }): Promise<ImportQuestion[]>;
  answerQuestion(id: string, answer: string | null, status: QuestionStatus): Promise<void>;
  /** Aportes del público. `createSubmission` es lo único que puede llamar quien no es del equipo. */
  createSubmission(input: SubmissionInput): Promise<void>;
  /** Aporte «Carga de archivo»: lo crea una carga del equipo para lo que no pudo decidir sola. */
  createImportSubmission(input: ImportSubmissionInput): Promise<string>;
  listSubmissions(opts?: { status?: SubmissionStatus }): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | null>;
  reviewSubmission(
    id: string,
    patch: { status: SubmissionStatus; reviewer_note?: string | null; result_id?: string | null },
  ): Promise<void>;

  /** Publica u oculta varios registros de una vez. */
  setRecordsStatus(kind: SubmissionKind, ids: string[], status: RecordStatus): Promise<void>;

  /** Catálogo de festivales (lectura pública). `q` vacío lista todo por nombre. */
  searchFestivals(q: string, opts?: { limit?: number; offset?: number; link?: "linked" | "unlinked" }): Promise<{ rows: Festival[]; total: number }>;
  getFestival(id: string): Promise<Festival | null>;
  saveFestival(input: FestivalInput): Promise<Festival>;
  deleteFestival(id: string): Promise<void>;
  /** Pasa todas las participaciones de `fromId` a `intoId` y borra `fromId` (queda como alias). */
  mergeFestivals(fromId: string, intoId: string): Promise<void>;
  /** Agrega al catálogo los que no existan (por slug). Devuelve cuántos agregó. */
  seedFestivals(list: Omit<Festival, "id" | "org_id">[]): Promise<number>;
  /** Vincula (o suelta, con null) un festival del catálogo con una entidad de Circulación. Una entidad solo puede estar en una entrada. */
  linkFestivalOrg(festivalId: string, orgId: string | null): Promise<void>;
  /** Festival del catálogo -> entidad vinculada (todas; quien llama filtra las publicadas). */
  festivalOrgMap(): Promise<Record<string, string>>;
  /** Cuántas participaciones tiene cada festival del catálogo. */
  festivalUsage(ids: string[]): Promise<Record<string, number>>;

  /** Ajustes del sitio (clave → valor JSON). Lectura pública; solo el equipo escribe. */
  getSetting(key: string): Promise<unknown | null>;
  saveSetting(key: string, value: unknown): Promise<void>;

  /** Solicitudes de información (enlace privado + contraseña). */
  createInfoRequest(input: NewInfoRequest): Promise<InfoRequest>;
  listInfoRequests(opts?: { kind?: SubmissionKind; target_id?: string }): Promise<InfoRequest[]>;
  revokeInfoRequest(id: string): Promise<void>;
  /** Pública: abre el enlace con la contraseña. */
  openInfoRequest(token: string, password: string): Promise<OpenInfoResult>;
  /** Pública: envía un aporte de recopilación por el enlace. */
  submitInfoRequest(
    token: string,
    password: string,
    data: { payload: FilmInput | OrgInput; note: string; contact: string; submitter: string | null; target_id?: string | null },
  ): Promise<SubmitInfoResult>;
}

// ───────────────────────── Local ─────────────────────────

/** Producciones de una solicitud: la principal y, si es consolidada, las demás (sin repetir, máx. 20). */
function allTargets(kind: SubmissionKind, target: string, extra?: string[]) {
  if (kind !== "film" || !extra?.length) return [target];
  return [...new Set([target, ...extra])].slice(0, 20);
}
/** Solicitudes guardadas antes de las consolidadas no traen `target_ids`. */
const requestTargets = (r: { target_id: string; target_ids?: string[] }) => (r.target_ids?.length ? r.target_ids : [r.target_id]);

interface LocalInfoRequest extends InfoRequest {
  token_hash: string;
  password_hash: string;
}

interface LocalDb {
  films: Film[];
  orgs: Org[];
  imports: ImportRecord[];
  questions: ImportQuestion[];
  submissions: Submission[];
  festivals: Festival[];
  info_requests: LocalInfoRequest[];
  settings: Record<string, unknown>;
}

const DB_PATH = path.join(process.cwd(), ".data", "db.json");

/** Producción guardada: completa lo que falte y convierte el antiguo «kind» en formato y naturaleza. */
function readFilm(f: any): Film {
  const { kind, ...rest } = f;
  const legacy = f.format === undefined && f.nature === undefined ? legacyKind(kind) : { format: null, nature: null };
  const crew = readCrew(f.crew, f);
  return {
    ...rest,
    title: upperTitle(f.title),
    format: isFormat(f.format) ? f.format : legacy.format,
    nature: isNature(f.nature) ? f.nature : legacy.nature,
    genres: cleanGenres(f.genres),
    duration_min: cleanMinutes(f.duration_min),
    festivals: f.festivals ?? [],
    companies: f.companies ?? [],
    languages: cleanLanguages(f.languages),
    // registros anteriores a «crew»: el equipo se arma con director, productor, fotografía y guion
    crew,
    ...coreFields(crew),
  } as Film;
}

async function readDb(): Promise<LocalDb> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const j = JSON.parse(raw) as Partial<LocalDb>;
    return {
      films: (j.films ?? []).map(readFilm),
      orgs: (j.orgs ?? []).map((o) => ({ ...o, categories: orgCategories(o) })),
      imports: j.imports ?? [],
      questions: j.questions ?? [],
      submissions: (j.submissions ?? []).map((s) => ({
        ...s,
        origin: s.origin ?? "publico",
        request_id: s.request_id ?? null,
        submitter: s.submitter ?? null,
        payload: s.kind === "film" ? upgradeFilmPayload(s.payload) : s.payload,
      })),
      festivals: (j.festivals ?? []).map((f) => ({ ...f, org_id: f.org_id ?? null })),
      info_requests: j.info_requests ?? [],
      settings: j.settings ?? {},
    };
  } catch {
    return { films: [], orgs: [], imports: [], questions: [], submissions: [], festivals: [], info_requests: [], settings: {} };
  }
}

async function writeDb(db: LocalDb) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_PATH);
}

export const localDbExists = async () => {
  try {
    const db = await readDb();
    return db.films.length + db.orgs.length > 0;
  } catch {
    return false;
  }
};

export class LocalStore implements Store {
  mode = "local" as const;

  async listFilms(opts?: { drafts?: boolean }) {
    const { films } = await readDb();
    return opts?.drafts ? films : films.filter((f) => f.status === "published");
  }
  async listOrgs(opts?: { drafts?: boolean }) {
    const { orgs } = await readDb();
    return opts?.drafts ? orgs : orgs.filter((o) => o.status === "published");
  }
  async getFilm(id: string) {
    return (await readDb()).films.find((f) => f.id === id) ?? null;
  }
  async getOrg(id: string) {
    return (await readDb()).orgs.find((o) => o.id === id) ?? null;
  }

  async saveFilm(input: FilmInput) {
    const db = await readDb();
    const existing = input.id ? db.films.find((f) => f.id === input.id) : undefined;
    const slug =
      existing?.slug ??
      uniqueSlug(input.title, new Set(db.films.map((f) => f.slug)), input.year ?? null);
    const film = buildFilm(input, { id: existing?.id, slug, existing });
    // un festival que no está en el catálogo se conserva solo como texto
    const known = new Set(db.festivals.map((x) => x.id));
    film.festivals = film.festivals.map((x) => (x.festival_id && !known.has(x.festival_id) ? { ...x, festival_id: null } : x));
    db.films = existing ? db.films.map((f) => (f.id === film.id ? film : f)) : [...db.films, film];
    await writeDb(db);
    return film;
  }

  async saveOrg(input: OrgInput) {
    const db = await readDb();
    const existing = input.id ? db.orgs.find((o) => o.id === input.id) : undefined;
    const slug = existing?.slug ?? uniqueSlug(input.name, new Set(db.orgs.map((o) => o.slug)));
    const org = buildOrg(input, { id: existing?.id, slug });
    db.orgs = existing ? db.orgs.map((o) => (o.id === org.id ? org : o)) : [...db.orgs, org];
    await writeDb(db);
    return org;
  }

  async deleteFilm(id: string) {
    const db = await readDb();
    db.films = db.films.filter((f) => f.id !== id);
    await writeDb(db);
  }
  async mergeFilmInto(fromId: string, intoId: string) {
    const db = await readDb();
    const from = db.films.find((f) => f.id === fromId);
    const into = db.films.find((f) => f.id === intoId);
    if (!from || !into || from.id === into.id) return;
    const swap = (id: string | null | undefined) => (id === fromId ? intoId : id);
    db.submissions = db.submissions.map((x) => ({ ...x, target_id: swap(x.target_id) ?? null, result_id: swap(x.result_id) ?? null }));
    db.info_requests = db.info_requests.map((r) => ({
      ...r,
      target_id: swap(r.target_id)!,
      ...(r.target_ids ? { target_ids: [...new Set(r.target_ids.map((t) => swap(t)!))] } : {}),
    }));
    db.questions = db.questions.map((q) => (q.record_ref === `film:${from.slug}` ? { ...q, record_ref: `film:${into.slug}` } : q));
    db.films = db.films.filter((f) => f.id !== fromId);
    await writeDb(db);
  }
  async deleteOrg(id: string) {
    const db = await readDb();
    db.orgs = db.orgs.filter((o) => o.id !== id);
    // el vínculo con el catálogo se suelta; la entrada del catálogo se conserva
    db.festivals = db.festivals.map((f) => (f.org_id === id ? { ...f, org_id: null } : f));
    await writeDb(db);
  }

  async saveImport(rec: ImportRecord) {
    const db = await readDb();
    db.imports = [rec, ...db.imports.filter((i) => i.id !== rec.id)];
    await writeDb(db);
    return rec;
  }
  async listImports() {
    return (await readDb()).imports;
  }

  async saveQuestions(list: Omit<ImportQuestion, "id" | "created_at">[]) {
    const db = await readDb();
    const now = new Date().toISOString();
    db.questions.push(...list.map((q) => ({ ...q, id: newId(), created_at: now })));
    await writeDb(db);
  }
  async listQuestions(opts?: { status?: QuestionStatus }) {
    const { questions } = await readDb();
    return opts?.status ? questions.filter((q) => q.status === opts.status) : questions;
  }
  async answerQuestion(id: string, answer: string | null, status: QuestionStatus) {
    const db = await readDb();
    db.questions = db.questions.map((q) => (q.id === id ? { ...q, answer, status } : q));
    await writeDb(db);
  }

  async createSubmission(input: SubmissionInput) {
    const db = await readDb();
    db.submissions.unshift({
      ...input,
      id: newId(),
      origin: "publico",
      request_id: null,
      submitter: null,
      status: "pending",
      reviewer_note: null,
      result_id: null,
      created_at: new Date().toISOString(),
      reviewed_at: null,
    });
    await writeDb(db);
  }
  async createImportSubmission(input: ImportSubmissionInput) {
    const db = await readDb();
    const id = newId();
    db.submissions.unshift({
      ...input,
      id,
      origin: "carga",
      request_id: null,
      status: "pending",
      reviewer_note: null,
      result_id: null,
      created_at: new Date().toISOString(),
      reviewed_at: null,
    });
    await writeDb(db);
    return id;
  }
  async listSubmissions(opts?: { status?: SubmissionStatus }) {
    const { submissions } = await readDb();
    return opts?.status ? submissions.filter((x) => x.status === opts.status) : submissions;
  }
  async getSubmission(id: string) {
    return (await readDb()).submissions.find((x) => x.id === id) ?? null;
  }
  async reviewSubmission(
    id: string,
    patch: { status: SubmissionStatus; reviewer_note?: string | null; result_id?: string | null },
  ) {
    const db = await readDb();
    db.submissions = db.submissions.map((x) =>
      x.id === id
        ? {
            ...x,
            status: patch.status,
            reviewer_note: patch.reviewer_note ?? null,
            result_id: patch.result_id ?? x.result_id,
            reviewed_at: new Date().toISOString(),
          }
        : x,
    );
    await writeDb(db);
  }

  async setRecordsStatus(kind: SubmissionKind, ids: string[], status: RecordStatus) {
    const db = await readDb();
    const set = new Set(ids);
    if (kind === "film") db.films = db.films.map((f) => (set.has(f.id) && f.title.trim() ? { ...f, status } : f));
    else db.orgs = db.orgs.map((o) => (set.has(o.id) && o.name.trim() ? { ...o, status } : o));
    await writeDb(db);
  }

  // ───── catálogo de festivales ─────

  async searchFestivals(q: string, opts?: { limit?: number; offset?: number; link?: "linked" | "unlinked" }) {
    const { festivals } = await readDb();
    const nq = normalize(q);
    let rows = nq ? festivals.filter((f) => festivalSearchKey(f.name, f.aliases).includes(nq)) : [...festivals];
    if (opts?.link) rows = rows.filter((f) => (opts.link === "linked") === !!f.org_id);
    rows.sort((a, b) => {
      const sa = nq && normalize(a.name).startsWith(nq) ? 0 : 1;
      const sb = nq && normalize(b.name).startsWith(nq) ? 0 : 1;
      return sa - sb || a.name.localeCompare(b.name);
    });
    const total = rows.length;
    rows = rows.slice(opts?.offset ?? 0, (opts?.offset ?? 0) + (opts?.limit ?? 50));
    return { rows, total };
  }
  async getFestival(id: string) {
    return (await readDb()).festivals.find((f) => f.id === id) ?? null;
  }
  async saveFestival(input: FestivalInput) {
    const db = await readDb();
    const existing = input.id ? db.festivals.find((f) => f.id === input.id) : undefined;
    const name = input.name.trim();
    const fest: Festival = {
      id: existing?.id ?? newId(),
      slug: existing?.slug ?? uniqueSlug(name, new Set(db.festivals.map((f) => f.slug))),
      name,
      aliases: cleanAliases(name, input.aliases),
      country: input.country?.trim() || null,
      city: input.city?.trim() || null,
      founded: input.founded ?? null,
      source: input.source ?? existing?.source ?? null,
      org_id: input.org_id === undefined ? (existing?.org_id ?? null) : input.org_id,
    };
    // una entidad solo puede estar vinculada a una entrada
    const others = fest.org_id ? db.festivals.map((f) => (f.id !== fest.id && f.org_id === fest.org_id ? { ...f, org_id: null } : f)) : db.festivals;
    db.festivals = existing ? others.map((f) => (f.id === fest.id ? fest : f)) : [...others, fest];
    await writeDb(db);
    return fest;
  }
  async deleteFestival(id: string) {
    const db = await readDb();
    db.festivals = db.festivals.filter((f) => f.id !== id);
    db.films = db.films.map((f) => ({ ...f, festivals: f.festivals.map((x) => (x.festival_id === id ? { ...x, festival_id: null } : x)) }));
    await writeDb(db);
  }
  async mergeFestivals(fromId: string, intoId: string) {
    const db = await readDb();
    const from = db.festivals.find((f) => f.id === fromId);
    const into = db.festivals.find((f) => f.id === intoId);
    if (!from || !into || from.id === into.id) return;
    db.films = db.films.map((f) => ({
      ...f,
      festivals: f.festivals.map((x) => (x.festival_id === fromId ? { ...x, festival_id: into.id, name: into.name } : x)),
    }));
    into.aliases = cleanAliases(into.name, [...into.aliases, from.name, ...from.aliases]);
    into.org_id = into.org_id ?? from.org_id;
    db.festivals = db.festivals.filter((f) => f.id !== fromId);
    await writeDb(db);
  }
  async linkFestivalOrg(festivalId: string, orgId: string | null) {
    const db = await readDb();
    if (!db.festivals.some((f) => f.id === festivalId)) return;
    db.festivals = db.festivals.map((f) => (f.id === festivalId ? { ...f, org_id: orgId } : orgId && f.org_id === orgId ? { ...f, org_id: null } : f));
    await writeDb(db);
  }
  async getSetting(key: string) {
    return (await readDb()).settings[key] ?? null;
  }
  async saveSetting(key: string, value: unknown) {
    const db = await readDb();
    db.settings = { ...db.settings, [key]: value };
    await writeDb(db);
  }
  async festivalOrgMap() {
    const out: Record<string, string> = {};
    for (const f of (await readDb()).festivals) if (f.org_id) out[f.id] = f.org_id;
    return out;
  }
  async seedFestivals(list: Omit<Festival, "id" | "org_id">[]) {
    const db = await readDb();
    const taken = new Set(db.festivals.map((f) => f.slug));
    let added = 0;
    for (const f of list) {
      if (taken.has(f.slug)) continue;
      taken.add(f.slug);
      db.festivals.push({ ...f, id: newId(), org_id: null });
      added++;
    }
    if (added) await writeDb(db);
    return added;
  }
  async festivalUsage(ids: string[]) {
    const { films } = await readDb();
    const want = new Set(ids);
    const out: Record<string, number> = {};
    for (const f of films) for (const x of f.festivals) if (x.festival_id && want.has(x.festival_id)) out[x.festival_id] = (out[x.festival_id] ?? 0) + 1;
    return out;
  }

  // ───── solicitudes de información ─────

  private publicRequest(r: LocalInfoRequest, db: LocalDb): InfoRequest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token_hash, password_hash, ...rest } = r;
    return { ...rest, target_ids: requestTargets(r), submissions_count: db.submissions.filter((s) => s.request_id === r.id).length };
  }

  async createInfoRequest(input: NewInfoRequest) {
    const db = await readDb();
    const rec: LocalInfoRequest = {
      id: newId(),
      kind: input.kind,
      target_id: input.target_id,
      target_ids: allTargets(input.kind, input.target_id, input.extra_ids),
      recipient: input.recipient?.trim() || null,
      recipient_email: input.recipient_email?.trim() || null,
      expires_at: input.expires_at,
      revoked_at: null,
      failed_attempts: 0,
      last_used_at: null,
      created_at: new Date().toISOString(),
      submissions_count: 0,
      token_hash: hashToken(input.token),
      password_hash: hashPassword(input.password),
    };
    db.info_requests.unshift(rec);
    await writeDb(db);
    return this.publicRequest(rec, db);
  }
  async listInfoRequests(opts?: { kind?: SubmissionKind; target_id?: string }) {
    const db = await readDb();
    return db.info_requests
      .filter((r) => (!opts?.kind || r.kind === opts.kind) && (!opts?.target_id || requestTargets(r).includes(opts.target_id)))
      .map((r) => this.publicRequest(r, db));
  }
  async revokeInfoRequest(id: string) {
    const db = await readDb();
    db.info_requests = db.info_requests.map((r) => (r.id === id && !r.revoked_at ? { ...r, revoked_at: new Date().toISOString() } : r));
    await writeDb(db);
  }

  /** Verifica enlace y contraseña (y cuenta los intentos fallidos). */
  private async verifyRequest(db: LocalDb, token: string, password: string) {
    const r = db.info_requests.find((x) => x.token_hash === hashToken(token));
    if (!r) return { ok: false as const, reason: "not_found" as const };
    if (r.revoked_at) return { ok: false as const, reason: "revoked" as const };
    if (new Date(r.expires_at).getTime() < Date.now()) return { ok: false as const, reason: "expired" as const };
    if (r.failed_attempts >= MAX_FAILED_ATTEMPTS) return { ok: false as const, reason: "locked" as const };
    if (!verifyPassword(password, r.password_hash)) {
      r.failed_attempts += 1;
      await writeDb(db);
      return { ok: false as const, reason: "bad_password" as const };
    }
    if (r.failed_attempts) {
      r.failed_attempts = 0;
      await writeDb(db);
    }
    return { ok: true as const, request: r };
  }

  async openInfoRequest(token: string, password: string): Promise<OpenInfoResult> {
    const db = await readDb();
    const v = await this.verifyRequest(db, token, password);
    if (!v.ok) return v;
    const films =
      v.request.kind === "film"
        ? requestTargets(v.request).map((id) => db.films.find((f) => f.id === id)).filter((f): f is Film => !!f)
        : [];
    const org = v.request.kind === "org" ? db.orgs.find((o) => o.id === v.request.target_id) : undefined;
    if (!films.length && !org) return { ok: false, reason: "not_found" };
    const submitted = [...new Set(db.submissions.filter((s) => s.request_id === v.request.id && s.target_id).map((s) => s.target_id as string))];
    return { ok: true, request: this.publicRequest(v.request, db), film: films[0], films, org, submitted };
  }

  async submitInfoRequest(
    token: string,
    password: string,
    data: { payload: FilmInput | OrgInput; note: string; contact: string; submitter: string | null; target_id?: string | null },
  ): Promise<SubmitInfoResult> {
    const db = await readDb();
    const v = await this.verifyRequest(db, token, password);
    if (!v.ok) return v;
    const r = v.request;
    // el enlace solo sirve para las producciones que incluye
    const target = r.kind === "film" ? (data.target_id ?? r.target_id) : r.target_id;
    if (!requestTargets(r).includes(target)) return { ok: false, reason: "not_found" };
    const label = r.kind === "film" ? db.films.find((f) => f.id === target)?.title : db.orgs.find((o) => o.id === target)?.name;
    if (!label) return { ok: false, reason: "not_found" };
    db.submissions.unshift({
      id: newId(),
      kind: r.kind,
      origin: "recopilacion",
      request_id: r.id,
      submitter: data.submitter,
      target_id: target,
      label,
      payload: data.payload,
      note: data.note,
      contact: data.contact,
      status: "pending",
      reviewer_note: null,
      result_id: null,
      created_at: new Date().toISOString(),
      reviewed_at: null,
    });
    r.last_used_at = new Date().toISOString();
    await writeDb(db);
    return { ok: true };
  }
}

// ───────────────────────── Supabase ─────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const rowToLocation = (r: any): FilmLocation => ({
  id: r.id,
  film_id: r.film_id,
  depto_ine: r.depto_ine,
  muni_ine: r.muni_ine,
  country: r.country ?? null,
  city: r.city ?? null,
  site: r.site,
  lat: r.lat,
  lng: r.lng,
  days: r.days,
  local_spend: r.local_spend == null ? null : Number(r.local_spend),
  jobs: r.jobs,
  confidence: r.confidence,
});

const rowToFilmFestival = (r: any): FilmFestival => ({
  id: r.id,
  film_id: r.film_id,
  festival_id: r.festival_id ?? null,
  name: r.name,
  year: r.year,
  country: r.country ?? null,
  city: r.city ?? null,
  result: r.result,
  section: r.section ?? null,
  award: r.award ?? null,
  url: r.url ?? null,
});

const rowToFestival = (r: any): Festival => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  aliases: r.aliases ?? [],
  country: r.country ?? null,
  city: r.city ?? null,
  founded: r.founded ?? null,
  source: r.source ?? null,
  org_id: r.org_id ?? null,
});

const rowToInfoRequest = (r: any): InfoRequest => ({
  id: r.id,
  kind: r.kind,
  target_id: r.target_id,
  target_ids: [r.target_id, ...(Array.isArray(r.target_ids) ? r.target_ids : []).filter((x: string) => x !== r.target_id)],
  recipient: r.recipient ?? null,
  recipient_email: r.recipient_email ?? null,
  expires_at: r.expires_at,
  revoked_at: r.revoked_at ?? null,
  failed_attempts: r.failed_attempts ?? 0,
  last_used_at: r.last_used_at ?? null,
  created_at: r.created_at,
  submissions_count: Number(r.submissions_count ?? 0),
});

const rowToSubmission = (r: any): Submission => ({
  ...(r as Submission),
  origin: r.origin ?? "publico",
  request_id: r.request_id ?? null,
  submitter: r.submitter ?? null,
  import_id: r.import_id ?? null,
  candidates: r.candidates ?? null,
  payload: r.kind === "film" ? upgradeFilmPayload(r.payload) : r.payload,
});

const rowToFilm = (r: any): Film => {
  // filas anteriores a la migración 0020 no traen `crew`: el equipo sale de las columnas clásicas
  const crew = readCrew(r.crew, r);
  return rowToFilmWith(r, crew);
};
const rowToFilmWith = (r: any, crew: FilmCrewMember[]): Film => ({
  id: r.id,
  slug: r.slug,
  title: upperTitle(r.title),
  year: r.year,
  format: isFormat(r.format) ? r.format : legacyKind(r.kind).format,
  nature: isNature(r.nature) ? r.nature : legacyKind(r.kind).nature,
  genres: Array.isArray(r.genres) ? r.genres.map(String) : [],
  duration_min: cleanMinutes(r.duration_min),
  languages: cleanLanguages(r.languages),
  crew,
  ...coreFields(crew),
  nationality: r.nationality,
  budget: r.budget == null ? null : Number(r.budget),
  currency: r.currency,
  synopsis: r.synopsis,
  poster_url: r.poster_url ?? null,
  trailer_url: r.trailer_url ?? null,
  trailer_thumb: r.trailer_thumb ?? null,
  film_url: r.film_url ?? null,
  film_thumb: r.film_thumb ?? null,
  status: r.status,
  completeness: r.completeness,
  missing_fields: r.missing_fields ?? [],
  locations: ((r.film_locations ?? []) as any[])
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(rowToLocation),
  festivals: ((r.film_festivals ?? []) as any[])
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(rowToFilmFestival),
  companies: Array.isArray(r.companies) ? r.companies.map((c: any) => ({ name: String(c.name ?? ""), country: c.country ?? null })) : [],
});
const rowToOrg = (r: any): Org => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  layer: r.layer,
  category: r.category,
  categories: normalizeCategories(r.categories, r.category),
  initiative_type: r.initiative_type,
  depto_ine: r.depto_ine,
  muni_ine: r.muni_ine,
  city: r.city,
  lat: r.lat,
  lng: r.lng,
  web: r.web,
  instagram: r.instagram,
  contact: r.contact,
  description: r.description,
  logo_url: r.logo_url ?? null,
  status: r.status,
  completeness: r.completeness,
  missing_fields: r.missing_fields ?? [],
  source: r.source,
});

const must = <T,>(res: { data: T; error: { message: string } | null }) => {
  if (res.error) throw new Error(res.error.message);
  return res.data;
};

/**
 * Supabase corta cada consulta en 1.000 filas (Max rows). Esto pide por tramos hasta traer todo,
 * para que ninguna lista se trunque en silencio. La consulta debe traer un orden estable.
 */
const PAGE = 1000;
async function pageAll<T = any>(q: { range(from: number, to: number): PromiseLike<{ data: any; error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = must(await q.range(from, from + PAGE - 1)) as T[] | null;
    if (!rows?.length) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export class SupabaseStore implements Store {
  mode = "supabase" as const;
  constructor(private db: SupabaseClient) {}

  async listFilms(opts?: { drafts?: boolean }) {
    let q = this.db.from("films").select("*, film_locations(*), film_festivals(*)").order("title").order("id");
    if (!opts?.drafts) q = q.eq("status", "published");
    return (await pageAll(q)).map(rowToFilm);
  }
  async listOrgs(opts?: { drafts?: boolean }) {
    let q = this.db.from("organizations").select("*").order("name").order("id");
    if (!opts?.drafts) q = q.eq("status", "published");
    return (await pageAll(q)).map(rowToOrg);
  }
  async getFilm(id: string) {
    const r = must(await this.db.from("films").select("*, film_locations(*), film_festivals(*)").eq("id", id).maybeSingle());
    return r ? rowToFilm(r) : null;
  }
  async getOrg(id: string) {
    const r = must(await this.db.from("organizations").select("*").eq("id", id).maybeSingle());
    return r ? rowToOrg(r) : null;
  }

  async saveFilm(input: FilmInput, extra?: { import_id?: string }) {
    const existing = input.id ? await this.getFilm(input.id) : null;
    const slug =
      existing?.slug ??
      uniqueSlug(
        input.title,
        new Set((await pageAll(this.db.from("films").select("slug").order("slug"))).map((r: any) => r.slug)),
        input.year ?? null,
      );
    const film = buildFilm(input, { id: existing?.id, slug, existing });
    must(
      await this.db.from("films").upsert({
        id: film.id,
        slug: film.slug,
        title: film.title,
        year: film.year,
        format: film.format,
        nature: film.nature,
        genres: film.genres,
        duration_min: film.duration_min,
        // las columnas clásicas se mantienen al día (derivadas de `crew`) para poder volver atrás
        director: film.director,
        producer: film.producer,
        cinematographer: film.cinematographer,
        screenwriter: film.screenwriter,
        crew: film.crew,
        languages: film.languages,
        companies: film.companies,
        nationality: film.nationality,
        budget: film.budget,
        currency: film.currency,
        synopsis: film.synopsis,
        poster_url: film.poster_url ?? null,
        trailer_url: film.trailer_url ?? null,
        trailer_thumb: film.trailer_thumb ?? null,
        film_url: film.film_url ?? null,
        film_thumb: film.film_thumb ?? null,
        status: film.status,
        completeness: film.completeness,
        missing_fields: film.missing_fields,
        source: input.source ?? null,
        import_id: extra?.import_id ?? null,
      }),
    );
    must(await this.db.from("film_locations").delete().eq("film_id", film.id));
    if (film.locations.length) {
      must(
        await this.db.from("film_locations").insert(
          film.locations.map((l, i) => ({
            film_id: film.id,
            position: i,
            depto_ine: l.depto_ine,
            muni_ine: l.muni_ine,
            // las columnas de la migración 0014 solo se envían si hay datos: sin migrar, todo lo demás sigue funcionando
            ...(l.country || l.city ? { country: l.country, city: l.city } : {}),
            site: l.site,
            lat: l.lat,
            lng: l.lng,
            days: l.days,
            local_spend: l.local_spend,
            jobs: l.jobs,
            confidence: l.confidence,
          })),
        ),
      );
    }
    // Festivales: solo se reescriben si la entrada los trae (si no, se conservan los actuales).
    if (input.festivals !== undefined) {
      must(await this.db.from("film_festivals").delete().eq("film_id", film.id));
      if (film.festivals.length) {
        // un festival que no está en el catálogo se conserva solo como texto
        const wanted = [...new Set(film.festivals.map((x) => x.festival_id).filter((x): x is string => !!x))];
        const known = new Set<string>(
          wanted.length ? (must(await this.db.from("festivals").select("id").in("id", wanted)) as any[]).map((r) => r.id) : [],
        );
        must(
          await this.db.from("film_festivals").insert(
            film.festivals.map((x, i) => ({
              film_id: film.id,
              position: i,
              festival_id: x.festival_id && known.has(x.festival_id) ? x.festival_id : null,
              name: x.name,
              year: x.year,
              country: x.country,
              city: x.city,
              result: x.result,
              section: x.section,
              award: x.award,
              url: x.url,
            })),
          ),
        );
      }
    }
    return (await this.getFilm(film.id)) ?? film;
  }

  async saveOrg(input: OrgInput, extra?: { import_id?: string }) {
    const existing = input.id ? await this.getOrg(input.id) : null;
    const slug =
      existing?.slug ??
      uniqueSlug(
        input.name,
        new Set((await pageAll(this.db.from("organizations").select("slug").order("slug"))).map((r: any) => r.slug)),
      );
    const org = buildOrg(input, { id: existing?.id, slug });
    must(
      await this.db.from("organizations").upsert({
        id: org.id,
        slug: org.slug,
        name: org.name,
        layer: org.layer,
        category: org.category,
        categories: org.categories,
        initiative_type: org.initiative_type,
        depto_ine: org.depto_ine,
        muni_ine: org.muni_ine,
        city: org.city,
        lat: org.lat,
        lng: org.lng,
        web: org.web,
        instagram: org.instagram,
        contact: org.contact,
        description: org.description,
        logo_url: org.logo_url ?? null,
        status: org.status,
        completeness: org.completeness,
        missing_fields: org.missing_fields,
        source: org.source,
        import_id: extra?.import_id ?? null,
      }),
    );
    return org;
  }

  async deleteFilm(id: string) {
    must(await this.db.from("films").delete().eq("id", id));
  }
  async mergeFilmInto(fromId: string, intoId: string) {
    if (fromId === intoId) return;
    const [from, into] = await Promise.all([this.getFilm(fromId), this.getFilm(intoId)]);
    if (!from || !into) return;
    must(await this.db.from("submissions").update({ target_id: intoId }).eq("target_id", fromId));
    must(await this.db.from("submissions").update({ result_id: intoId }).eq("result_id", fromId));
    must(await this.db.from("info_requests").update({ target_id: intoId }).eq("target_id", fromId));
    // solicitudes consolidadas: el id también puede estar en la lista de las demás producciones
    const multi = (await this.db.from("info_requests").select("id, target_ids").contains("target_ids", [fromId])).data as { id: string; target_ids: string[] }[] | null;
    for (const r of multi ?? []) {
      const ids = [...new Set(r.target_ids.map((t) => (t === fromId ? intoId : t)))];
      must(await this.db.from("info_requests").update({ target_ids: ids }).eq("id", r.id));
    }
    must(await this.db.from("import_questions").update({ record_ref: `film:${into.slug}` }).eq("record_ref", `film:${from.slug}`));
    // locaciones y festivales del que se va se borran en cascada
    must(await this.db.from("films").delete().eq("id", fromId));
  }
  async deleteOrg(id: string) {
    must(await this.db.from("organizations").delete().eq("id", id));
  }

  async saveImport(rec: ImportRecord) {
    must(
      await this.db.from("imports").upsert({
        id: rec.id,
        filename: rec.filename,
        status: rec.status,
        summary: rec.summary,
      }),
    );
    return rec;
  }
  async listImports() {
    const rows = must(await this.db.from("imports").select("*").order("created_at", { ascending: false }).limit(30)) as any[];
    return rows.map((r) => ({ id: r.id, filename: r.filename, status: r.status, summary: r.summary, created_at: r.created_at }));
  }

  async saveQuestions(list: Omit<ImportQuestion, "id" | "created_at">[]) {
    if (!list.length) return;
    must(await this.db.from("import_questions").insert(list));
  }
  async listQuestions(opts?: { status?: QuestionStatus }) {
    let q = this.db.from("import_questions").select("*").order("created_at", { ascending: false }).order("id");
    if (opts?.status) q = q.eq("status", opts.status);
    return (await pageAll(q)) as ImportQuestion[];
  }
  async answerQuestion(id: string, answer: string | null, status: QuestionStatus) {
    must(await this.db.from("import_questions").update({ answer, status }).eq("id", id));
  }

  async createSubmission(input: SubmissionInput) {
    // Quien envía es anónimo: RLS solo permite insertar «pendientes» y no puede leer de vuelta.
    must(
      await this.db.from("submissions").insert({
        id: newId(),
        kind: input.kind,
        target_id: input.target_id,
        label: input.label,
        payload: input.payload,
        note: input.note,
        contact: input.contact,
        status: "pending",
      }),
    );
  }
  async createImportSubmission(input: ImportSubmissionInput) {
    const id = newId();
    must(
      await this.db.from("submissions").insert({
        id,
        kind: input.kind,
        target_id: input.target_id,
        label: input.label,
        payload: input.payload,
        note: input.note,
        contact: null,
        origin: "carga",
        submitter: input.submitter.slice(0, 200),
        import_id: input.import_id,
        candidates: input.candidates,
        status: "pending",
      }),
    );
    return id;
  }
  async listSubmissions(opts?: { status?: SubmissionStatus }) {
    let q = this.db.from("submissions").select("*").order("created_at", { ascending: false }).order("id");
    if (opts?.status) q = q.eq("status", opts.status);
    return (await pageAll(q)).map(rowToSubmission);
  }
  async getSubmission(id: string) {
    const r = must(await this.db.from("submissions").select("*").eq("id", id).maybeSingle());
    return r ? rowToSubmission(r) : null;
  }
  async reviewSubmission(
    id: string,
    patch: { status: SubmissionStatus; reviewer_note?: string | null; result_id?: string | null },
  ) {
    const upd: Record<string, unknown> = {
      status: patch.status,
      reviewer_note: patch.reviewer_note ?? null,
      reviewed_at: new Date().toISOString(),
    };
    if (patch.result_id) upd.result_id = patch.result_id;
    must(await this.db.from("submissions").update(upd).eq("id", id));
  }

  async setRecordsStatus(kind: SubmissionKind, ids: string[], status: RecordStatus) {
    if (!ids.length) return;
    const table = kind === "film" ? "films" : "organizations";
    // en bloques para no pasar el límite de la URL
    for (let i = 0; i < ids.length; i += 100) {
      must(await this.db.from(table).update({ status }).in("id", ids.slice(i, i + 100)));
    }
  }

  // ───── catálogo de festivales ─────

  async searchFestivals(q: string, opts?: { limit?: number; offset?: number; link?: "linked" | "unlinked" }) {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const nq = normalize(q);
    let query = this.db.from("festivals").select("*", { count: "exact" }).order("name");
    // % y _ son comodines de ilike: se quitan (normalize ya deja solo letras, números y espacios)
    if (nq) query = query.ilike("search", `%${nq}%`);
    if (opts?.link === "linked") query = query.not("org_id", "is", null);
    if (opts?.link === "unlinked") query = query.is("org_id", null);
    const res = await query.range(offset, offset + limit - 1);
    if (res.error) throw new Error(res.error.message);
    const rows = (res.data as any[]).map(rowToFestival);
    if (nq) rows.sort((a, b) => Number(!normalize(a.name).startsWith(nq)) - Number(!normalize(b.name).startsWith(nq)) || a.name.localeCompare(b.name));
    return { rows, total: res.count ?? rows.length };
  }
  async getFestival(id: string) {
    const r = must(await this.db.from("festivals").select("*").eq("id", id).maybeSingle());
    return r ? rowToFestival(r) : null;
  }
  async saveFestival(input: FestivalInput) {
    const name = input.name.trim();
    const existing = input.id ? await this.getFestival(input.id) : null;
    const aliases = cleanAliases(name, input.aliases);
    const base = {
      name,
      aliases,
      country: input.country?.trim() || null,
      city: input.city?.trim() || null,
      founded: input.founded ?? null,
      search: festivalSearchKey(name, aliases),
    };
    // org_id solo se escribe cuando viene: así guardar sigue funcionando si la migración 0010 aún no está aplicada
    if (input.org_id !== undefined && input.org_id) must(await this.db.from("festivals").update({ org_id: null }).eq("org_id", input.org_id));
    const link: { org_id?: string | null } = input.org_id === undefined ? {} : { org_id: input.org_id };
    if (existing) {
      must(await this.db.from("festivals").update({ ...base, ...link, source: input.source ?? existing.source }).eq("id", existing.id));
      return { ...existing, ...base, ...link, source: input.source ?? existing.source };
    }
    const slugs = new Set((must(await this.db.from("festivals").select("slug").ilike("slug", `${uniqueSlug(name, new Set())}%`)) as any[]).map((r) => r.slug));
    const row = { id: newId(), slug: uniqueSlug(name, slugs), ...base, ...link, source: input.source ?? null };
    must(await this.db.from("festivals").insert(row));
    return rowToFestival(row);
  }
  async deleteFestival(id: string) {
    must(await this.db.from("festivals").delete().eq("id", id));
  }
  async mergeFestivals(fromId: string, intoId: string) {
    if (fromId === intoId) return;
    const [from, into] = await Promise.all([this.getFestival(fromId), this.getFestival(intoId)]);
    if (!from || !into) return;
    must(await this.db.from("film_festivals").update({ festival_id: into.id, name: into.name }).eq("festival_id", from.id));
    const aliases = cleanAliases(into.name, [...into.aliases, from.name, ...from.aliases]);
    // el vínculo con la entidad pasa al que queda (se suelta primero del otro por el índice único)
    const adopt = !into.org_id && from.org_id ? from.org_id : null;
    if (adopt) must(await this.db.from("festivals").update({ org_id: null }).eq("id", from.id));
    must(await this.db.from("festivals").update({ aliases, search: festivalSearchKey(into.name, aliases), ...(adopt ? { org_id: adopt } : {}) }).eq("id", into.id));
    must(await this.db.from("festivals").delete().eq("id", from.id));
  }
  async linkFestivalOrg(festivalId: string, orgId: string | null) {
    if (orgId) must(await this.db.from("festivals").update({ org_id: null }).eq("org_id", orgId));
    must(await this.db.from("festivals").update({ org_id: orgId }).eq("id", festivalId));
  }
  async getSetting(key: string) {
    const row = must(await this.db.from("site_settings").select("value").eq("key", key).maybeSingle()) as any;
    return row?.value ?? null;
  }
  async saveSetting(key: string, value: unknown) {
    must(await this.db.from("site_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" }));
  }
  async festivalOrgMap() {
    const out: Record<string, string> = {};
    const rows = must(await this.db.from("festivals").select("id, org_id").not("org_id", "is", null)) as any[];
    for (const r of rows) out[r.id] = r.org_id;
    return out;
  }
  async seedFestivals(list: Omit<Festival, "id" | "org_id">[]) {
    let added = 0;
    for (let i = 0; i < list.length; i += 400) {
      const chunk = list.slice(i, i + 400).map((f) => ({
        slug: f.slug,
        name: f.name,
        aliases: f.aliases,
        country: f.country,
        city: f.city,
        founded: f.founded,
        source: f.source,
        search: festivalSearchKey(f.name, f.aliases),
      }));
      const res = await this.db.from("festivals").upsert(chunk, { onConflict: "slug", ignoreDuplicates: true }).select("id");
      if (res.error) throw new Error(res.error.message);
      added += (res.data ?? []).length;
    }
    return added;
  }
  async festivalUsage(ids: string[]) {
    const out: Record<string, number> = {};
    if (!ids.length) return out;
    const rows = must(await this.db.from("film_festivals").select("festival_id").in("festival_id", ids)) as any[];
    for (const r of rows) out[r.festival_id] = (out[r.festival_id] ?? 0) + 1;
    return out;
  }

  // ───── solicitudes de información ─────

  async createInfoRequest(input: NewInfoRequest) {
    const id = must(
      await this.db.rpc("info_request_create", {
        p_kind: input.kind,
        p_target: input.target_id,
        p_token_hash: hashToken(input.token),
        p_password: normPassword(input.password),
        p_recipient: input.recipient ?? null,
        p_email: input.recipient_email ?? null,
        p_expires: input.expires_at,
        // sin la migración 0013 solo funcionan las solicitudes de una producción
        ...(input.kind === "film" && input.extra_ids?.length ? { p_extra: input.extra_ids.filter((x) => x !== input.target_id).slice(0, 19) } : {}),
      }),
    ) as string;
    const list = await this.listInfoRequests({ kind: input.kind, target_id: input.target_id });
    const rec = list.find((r) => r.id === id);
    if (!rec) throw new Error("No se pudo crear la solicitud");
    return rec;
  }
  async listInfoRequests(opts?: { kind?: SubmissionKind; target_id?: string }) {
    let q = this.db.from("info_requests").select("*").order("created_at", { ascending: false });
    if (opts?.kind) q = q.eq("kind", opts.kind);
    if (opts?.target_id) {
      // la principal o una de las producciones extra de una solicitud consolidada
      q = q.or(`target_id.eq.${opts.target_id},target_ids.cs.{${opts.target_id}}`);
    }
    const rows = must(await q) as any[];
    const counts: Record<string, number> = {};
    if (rows.length) {
      const subs = must(await this.db.from("submissions").select("request_id").in("request_id", rows.map((r) => r.id))) as any[];
      for (const s of subs) counts[s.request_id] = (counts[s.request_id] ?? 0) + 1;
    }
    return rows.map((r) => rowToInfoRequest({ ...r, submissions_count: counts[r.id] ?? 0 }));
  }
  async revokeInfoRequest(id: string) {
    must(await this.db.from("info_requests").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null));
  }

  async openInfoRequest(token: string, password: string): Promise<OpenInfoResult> {
    const res = await this.db.rpc("info_request_open", { p_token_hash: hashToken(token), p_password: normPassword(password) });
    if (res.error) throw new Error(res.error.message);
    const j = res.data as any;
    if (!j || j.status !== "ok") return { ok: false, reason: (j?.status ?? "not_found") as never };
    const request = rowToInfoRequest(j.request);
    if (j.request.kind !== "film") return { ok: true, request, org: rowToOrg(j.record) };
    // sin la migración 0013 solo viene `record`
    const films = (Array.isArray(j.records) && j.records.length ? j.records : [j.record]).map(rowToFilm);
    return { ok: true, request, film: films[0], films, submitted: Array.isArray(j.submitted) ? j.submitted.map(String) : [] };
  }

  async submitInfoRequest(
    token: string,
    password: string,
    data: { payload: FilmInput | OrgInput; note: string; contact: string; submitter: string | null; target_id?: string | null },
  ): Promise<SubmitInfoResult> {
    const res = await this.db.rpc("info_request_submit", {
      p_token_hash: hashToken(token),
      p_password: normPassword(password),
      p_payload: data.payload,
      p_note: data.note,
      p_contact: data.contact,
      p_submitter: data.submitter,
      // sin la migración 0013 no existe este parámetro
      ...(data.target_id ? { p_target: data.target_id } : {}),
    });
    if (res.error) throw new Error(res.error.message);
    const status = (res.data as any)?.status;
    return status === "ok" ? { ok: true } : { ok: false, reason: (status ?? "not_found") as never };
  }
}
