import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (equivalente al middleware en Next < 16, ver
 * node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 *
 * Único trabajo: refrescar la cookie de sesión de Supabase en cada request
 * para que `supabase.auth.getUser()` funcione en Server Components. No redirige
 * ni bloquea ninguna ruta — el gate "solo autenticados guardan puntaje" vive en
 * el Server Action `submitScore`, no acá (ver spec 10).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresca el token si está por vencer y reescribe las cookies en `response`.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Corre en todo excepto assets estáticos de Next y archivos de imagen.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
