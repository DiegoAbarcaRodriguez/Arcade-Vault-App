"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendContactMessage, type ContactFormState } from "@/app/acerca-de/actions";

const INITIAL_STATE: ContactFormState = { status: "idle" };

export default function ContactForm() {
  const [state, formAction, pending] = useActionState(sendContactMessage, INITIAL_STATE);
  const [shake, setShake] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "error") {
      setShake(true);
      const t = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (state.status === "success") {
    return (
      <div className="terminal-success">
        <div className="term-bar">
          <span className="dot r"></span>
          <span className="dot y"></span>
          <span className="dot g"></span>
          <span className="term-title">VAULT-OS // TERMINAL</span>
        </div>
        <div className="term-body">
          <div className="line">
            <span className="prompt">vault@arcade:~$</span> ./send_message --to=team
          </div>
          <div className="line dim">[OK] Conectando con servidor…</div>
          <div className="line dim">[OK] Validando contenido…</div>
          <div className="line dim">[OK] Transmitiendo paquete…</div>
          <div className="line success">
            &gt; MENSAJE RECIBIDO. TE RESPONDEREMOS PRONTO. GRACIAS, {state.name?.toUpperCase()}.
            <span className="caret">_</span>
          </div>
          <div style={{ marginTop: 18 }}>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setResetKey((k) => k + 1)}
            >
              ENVIAR OTRO MENSAJE
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      key={resetKey}
      ref={formRef}
      className={"contact-form" + (shake ? " shake" : "")}
      action={formAction}
    >
      <div className="field">
        <label>NOMBRE</label>
        <input name="name" placeholder="px_kai" />
      </div>
      <div className="field">
        <label>CORREO ELECTRÓNICO</label>
        <input type="email" name="email" placeholder="jugador@vault.gg" />
      </div>
      <div className="field">
        <label>MENSAJE</label>
        <textarea name="msg" rows={5} placeholder="Cuéntanos qué tienes en mente…"></textarea>
      </div>
      {state.status === "error" && (
        <div className="pixel neon-magenta" style={{ fontSize: 10, marginBottom: 14 }}>
          ▸ {state.error}
        </div>
      )}
      <button className="btn xl press" type="submit" style={{ width: "100%" }} disabled={pending}>
        {pending ? "▶  ENVIANDO…" : "▶  ENVIAR MENSAJE"}
      </button>
    </form>
  );
}
