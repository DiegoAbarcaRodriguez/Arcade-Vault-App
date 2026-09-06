"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Tab = "in" | "up";

// Espeja el preset de Supabase Auth ("Lowercase, uppercase letters, digits and
// symbols"): minúscula + mayúscula + dígito + símbolo ASCII, entre 8 y 72
// caracteres (bcrypt trunca a 72 bytes). Se valida acá para dar un error claro
// antes de llamar a signUp; Supabase lo vuelve a exigir del lado del servidor.
const PASSWORD_RE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\]).{8,72}$/;

export default function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("in");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const oauthError = searchParams.get("error") === "oauth";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === "up") {
        const wantedName = username.trim();
        if (!wantedName) {
          setError("Elige un nombre de usuario.");
          return;
        }
        // El nombre de usuario es único a nivel global (índice
        // profiles_username_lower_key). Se valida acá para dar un error
        // claro; el índice es la garantía real ante una carrera.
        const { data: taken } = await supabase
          .from("profiles")
          .select("id")
          // escapa los comodines de LIKE para comparar el texto literal
          .ilike("username", wantedName.replace(/([\\%_])/g, "\\$1"))
          .maybeSingle();
        if (taken) {
          setError("Ese nombre de usuario ya está en uso. Elige otro.");
          return;
        }
        if (!PASSWORD_RE.test(password)) {
          setError(
            "La contraseña debe tener 8+ caracteres e incluir minúscula, mayúscula, dígito y símbolo.",
          );
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: wantedName },
            emailRedirectTo: `${origin}/auth/callback`,
          },
        });
        if (error) {
          setError(
            /rate limit|too many/i.test(error.message)
              ? "Demasiados intentos. Espera unos minutos antes de volver a probar."
              : error.message,
          );
          return;
        }
        // Con "Confirmar correo" activo y el correo ya registrado, Supabase
        // no envía nada y devuelve un usuario "vacío" (sin identities) para
        // no revelar si la cuenta existe. Hay que avisarlo o el usuario
        // espera un correo que nunca llega.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setError(
            "Ese correo ya está registrado. Inicia sesión o usa «¿Olvidaste tu contraseña?».",
          );
          setTab("in");
          return;
        }
        setCheckEmail(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(error.message);
          return;
        }
        router.push("/");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/actualizar-password`,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setResetSent(true);
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback` },
    });
  };

  if (forgot) {
    return (
      <div className="av-auth-wrap fade-in">
        <div className="auth-card">
          <div className="auth-header">
            <div className="mark"></div>
            <h2 className="neon-cyan">ARCADE VAULT</h2>
          </div>

          {resetSent ? (
            <p className="auth-note">
              Si hay una cuenta con <strong>{email}</strong>, te enviamos un
              correo con el enlace para restablecer la contraseña.
            </p>
          ) : (
            <>
              <p className="auth-note">
                Ingresa tu correo y te enviaremos un enlace para crear una nueva
                contraseña.
              </p>
              {error && <div className="auth-error">{error}</div>}
              <form onSubmit={handleReset}>
                <div className="field">
                  <label>Correo electrónico</label>
                  <input
                    type="email"
                    placeholder="jugador@vault.gg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button
                  className="btn lg"
                  type="submit"
                  disabled={busy}
                  style={{ width: "100%", marginTop: 8 }}
                >
                  {busy ? "ENVIANDO…" : "ENVIAR ENLACE"}
                </button>
              </form>
            </>
          )}

          <button
            className="btn ghost"
            style={{ width: "100%", marginTop: 10 }}
            onClick={() => {
              setForgot(false);
              setResetSent(false);
              setError(null);
            }}
          >
            VOLVER A INICIAR SESIÓN
          </button>
        </div>
      </div>
    );
  }

  if (checkEmail) {
    return (
      <div className="av-auth-wrap fade-in">
        <div className="auth-card">
          <div className="auth-header">
            <div className="mark"></div>
            <h2 className="neon-cyan">ARCADE VAULT</h2>
          </div>
          <p className="auth-note">
            Te enviamos un correo de confirmación a <strong>{email}</strong>.
            Ábrelo para activar tu cuenta y luego inicia sesión.
          </p>
          <button
            className="btn ghost"
            style={{ width: "100%" }}
            onClick={() => {
              setCheckEmail(false);
              setTab("in");
              setPassword("");
            }}
          >
            VOLVER A INICIAR SESIÓN
          </button>
        </div>
      </div>
    );
  }

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
            ACCESO AL SISTEMA · v2.6
          </div>
        </div>

        <div className="auth-tabs">
          <button
            className={tab === "in" ? "on" : ""}
            onClick={() => {
              setTab("in");
              setError(null);
            }}
          >
            INICIAR SESIÓN
          </button>
          <button
            className={tab === "up" ? "on" : ""}
            onClick={() => {
              setTab("up");
              setError(null);
            }}
          >
            CREAR CUENTA
          </button>
        </div>

        {(error || oauthError) && (
          <div className="auth-error">
            {error ??
              "No se pudo completar el inicio de sesión con el proveedor. Intenta de nuevo."}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {tab === "up" && (
            <div className="field slide-in">
              <label>Usuario</label>
              <input
                placeholder="px_kai"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}
          <div className="field">
            <label>Correo electrónico</label>
            <input
              type="email"
              placeholder="jugador@vault.gg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={tab === "up" ? 8 : undefined}
              required
            />
            {tab === "up" && (
              <p className="auth-note" style={{ fontSize: 11, marginTop: 4 }}>
                Mínimo 8 caracteres, con minúscula, mayúscula, dígito y símbolo.
              </p>
            )}
          </div>

          <button
            className="btn lg"
            type="submit"
            disabled={busy}
            style={{ width: "100%", marginTop: 8 }}
          >
            {busy
              ? "PROCESANDO…"
              : tab === "in"
                ? "ENTRAR AL VAULT"
                : "CREAR Y JUGAR"}
          </button>
        </form>

        {tab === "in" && (
          <button
            type="button"
            className="auth-link"
            onClick={() => {
              setForgot(true);
              setError(null);
            }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        <button
          className="btn ghost"
          style={{ width: "100%", marginTop: 10 }}
          onClick={() => router.push("/")}
        >
          JUGAR COMO INVITADO
        </button>

        <div className="auth-divider">O CONTINÚA CON</div>
        <div className="social">
          <button
            className="btn ghost"
            type="button"
            onClick={() => handleOAuth("google")}
          >
            ◆ GOOGLE
          </button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => handleOAuth("github")}
          >
            ▣ GITHUB
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            textAlign: "center",
            fontSize: 11,
            color: "var(--ink-faint)",
            letterSpacing: "0.1em",
          }}
        >
          AL ENTRAR ACEPTAS LOS TÉRMINOS DEL SALÓN ARCADE
        </div>
      </div>
    </div>
  );
}
