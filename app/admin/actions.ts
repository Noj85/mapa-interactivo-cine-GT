"use server";

import { revalidatePath } from "next/cache";
import { adminStore, requireSession } from "@/lib/auth";
import { cleanGenres, parseFormat, parseNature, splitGenreText } from "@/lib/film-types";
import { linkFestivals, syncOrgFestivalSafe } from "@/lib/festivals-server";
import { serverGazetteer } from "@/lib/geo/server";
import { deletePublicImages } from "@/lib/posters";
import { filmSchema, orgSchema } from "@/lib/schemas";
import { isAbroad } from "@/lib/completeness";
import { applyFilmFields, applyOrgFields, createFilmFromImport, createOrgFromImport, planFilmUpdate, planOrgUpdate } from "@/lib/import/apply-server";
import { applyCorrection, planCorrection } from "@/lib/submissions-plan";
import { applyMerge, type MergeChoice } from "@/lib/merge-films";
import { z } from "zod";
import type { Film, FilmInput, Org, OrgInput, QuestionStatus, RecordStatus } from "@/lib/types";

type Result = { ok: true; id: string } | { ok: false; error: string };

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/admin");
};

export async function saveFilmAction(raw: unknown): Promise<Result> {
  await requireSession();
  const parsed = filmSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const store = await adminStore();
    const data = parsed.data as unknown as FilmInput;
    data.festivals = await linkFestivals(store, data.festivals);
    const film = await store.saveFilm(data);
    refresh();
    return { ok: true, id: film.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveOrgAction(raw: unknown): Promise<Result> {
  await requireSession();
  const parsed = orgSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const store = await adminStore();
    const org = await store.saveOrg(parsed.data as unknown as OrgInput);
    // un festival de Circulación queda vinculado con el catálogo (o por revisar)
    await syncOrgFestivalSafe(store, org);
    refresh();
    return { ok: true, id: org.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Cambia solo el póster de una producción existente (carga masiva). */
export async function setPosterAction(filmId: string, url: string | null): Promise<Result> {
  await requireSession();
  if (url !== null && !/^(https:\/\/|\/api\/posters\/)/.test(url)) return { ok: false, error: "Enlace de póster no válido" };
  try {
    const store = await adminStore();
    const film = await store.getFilm(filmId);
    if (!film) return { ok: false, error: "Producción no encontrada" };
    await store.saveFilm({ ...film, poster_url: url, locations: film.locations, status: film.status });
    refresh();
    return { ok: true, id: filmId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Publica (en el mapa) u oculta varios registros a la vez. */
export async function setRecordsStatusAction(
  kind: "film" | "org",
  ids: string[],
  status: RecordStatus,
): Promise<{ ok: true; count: number; skipped: number } | { ok: false; error: string }> {
  await requireSession();
  let list = [...new Set(ids)].filter((x) => typeof x === "string" && x.length > 0 && x.length <= 80).slice(0, 2000);
  if (!list.length) return { ok: false, error: "No hay registros seleccionados" };
  if (status !== "published" && status !== "draft") return { ok: false, error: "Estado no válido" };
  try {
    const store = await adminStore();
    const before = list.length;
    if (status === "published" && kind === "org") {
      // una entidad necesita categoría y lugar para poder mostrarse en el mapa
      const ok = new Set(
        (await store.listOrgs({ drafts: true }))
          .filter((o) => o.category && (o.depto_ine != null || o.muni_ine != null || (o.lat != null && o.lng != null)))
          .map((o) => o.id),
      );
      list = list.filter((id) => ok.has(id));
    }
    if (list.length) await store.setRecordsStatus(kind, list, status);
    refresh();
    revalidatePath("/admin/peliculas");
    revalidatePath("/admin/entidades");
    revalidatePath("/admin/resumen");
    return { ok: true, count: list.length, skipped: before - list.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteFilmAction(id: string): Promise<Result> {
  await requireSession();
  try {
    await (await adminStore()).deleteFilm(id);
    refresh();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const sideSchema = z.enum(["a", "b"]);
const mergeChoiceSchema = z.object({
  keep: sideSchema,
  fields: z.record(z.string(), sideSchema),
  poster: sideSchema.optional(),
  locations: z.array(z.string().max(120)).max(200),
  festivals: z.array(z.string().max(120)).max(200),
  companies: z.array(z.string().max(120)).max(100),
  genres: z.array(z.string().max(200)).max(100),
});

/**
 * Fusiona dos producciones duplicadas: guarda en la que se queda lo elegido de cada versión, pasa a ella los aportes,
 * solicitudes y preguntas de la otra, y borra la otra. El plan se recalcula aquí sobre los registros de hoy.
 */
export async function mergeFilmsAction(aId: string, bId: string, raw: unknown): Promise<Result> {
  await requireSession();
  const parsedChoice = mergeChoiceSchema.safeParse(raw);
  if (!parsedChoice.success) return { ok: false, error: "Selección inválida" };
  if (aId === bId) return { ok: false, error: "Elige dos producciones distintas" };
  try {
    const store = await adminStore();
    const [a, b] = await Promise.all([store.getFilm(aId), store.getFilm(bId)]);
    if (!a || !b) return { ok: false, error: "Una de las producciones ya no existe. Recarga la página." };
    const choice = parsedChoice.data as MergeChoice;
    const merged = applyMerge(a, b, await serverGazetteer(), choice);
    const parsed = filmSchema.safeParse(merged);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    const input = parsed.data as unknown as FilmInput;
    input.festivals = await linkFestivals(store, input.festivals);
    const keep = choice.keep === "a" ? a : b;
    const drop = choice.keep === "a" ? b : a;
    const saved = await store.saveFilm({ ...input, id: keep.id, source: undefined });
    await store.mergeFilmInto(drop.id, keep.id);
    // los pósters que ya no usa nadie
    const unused = [a.poster_url, b.poster_url].filter((u): u is string => !!u && u !== saved.poster_url);
    if (unused.length) await deletePublicImages([...new Set(unused)]);
    refresh();
    revalidatePath("/admin/peliculas");
    revalidatePath("/admin/aportes");
    return { ok: true, id: saved.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteOrgAction(id: string): Promise<Result> {
  await requireSession();
  try {
    await (await adminStore()).deleteOrg(id);
    refresh();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const FILM_FIELDS = new Set(["year", "director", "producer", "cinematographer", "screenwriter", "nationality", "budget", "synopsis"]);
const ORG_FIELDS = new Set(["initiative_type", "web", "instagram", "contact", "description", "city"]);

/** Guarda la respuesta y, si es posible, la aplica al registro correspondiente. */
export async function answerQuestionAction(id: string, answer: string | null, status: QuestionStatus) {
  await requireSession();
  const store = await adminStore();
  await store.answerQuestion(id, answer, status);

  if (status === "answered" && answer) {
    const q = (await store.listQuestions()).find((x) => x.id === id);
    if (q?.record_ref && q.field) {
      const [kind, slug] = [q.record_ref.split(":")[0], q.record_ref.split(":").slice(1).join(":")];
      if (kind === "film") {
        const film = (await store.listFilms({ drafts: true })).find((f) => f.slug === slug);
        if (film) {
          const input: FilmInput = { ...film, locations: film.locations };
          if (q.field === "location") {
            const gaz = await serverGazetteer();
            const hit = gaz.resolve(answer)[0];
            if (hit) {
              const target = input.locations.find((l) => l.muni_ine == null && !isAbroad(l)) ?? null;
              const loc = {
                muni_ine: hit.entry.type === "muni" ? hit.entry.code : null,
                depto_ine: hit.entry.depto_ine,
              };
              if (target) Object.assign(target, loc);
              else input.locations = [...input.locations, loc];
            }
          } else if (q.field === "format" || q.field === "nature" || q.field === "kind") {
            // «kind» es el campo de las preguntas guardadas antes del cambio
            const f = parseFormat(answer);
            const n = parseNature(answer);
            if (f && q.field !== "nature") input.format = f;
            if (n && q.field !== "format") input.nature = n;
          } else if (q.field === "genres") {
            input.genres = cleanGenres([...(film.genres ?? []), ...splitGenreText(answer)]);
          } else if (FILM_FIELDS.has(q.field)) {
            (input as unknown as Record<string, unknown>)[q.field] = answer;
          }
          await store.saveFilm({ ...input, status: film.status });
        }
      } else if (kind === "org") {
        const org = (await store.listOrgs({ drafts: true })).find((o) => o.slug === slug);
        if (org) {
          const input = { ...org } as unknown as OrgInput & Record<string, unknown>;
          if (q.field === "location") {
            const hit = (await serverGazetteer()).resolve(answer)[0];
            if (hit) {
              input.muni_ine = hit.entry.type === "muni" ? hit.entry.code : null;
              input.depto_ine = hit.entry.depto_ine;
            }
          } else if (ORG_FIELDS.has(q.field)) input[q.field] = answer;
          await store.saveOrg({ ...input, status: org.status });
        }
      }
    }
  }
  refresh();
}

// ───────────────────────── aportes del público ─────────────────────────

const SOURCE_PUBLIC = "Aporte del público";

/**
 * Aprueba un aporte: crea el registro (nuevo) o aplica la corrección sobre el existente.
 * `publish` en un registro nuevo lo publica o lo deja oculto; en una corrección, `publish` además lo muestra en el mapa
 * (si no, conserva su estado). El póster o logo actuales se conservan salvo que el aporte traiga una imagen nueva.
 */
export async function approveSubmissionAction(
  id: string,
  opts: { publish: boolean; note?: string | null; accepted?: string[] },
): Promise<{ ok: true; kind: "film" | "org"; recordId: string } | { ok: false; error: string }> {
  await requireSession();
  try {
    const store = await adminStore();
    const sub = await store.getSubmission(id);
    if (!sub) return { ok: false, error: "Aporte no encontrado" };
    if (sub.status !== "pending") return { ok: false, error: "Este aporte ya fue revisado" };
    if (sub.origin === "carga") return { ok: false, error: "Este aporte viene de una carga de archivo: se revisa campo por campo." };
    const newStatus: RecordStatus = opts.publish ? "published" : "draft";
    let recordId: string;
    let reviewNote = opts.note ?? null;

    // Aceptación parcial (solo correcciones): se aplica lo marcado sobre el registro de hoy. Sin `accepted`, se aprueba todo como siempre.
    if (opts.accepted) {
      if (!sub.target_id) return { ok: false, error: "Solo las correcciones a un registro existente se pueden aceptar en parte." };
      const gaz = await serverGazetteer();
      const current = sub.kind === "film" ? await store.getFilm(sub.target_id) : await store.getOrg(sub.target_id);
      if (!current) return { ok: false, error: "El registro a corregir ya no existe" };
      const res = applyCorrection(sub, current, gaz, opts.accepted);
      if (!res) return { ok: false, error: "Los datos del aporte no son válidos" };
      if (!res.applied.length) return { ok: false, error: "No marcaste nada para aplicar. Si no hay nada que aceptar, rechaza el aporte." };
      const status = opts.publish ? "published" : current.status;
      const payload = sub.payload as { poster_url?: string | null; logo_url?: string | null };
      const proposedImage = (sub.kind === "film" ? payload.poster_url : payload.logo_url) || null;
      const currentImage = (sub.kind === "film" ? (current as Film).poster_url : (current as Org).logo_url) ?? null;
      const dropped: (string | null)[] = [];
      if (sub.kind === "film") {
        const input = res.input as FilmInput;
        input.festivals = await linkFestivals(store, input.festivals);
        const film = await store.saveFilm({ ...input, id: current.id, status, source: undefined });
        recordId = film.id;
        if (currentImage && film.poster_url !== currentImage) dropped.push(currentImage);
      } else {
        const input = res.input as OrgInput;
        const org = await store.saveOrg({ ...input, id: current.id, status, source: (current as Org).source });
        await syncOrgFestivalSafe(store, org);
        recordId = org.id;
        if (currentImage && org.logo_url !== currentImage) dropped.push(currentImage);
      }
      // la imagen que se propuso y no se aceptó ya no sirve
      const usedImage = res.applied.some((i) => i.id === "field:poster" || i.id === "field:logo");
      if (proposedImage && proposedImage !== currentImage && !usedImage) dropped.push(proposedImage);
      const dropFiles = dropped.filter((u): u is string => !!u);
      if (dropFiles.length) await deletePublicImages(dropFiles);

      // la nota deja constancia de qué se aplicó y qué no
      const names = (items: { label: string }[]) => {
        const n = new Map<string, number>();
        for (const i of items) n.set(i.label, (n.get(i.label) ?? 0) + 1);
        return [...n].map(([k, c]) => (c > 1 ? `${k} (${c})` : k)).join(", ");
      };
      const plan = planCorrection(sub, current, gaz).items;
      const appliedIds = new Set(res.applied.map((i) => i.id));
      const left = plan.filter((i) => !appliedIds.has(i.id));
      const summary = `Aceptado en parte. Aplicado: ${names(res.applied)}.${left.length ? ` No aplicado: ${names(left)}.` : ""}`;
      reviewNote = [reviewNote, summary].filter(Boolean).join("\n");

      await store.reviewSubmission(id, { status: "approved", reviewer_note: reviewNote, result_id: recordId });
      refresh();
      revalidatePath("/admin/aportes");
      return { ok: true, kind: sub.kind, recordId };
    }

    if (sub.kind === "film") {
      const parsed = filmSchema.safeParse(sub.payload);
      if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
      const input = parsed.data as unknown as FilmInput;
      // los festivales nuevos del aporte entran al catálogo (o se unen a uno que ya existe)
      input.festivals = await linkFestivals(store, input.festivals);
      const current = sub.target_id ? await store.getFilm(sub.target_id) : null;
      if (sub.target_id && !current) return { ok: false, error: "El registro a corregir ya no existe" };
      // el póster del aporte solo reemplaza al actual si trae uno nuevo
      const poster = input.poster_url || current?.poster_url || null;
      const film = await store.saveFilm(
        current
          ? { ...input, id: current.id, poster_url: poster, status: opts.publish ? "published" : current.status, source: undefined }
          : { ...input, poster_url: poster, status: newStatus, source: SOURCE_PUBLIC },
      );
      if (current?.poster_url && poster !== current.poster_url) await deletePublicImages([current.poster_url]);
      recordId = film.id;
    } else {
      const parsed = orgSchema.safeParse(sub.payload);
      if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
      const input = parsed.data as unknown as OrgInput;
      const current = sub.target_id ? await store.getOrg(sub.target_id) : null;
      if (sub.target_id && !current) return { ok: false, error: "El registro a corregir ya no existe" };
      const logo = input.logo_url || current?.logo_url || null;
      const org = await store.saveOrg(
        current
          ? { ...input, id: current.id, logo_url: logo, status: opts.publish ? "published" : current.status, source: current.source }
          : { ...input, logo_url: logo, status: newStatus, source: SOURCE_PUBLIC },
      );
      if (current?.logo_url && logo !== current.logo_url) await deletePublicImages([current.logo_url]);
      await syncOrgFestivalSafe(store, org);
      recordId = org.id;
    }

    await store.reviewSubmission(id, { status: "approved", reviewer_note: reviewNote, result_id: recordId });
    refresh();
    revalidatePath("/admin/aportes");
    return { ok: true, kind: sub.kind, recordId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Aprueba un aporte «Carga de archivo». Siempre se recalcula contra el registro tal como está HOY:
 *  - `update`: se aplican solo los campos marcados (`accepted`, ids del plan); lo demás del registro no se toca;
 *  - `create`: la persona decidió que no existía y se crea como registro nuevo.
 */
export async function approveImportSubmissionAction(
  id: string,
  opts: { mode: "update"; targetId: string; accepted: string[]; show?: boolean; note?: string | null } | { mode: "create"; publish: boolean; note?: string | null },
): Promise<{ ok: true; kind: "film" | "org"; recordId: string } | { ok: false; error: string }> {
  await requireSession();
  try {
    const store = await adminStore();
    const sub = await store.getSubmission(id);
    if (!sub) return { ok: false, error: "Aporte no encontrado" };
    if (sub.origin !== "carga") return { ok: false, error: "Este aporte no viene de una carga de archivo." };
    if (sub.status !== "pending") return { ok: false, error: "Este aporte ya fue revisado" };
    let recordId: string;

    if (opts.mode === "create") {
      const status: RecordStatus = opts.publish ? "published" : "draft";
      if (sub.kind === "film") {
        const parsed = filmSchema.safeParse(sub.payload);
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
        recordId = (await createFilmFromImport(store, parsed.data as unknown as FilmInput, status, sub.import_id)).id;
      } else {
        const parsed = orgSchema.safeParse(sub.payload);
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
        recordId = (await createOrgFromImport(store, parsed.data as unknown as OrgInput, status, sub.import_id)).id;
      }
    } else {
      if (!opts.accepted.length) return { ok: false, error: "No marcaste nada para aplicar. Si no hay nada que aplicar, rechaza el aporte." };
      if (sub.kind === "film") {
        const parsed = filmSchema.safeParse(sub.payload);
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
        const current = await store.getFilm(opts.targetId);
        if (!current) return { ok: false, error: "El registro ya no existe" };
        const incoming = parsed.data as unknown as FilmInput;
        // solo ids que existan hoy en el plan (el registro pudo cambiar desde la carga)
        const valid = new Set(planFilmUpdate(current, incoming).items.map((i) => i.id));
        const res = await applyFilmFields(store, current, incoming, opts.accepted.filter((x) => valid.has(x)), sub.import_id);
        if (!res.saved) return { ok: false, error: "Eso ya no cambia nada: el registro cambió desde la carga. Recarga la página." };
        recordId = res.saved.id;
        if (opts.show && current.status === "draft") await store.setRecordsStatus("film", [recordId], "published");
      } else {
        const parsed = orgSchema.safeParse(sub.payload);
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
        const current = await store.getOrg(opts.targetId);
        if (!current) return { ok: false, error: "El registro ya no existe" };
        const incoming = parsed.data as unknown as OrgInput;
        const valid = new Set(planOrgUpdate(current, incoming).items.map((i) => i.id));
        const res = await applyOrgFields(store, current, incoming, opts.accepted.filter((x) => valid.has(x)), sub.import_id);
        if (!res.saved) return { ok: false, error: "Eso ya no cambia nada: el registro cambió desde la carga. Recarga la página." };
        recordId = res.saved.id;
        if (opts.show && current.status === "draft") await store.setRecordsStatus("org", [recordId], "published");
      }
    }

    await store.reviewSubmission(id, { status: "approved", reviewer_note: opts.note ?? null, result_id: recordId });
    refresh();
    revalidatePath("/admin/aportes");
    return { ok: true, kind: sub.kind, recordId };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function rejectSubmissionAction(id: string, note: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSession();
  try {
    const store = await adminStore();
    const sub = await store.getSubmission(id);
    if (!sub) return { ok: false, error: "Aporte no encontrado" };
    if (sub.status !== "pending") return { ok: false, error: "Este aporte ya fue revisado" };
    await store.reviewSubmission(id, { status: "rejected", reviewer_note: note?.trim() || null });
    // las imágenes que subió el público ya no hacen falta (salvo que algún registro las esté usando)
    const p = sub.payload as { poster_url?: string | null; logo_url?: string | null };
    const mine = [p.poster_url, p.logo_url].filter((u): u is string => !!u);
    if (mine.length) {
      const [films, orgs] = await Promise.all([store.listFilms({ drafts: true }), store.listOrgs({ drafts: true })]);
      const inUse = new Set([...films.map((f) => f.poster_url), ...orgs.map((o) => o.logo_url)]);
      await deletePublicImages(mine.filter((u) => !inUse.has(u)));
    }
    revalidatePath("/admin");
    revalidatePath("/admin/aportes");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
