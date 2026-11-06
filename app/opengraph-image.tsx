import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Imagen que aparece al compartir cualquier dirección del sitio (WhatsApp, redes, correo, Slack…), incluidos los enlaces
 * de las solicitudes de información. Se genera una sola vez al construir el sitio. Es la misma para todas las páginas
 * y nunca lleva datos de un enlace privado.
 */
export const alt = "Mapa del Cine de Guatemala · PROCINE y la Academia Guatemalteca de Artes y Ciencias Cinematográficas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const file = (...p: string[]) => readFile(path.join(process.cwd(), ...p));
const dataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;

export default async function OpenGraphImage() {
  const [book, logo, academia, procine] = await Promise.all([
    file("fonts", "biennale", "Biennale Book.otf"),
    file("public", "brand", "mapa-logo-dark.png"),
    file("public", "brand", "academia-dark.png"),
    file("public", "brand", "procine-dark.png"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px 56px",
          color: "#fff",
          fontFamily: "Biennale",
          backgroundColor: "#0c1a36",
          backgroundImage:
            "radial-gradient(circle at 14% 40%, rgba(219,39,187,0.34) 0%, rgba(138,83,194,0.16) 30%, rgba(12,26,54,0) 62%), linear-gradient(135deg, #12274d 0%, #090d16 100%)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(logo, "image/png")} width={900} height={203} alt="" />
          <div style={{ marginTop: 40, fontSize: 38, fontWeight: 400, lineHeight: 1.3, color: "#c3cee6" }}>
            Dónde se rueda, se exhibe y se produce el cine nacional.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 40, borderTop: "1px solid rgba(255,255,255,0.18)", paddingTop: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(academia, "image/png")} height={84} width={321} alt="" />
          <div style={{ width: 1, height: 52, backgroundColor: "rgba(255,255,255,0.28)" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(procine, "image/png")} height={52} width={205} alt="" />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Biennale", data: book, weight: 400, style: "normal" },
      ],
    },
  );
}
