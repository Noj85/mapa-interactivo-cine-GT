import { redirect } from "next/navigation";

/** Enlace corto de la convocatoria: abre el registro de una persona. */
export default function RegistroPersona() {
  redirect("/aportar?tipo=persona");
}
