"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ActualizarPassword() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  // "checking" mientras se resuelve si hay sesión de recuperación;
  // luego "ready" (mostrar formulario) o "invalid" (enlace inválido/expirado).
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setPhase(data.session ? "ready" : "invalid");
    });

    // El enlace del correo trae un `code` que el cliente intercambia solo
    // (detectSessionInUrl). Si llega tarde, este listener lo captura.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) setPhase("ready");
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== repeat) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark"></div>
          <h2 className="neon-cyan">ARCADE VAULT</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            NUEVA CONTRASEÑA
          </div>
        </div>

        {phase === "checking" && (
          <p className="auth-note">Verificando el enlace…</p>
        )}

        {phase === "invalid" && (
          <>
            <p className="auth-note">
              Este enlace no es válido o ya expiró. Pide uno nuevo desde
              &quot;¿Olvidaste tu contraseña?&quot;.
            </p>
            <Link className="btn ghost" style={{ width: "100%" }} href="/auth">
              IR A INICIAR SESIÓN
            </Link>
          </>
        )}

        {phase === "ready" && (
          <>
            {error && <div className="auth-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Nueva contraseña</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>Repetir contraseña</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  required
                />
              </div>
              <button
                className="btn lg"
                type="submit"
                disabled={busy}
                style={{ width: "100%", marginTop: 8 }}
              >
                {busy ? "GUARDANDO…" : "GUARDAR CONTRASEÑA"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
