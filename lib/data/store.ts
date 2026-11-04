import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFilm, buildOrg, newId, uniqueSlug } from "@/lib/data/records";
import type {
  Film,
  FilmInput,
  FilmLocation,
  ImportQuestion,
  ImportRecord,
  Org,
  OrgInput,
  QuestionStatus,
  Submission,
  SubmissionInput,
  SubmissionStatus,
} from "@/lib/types";

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
  deleteOrg(id: string): Promise<void>;
  saveImport(rec: ImportRecord): Promise<ImportRecord>;
  listImports(): Promise<ImportRecord[]>;
  saveQuestions(list: Omit<ImportQuestion, "id" | "created_at">[]): Promise<void>;
  listQuestions(opts?: { status?: QuestionStatus }): Promise<ImportQuestion[]>;
  answerQuestion(id: string, answer: string | null, status: QuestionStatus): Promise<void>;
  /** Aportes del público. `createSubmission` es lo único que puede llamar quien no es del equipo. */
  createSubmission(input: SubmissionInput): Promise<void>;
  listSubmissions(opts?: { status?: SubmissionStatus }): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | null>;
  reviewSubmission(
    id: string,
    patch: { status: SubmissionStatus; reviewer_note?: string | null; result_id?: string | null },
  ): Promise<void>;
}

// ───────────────────────── Local ─────────────────────────

interface LocalDb {
  films: Film[];
  orgs: Org[];
  imports: ImportRecord[];
  questions: ImportQuestion[];
  submissions: Submission[];
}

const DB_PATH = path.join(process.cwd(), ".data", "db.json");

async function readDb(): Promise<LocalDb> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const j = JSON.parse(raw) as Partial<LocalDb>;
    return {
      films: j.films ?? [],
      orgs: j.orgs ?? [],
      imports: j.imports ?? [],
      questions: j.questions ?? [],
      submissions: j.submissions ?? [],
    };
  } catch {
    return { films: [], orgs: [], imports: [], questions: [], submissions: [] };
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
    const film = buildFilm(input, { id: existing?.id, slug });
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
  async deleteOrg(id: string) {
    const db = await readDb();
    db.orgs = db.orgs.filter((o) => o.id !== id);
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
      status: "pending",
      reviewer_note: null,
      result_id: null,
      created_at: new Date().toISOString(),
      reviewed_at: null,
    });
    await writeDb(db);
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
}

// ───────────────────────── Supabase ─────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const rowToLocation = (r: any): FilmLocation => ({
  id: r.id,
  film_id: r.film_id,
  depto_ine: r.depto_ine,
  muni_ine: r.muni_ine,
  site: r.site,
  lat: r.lat,
  lng: r.lng,
  days: r.days,
  local_spend: r.local_spend == null ? null : Number(r.local_spend),
  jobs: r.jobs,
  confidence: r.confidence,
});

const rowToFilm = (r: any): Film => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  year: r.year,
  kind: r.kind,
  director: r.director,
  producer: r.producer,
  nationality: r.nationality,
  budget: r.budget == null ? null : Number(r.budget),
  currency: r.currency,
  synopsis: r.synopsis,
  poster_url: r.poster_url ?? null,
  status: r.status,
  completeness: r.completeness,
  missing_fields: r.missing_fields ?? [],
  locations: ((r.film_locations ?? []) as any[])
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(rowToLocation),
});

const rowToOrg = (r: any): Org => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  layer: r.layer,
  category: r.category,
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

export class SupabaseStore implements Store {
  mode = "supabase" as const;
  constructor(private db: SupabaseClient) {}

  async listFilms(opts?: { drafts?: boolean }) {
    let q = this.db.from("films").select("*, film_locations(*)").order("title");
    if (!opts?.drafts) q = q.eq("status", "published");
    return (must(await q) as any[]).map(rowToFilm);
  }
  async listOrgs(opts?: { drafts?: boolean }) {
    let q = this.db.from("organizations").select("*").order("name");
    if (!opts?.drafts) q = q.eq("status", "published");
    return (must(await q) as any[]).map(rowToOrg);
  }
  async getFilm(id: string) {
    const r = must(await this.db.from("films").select("*, film_locations(*)").eq("id", id).maybeSingle());
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
        new Set((must(await this.db.from("films").select("slug")) as any[]).map((r) => r.slug)),
        input.year ?? null,
      );
    const film = buildFilm(input, { id: existing?.id, slug });
    must(
      await this.db.from("films").upsert({
        id: film.id,
        slug: film.slug,
        title: film.title,
        year: film.year,
        kind: film.kind,
        director: film.director,
        producer: film.producer,
        nationality: film.nationality,
        budget: film.budget,
        currency: film.currency,
        synopsis: film.synopsis,
        poster_url: film.poster_url ?? null,
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
    return (await this.getFilm(film.id)) ?? film;
  }

  async saveOrg(input: OrgInput, extra?: { import_id?: string }) {
    const existing = input.id ? await this.getOrg(input.id) : null;
    const slug =
      existing?.slug ??
      uniqueSlug(
        input.name,
        new Set((must(await this.db.from("organizations").select("slug")) as any[]).map((r) => r.slug)),
      );
    const org = buildOrg(input, { id: existing?.id, slug });
    must(
      await this.db.from("organizations").upsert({
        id: org.id,
        slug: org.slug,
        name: org.name,
        layer: org.layer,
        category: org.category,
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
    let q = this.db.from("import_questions").select("*").order("created_at", { ascending: false });
    if (opts?.status) q = q.eq("status", opts.status);
    return must(await q) as ImportQuestion[];
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
  async listSubmissions(opts?: { status?: SubmissionStatus }) {
    let q = this.db.from("submissions").select("*").order("created_at", { ascending: false });
    if (opts?.status) q = q.eq("status", opts.status);
    return must(await q) as Submission[];
  }
  async getSubmission(id: string) {
    const r = must(await this.db.from("submissions").select("*").eq("id", id).maybeSingle());
    return (r as Submission | null) ?? null;
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
}
