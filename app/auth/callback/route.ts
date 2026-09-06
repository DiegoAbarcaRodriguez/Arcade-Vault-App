import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback de auth: intercambia el `code` de la URL por una sesión.
 * Lo usan tanto el flujo OAuth (Google/GitHub) como el link de confirmación
 * de email. Éxito → `/`. Fallo o `code` ausente → `/auth?error=oauth`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=oauth`);
}
