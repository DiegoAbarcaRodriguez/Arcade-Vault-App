import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";

/**
 * Devuelve el usuario autenticado según la cookie de sesión, o `null` si no hay
 * sesión. Pensado para Server Components, Server Actions y Route Handlers.
 *
 * Usa `supabase.auth.getUser()` (no `getSession()`), que revalida el token
 * contra el servidor de Supabase en vez de confiar en la cookie tal cual.
 */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
