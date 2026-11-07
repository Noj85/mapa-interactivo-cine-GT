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
  const [book, semibold, bold, mark, academia, procine] = await Promise.all([
    file("fonts", "biennale", "Biennale Book.otf"),
    file("fonts", "biennale", "Biennale SemiBold.otf"),
    file("fonts", "biennale", "Biennale Bold.otf"),
    file("public", "brand", "mapa-mark-dark.png"),
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
          {/* La marca (cinta y pin) va como imagen; el nombre se escribe en Biennale */}
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <img src={dataUri(mark, "image/png")} width={340} height={184} alt="" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1, letterSpacing: -1.5, color: "#fff" }}>MAPA DEL CINE</div>
              <div style={{ marginTop: 14, fontSize: 50, fontWeight: 600, lineHeight: 1, letterSpacing: 12, color: "#e0369a" }}>DE GUATEMALA</div>
            </div>
          </div>
          <div style={{ marginTop: 44, fontSize: 34, fontWeight: 400, lineHeight: 1.3, color: "#c3cee6" }}>
            Dónde se filma, dónde se ve y quién hace cine en Guatemala.
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
        { name: "Biennale", data: semibold, weight: 600, style: "normal" },
        { name: "Biennale", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
