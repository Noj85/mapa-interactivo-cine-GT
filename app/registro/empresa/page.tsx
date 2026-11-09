import { redirect } from "next/navigation";

/** Enlace corto de la convocatoria: abre una entidad de Industria con «Productoras» marcada. */
export default function RegistroEmpresa() {
  redirect("/aportar?tipo=entidad&capa=industria");
}
