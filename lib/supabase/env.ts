export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Sin variables de Supabase la app funciona en modo local o demo. */
export const supabaseConfigured = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
