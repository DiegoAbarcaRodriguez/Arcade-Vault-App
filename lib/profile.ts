import type { User } from "@supabase/supabase-js";

export type Profile = {
  username: string | null;
  avatar_url: string | null;
};

/**
 * Nombre visible del usuario en sesión. Prioridad: el `username` que el
 * usuario haya guardado en su perfil, luego lo que trae el proveedor OAuth
 * (`full_name` / `name` / `user_name`), luego la parte local del correo, y
 * como último recurso un genérico. Para filas de leaderboard sin usuario en
 * sesión se sigue usando el fallback "Anónimo" de `lib/supabase/queries.ts`.
 */
export function displayName(
  profile: Profile | null,
  user: User | null,
): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [
    profile?.username,
    meta.full_name,
    meta.name,
    meta.user_name,
    meta.preferred_username,
    user?.email ? user.email.split("@")[0] : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "JUGADOR";
}

/**
 * Google entrega una URL de avatar incluso cuando el usuario no subió foto:
 * es un monograma de colores (círculo rojo con la inicial) servido desde
 * `.../a/ACg8oc...`. Eso choca con el estilo del Navbar, así que lo
 * descartamos y dejamos que el badge muestre nuestras propias iniciales.
 */
function isRealPhoto(url: string): boolean {
  return !/googleusercontent\.com\/a\/ACg8oc/i.test(url);
}

/** URL de foto real del proveedor, o `null` si no hay (o es un monograma). */
export function avatarUrl(
  profile: Profile | null,
  user: User | null,
): string | null {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [profile?.avatar_url, meta.avatar_url, meta.picture];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() && isRealPhoto(c.trim())) {
      return c.trim();
    }
  }
  return null;
}

/**
 * Iniciales para el avatar de reemplazo cuando no hay imagen: dos letras.
 * "Diego Abarca Rodriguez" -> "DA"; una sola palabra -> sus dos primeras
 * letras ("px_kai" -> "PX").
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  // Nombre + primer apellido (en nombres en español el segundo apellido
  // suele quedar fuera): "Diego Abarca Rodriguez" -> "DA".
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
