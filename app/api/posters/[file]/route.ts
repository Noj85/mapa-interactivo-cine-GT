import { promises as fs } from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/posters";

export const runtime = "nodejs";

/** Sirve los pósters del modo local (con Supabase salen del bucket público). */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[a-zA-Z0-9-]+(-thumb)?\.webp$/.test(file)) return new Response("No encontrado", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(UPLOAD_DIR, file));
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
