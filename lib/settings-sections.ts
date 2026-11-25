/**
 * Secciones de Ajustes. Las que tienen `enabled: false` se ven en la barra lateral, atenuadas y con «Próximamente»;
 * para activar una, se cambia `enabled` y se crea su página en app/admin/(panel)/ajustes/<id>.
 */
export interface SettingsSection {
  id: string;
  group: string;
  title: string;
  description: string;
  enabled: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "cifras",
    group: "Mapa público",
    title: "Cifras públicas",
    description: "Elegir qué cifras muestra el mapa público: producciones con locación, días de rodaje, inversión local y empleos.",
    enabled: true,
  },
  {
    id: "mapa",
    group: "Mapa público",
    title: "Zona del mapa",
    description: "Elegir si el mapa muestra solo Guatemala o también los países vecinos y el mar.",
    enabled: true,
  },
  {
    id: "festivales",
    group: "Catálogos",
    title: "Festivales",
    description: "Lista de referencia para sugerir festivales al registrar producciones.",
    enabled: true,
  },
  {
    id: "categorias-paises",
    group: "Catálogos",
    title: "Categorías y países",
    description: "Editar las categorías de entidades y la lista de países sin tocar el código.",
    enabled: false,
  },
  {
    id: "contrasena",
    group: "Cuenta",
    title: "Cambiar mi contraseña",
    description: "Cambiar la contraseña de tu cuenta del equipo.",
    enabled: false,
  },
  {
    id: "usuarios",
    group: "Equipo",
    title: "Usuarios administradores",
    description: "Invitar, quitar y cambiar el rol de quienes usan la consola. Requerirá la clave de servicio de Supabase.",
    enabled: false,
  },
  {
    id: "roles",
    group: "Equipo",
    title: "Roles y permisos",
    description: "Definir qué puede hacer cada rol (administración, edición, solo lectura).",
    enabled: false,
  },
  {
    id: "solicitudes",
    group: "Solicitudes de información",
    title: "Vigencia y mensaje",
    description: "Vigencia por defecto del enlace privado y texto base del mensaje que se envía.",
    enabled: false,
  },
  {
    id: "tipos",
    group: "Datos",
    title: "Tipos de número",
    description: "Revisar días, empleos y otros números ya guardados que traen texto o decimales, y dejarlos como enteros.",
    enabled: true,
  },
  {
    id: "respaldo",
    group: "Datos",
    title: "Respaldo y exportación",
    description: "Descargar una copia completa de la base de datos (producciones, entidades, festivales y aportes).",
    enabled: false,
  },
  {
    id: "historial",
    group: "Datos",
    title: "Historial de cambios",
    description: "Ver quién cambió qué y cuándo en los registros.",
    enabled: false,
  },
];

/** Secciones agrupadas, en el orden en que aparecen. */
export function settingsGroups() {
  const groups: { name: string; items: SettingsSection[] }[] = [];
  for (const s of SETTINGS_SECTIONS) {
    let g = groups.find((x) => x.name === s.group);
    if (!g) groups.push((g = { name: s.group, items: [] }));
    g.items.push(s);
  }
  return groups;
}
