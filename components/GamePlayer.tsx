"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameWithStats } from "@/lib/supabase/queries";
import { submitScore } from "@/lib/supabase/actions";
import {
  GAME_REGISTRY,
  type GameHandle,
  type GameHudState,
} from "@/components/games/registry";
import SkinSelector from "@/components/games/SkinSelector";
import type { Skin } from "@/lib/games/skins";

export default function GamePlayer({ game }: { game: GameWithStats }) {
  const [hud, setHud] = useState<GameHudState | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const gameRef = useRef<GameHandle>(null);

  // Estado de la pantalla "guardar puntaje" que aparece en GAME OVER.
  const [scoreName, setScoreName] = useState("");
  const [scoreSaved, setScoreSaved] = useState(false);
  const [scoreDismissed, setScoreDismissed] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Recuerda si nosotros pausamos el juego solo para mostrar el modal de
  // FIN, para no reanudarlo si ya estaba pausado por el jugador antes.
  const autoPausedRef = useRef(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const crtRef = useRef<HTMLDivElement>(null);
  const crtScreenRef = useRef<HTMLDivElement>(null);
  const entry = GAME_REGISTRY[game.id];
  const isPlayable = Boolean(entry);
  const showLives = entry?.showLives ?? true;
  const showLevel = entry?.showLevel ?? true;

  // Ajusta el tamaño del CRT en tiempo real según el espacio real
  // disponible (medido, no adivinado): así entra completo sin scroll y
  // aprovecha el máximo de ancho/alto sin importar si el nav o el HUD
  // envuelven a varias líneas, el navegador, o si es desktop o mobile.
  useLayoutEffect(() => {
    const player = playerRef.current;
    const crt = crtRef.current;
    if (!player || !crt) return;

    let frame = 0;

    function fit() {
      if (!player || !crt) return;
      const crtScreen = crt.querySelector<HTMLElement>(".crt-screen");
      const crtBottom = crt.querySelector<HTMLElement>(".crt-bottom");
      if (!crtScreen) return;

      const playerStyle = getComputedStyle(player);
      const paddingLeft = parseFloat(playerStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(playerStyle.paddingRight) || 0;
      const paddingBottom = parseFloat(playerStyle.paddingBottom) || 0;
      const marginBottom = parseFloat(playerStyle.marginBottom) || 0;
      const contentWidth = player.clientWidth - paddingLeft - paddingRight;

      // .crt-screen es lo único con aspect-ratio 4:3; el padding de .crt
      // y .crt-bottom se miden aparte (no aproximan a 4:3 del CRT entero).
      const crtStyle = getComputedStyle(crt);
      const crtPadLeft = parseFloat(crtStyle.paddingLeft) || 0;
      const crtPadRight = parseFloat(crtStyle.paddingRight) || 0;
      const crtPadTop = parseFloat(crtStyle.paddingTop) || 0;
      const crtPadBottom = parseFloat(crtStyle.paddingBottom) || 0;
      let crtBottomOuterHeight = 0;
      if (crtBottom) {
        const crtBottomMarginTop =
          parseFloat(getComputedStyle(crtBottom).marginTop) || 0;
        crtBottomOuterHeight =
          crtBottom.getBoundingClientRect().height + crtBottomMarginTop;
      }

      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const top = crt.getBoundingClientRect().top;
      const availableHeight =
        viewportHeight - top - paddingBottom - marginBottom;

      // Sin piso mínimo artificial: en viewports extremadamente bajos
      // (mobile en horizontal, ventanas muy chicas) preferimos un CRT
      // pequeño antes que forzar scroll, que es la prioridad explícita.
      const maxScreenHeight = Math.max(
        0,
        availableHeight - crtPadTop - crtPadBottom - crtBottomOuterHeight,
      );
      const heightDrivenWidth =
        maxScreenHeight / 0.75 + crtPadLeft + crtPadRight;

      const width = Math.max(0, Math.min(contentWidth, heightDrivenWidth));
      crt.style.width = `${width}px`;
    }

    function scheduleFit() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    }

    scheduleFit();

    // ResizeObserver detecta cualquier cambio de layout que mueva o
    // cambie el alto de lo que está arriba del CRT (nav/HUD envolviendo
    // en pantallas angostas, fuentes cargando, etc.), no solo resize de
    // ventana. visualViewport cubre el toolbar dinámico de mobile.
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(player);
    window.addEventListener("resize", scheduleFit);
    window.addEventListener("orientationchange", scheduleFit);
    window.visualViewport?.addEventListener("resize", scheduleFit);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("orientationchange", scheduleFit);
      window.visualViewport?.removeEventListener("resize", scheduleFit);
    };
  }, []);

  const score = isPlayable ? (hud?.score ?? 0) : 0;
  const lives = isPlayable ? (hud?.lives ?? 3) : 3;
  const level = isPlayable ? (hud?.level ?? 1) : 1;

  // Cada vez que se sale de "gameover" (reinicio de partida), reseteamos la
  // pantalla de guardado de puntaje para que la próxima partida vuelva a
  // pedir nombre desde cero.
  useEffect(() => {
    if (hud?.phase !== "gameover") {
      setScoreName("");
      setScoreSaved(false);
      setScoreDismissed(false);
      setSavingScore(false);
      setSaveError(null);
    }
  }, [hud?.phase]);

  const handleSaveScore = async () => {
    if (!scoreName.trim() || savingScore) return;
    setSavingScore(true);
    setSaveError(null);
    try {
      await submitScore(game.id, scoreName, score);
      setScoreSaved(true);
    } catch {
      setSaveError("No se pudo guardar el puntaje. Intentá de nuevo.");
    } finally {
      setSavingScore(false);
    }
  };

  const handlePause = () => {
    if (!isPlayable) return;
    gameRef.current?.togglePause();
  };

  const handleSkinChange = (skin: Skin) => {
    gameRef.current?.setSkin?.(skin);
  };

  const handleFullscreen = () => {
    if (!isPlayable) return;
    // Se pide fullscreen sobre .crt-screen (no sobre el canvas del juego):
    // ese contenedor incluye tanto el canvas como TouchControls, así los
    // controles táctiles siguen visibles en mobile dentro de la pantalla
    // completa.
    crtScreenRef.current?.requestFullscreen?.().catch(() => {
      // La Fullscreen API puede rechazar (navegador sin soporte, falta de
      // gesto de usuario, permisos de iframe, etc.): el juego sigue
      // jugable en tamaño normal, no hace falta manejarlo más.
    });
  };

  const handleFin = () => {
    if (!isPlayable) return;
    if (hud?.phase === "playing") {
      gameRef.current?.togglePause();
      autoPausedRef.current = true;
    } else {
      autoPausedRef.current = false;
    }
    setConfirmingEnd(true);
  };

  const handleConfirmEnd = () => {
    gameRef.current?.forceGameOver();
    setConfirmingEnd(false);
  };

  const handleCancelEnd = () => {
    if (autoPausedRef.current) {
      gameRef.current?.togglePause();
    }
    setConfirmingEnd(false);
  };

  const handleRestart = () => {
    if (!isPlayable) return;
    gameRef.current?.restart();
  };

  return (
    <div className="av-player fade-in" ref={playerRef}>
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              INVITADO
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{score}</div>
          </div>
          {showLives && (
            <div className="hud-stat lives">
              <div className="l">Vidas</div>
              <div className="v">{"♥ ".repeat(lives).trim()}</div>
            </div>
          )}
          {showLevel && (
            <div className="hud-stat level">
              <div className="l">Nivel</div>
              <div className="v">{String(level).padStart(2, "0")}</div>
            </div>
          )}
        </div>
        <div className="hud-actions">
          {hud?.skin && (
            <div className="hud-skin-select">
              <SkinSelector value={hud.skin} onChange={handleSkinChange} />
            </div>
          )}
          <button type="button" className="btn yellow" onClick={handlePause}>
            PAUSA
          </button>
          <button type="button" className="btn magenta" onClick={handleFin}>
            FIN
          </button>
          {isPlayable && (
            <button
              type="button"
              className="btn"
              onClick={handleFullscreen}
              title="Pantalla completa"
              aria-label="Pantalla completa"
            >
              ⛶
            </button>
          )}
          <Link href={`/juego/${game.id}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt" ref={crtRef}>
        <div className="crt-screen" ref={crtScreenRef}>
          {isPlayable && entry ? (
            <>
              <entry.Game ref={gameRef} onHudChange={setHud} />
              {entry.Touch && <entry.Touch />}
            </>
          ) : (
            <div className="game-arena">
              <div className="grid-floor"></div>
              <div className="enemy e1"></div>
              <div className="enemy e2"></div>
              <div className="enemy e3"></div>
              <div className="player-ship"></div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {confirmingEnd && (
        <div className="modal-bd">
          <div className="modal">
            <h2>¿TERMINAR PARTIDA?</h2>
            <p
              style={{
                fontFamily: "var(--mono)",
                fontSize: 13,
                color: "var(--ink-faint)",
              }}
            >
              Vas a perder el progreso de esta partida.
            </p>
            <div className="actions">
              <button
                type="button"
                className="btn magenta"
                onClick={handleConfirmEnd}
              >
                SI
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={handleCancelEnd}
              >
                NO
              </button>
            </div>
          </div>
        </div>
      )}

      {isPlayable && hud?.phase === "gameover" && !scoreDismissed && (
        <div className="modal-bd">
          <div className="modal">
            <h2>GAME OVER</h2>
            <div className="final-label">PUNTAJE FINAL</div>
            <div className="final">{score.toLocaleString("es-ES")}</div>
            {scoreSaved ? (
              <>
                <div className="toast-saved">PUNTAJE GUARDADO</div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn magenta"
                    onClick={handleRestart}
                  >
                    JUGAR DE NUEVO
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setScoreDismissed(true)}
                  >
                    CERRAR
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="input-row">
                  <input
                    type="text"
                    value={scoreName}
                    onChange={(e) => setScoreName(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    maxLength={12}
                    placeholder="TUS INICIALES"
                    autoFocus
                  />
                </div>
                {saveError && (
                  <p
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      color: "var(--magenta)",
                    }}
                  >
                    {saveError}
                  </p>
                )}
                <div className="actions">
                  <button
                    type="button"
                    className="btn magenta"
                    onClick={handleSaveScore}
                    disabled={!scoreName.trim() || savingScore}
                  >
                    {savingScore ? "GUARDANDO..." : "GUARDAR PUNTAJE"}
                  </button>
                  <button type="button" className="btn" onClick={handleRestart}>
                    JUGAR DE NUEVO
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setScoreDismissed(true)}
                  >
                    OMITIR
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
