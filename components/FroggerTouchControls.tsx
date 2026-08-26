"use client";

import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// Mismos códigos que FroggerGame.tsx escucha vía keydown (KEY_TO_DIR):
// despachamos eventos de teclado sintéticos en vez de duplicar la lógica
// de input. Frogger usa 4 direcciones discretas (arriba/abajo/izquierda/
// derecha), un esquema que no matchea el contrato de TouchControls (left/
// right/thrust/fire) — mismo criterio que Serpentina, de ahí el d-pad
// dedicado (SerpentinaTouchControls.tsx) en vez del layout en fila.
const CODES = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
} as const;

function dispatchKey(type: "keydown" | "keyup", code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

/**
 * Controles táctiles on-screen para Frogger (d-pad de 4 botones), visibles
 * solo en pantallas chicas/táctiles (ver .touch-controls en globals.css).
 * Overlay sobre el canvas: no consume espacio de layout adicional.
 *
 * FroggerGame.tsx dispara un salto de 1 celda por cada keydown recibido
 * (no hay repetición continua mientras se mantiene apretado), así que un
 * pointerdown sostenido no produce más de un salto — igual que sostener
 * una flecha del teclado físico, que el navegador no re-dispara como
 * keydown continuo salvo el auto-repeat del propio SO/navegador.
 */
export default function FroggerTouchControls() {
  // Recuerda qué pointerId sostiene cada tecla, para soltarla en el
  // pointerup/pointercancel correcto incluso con multi-touch.
  const activePointers = useRef<Record<string, number>>({});

  const press = useCallback((code: string, pointerId: number) => {
    activePointers.current[code] = pointerId;
    dispatchKey("keydown", code);
  }, []);

  const release = useCallback((code: string, pointerId: number) => {
    if (activePointers.current[code] !== pointerId) return;
    delete activePointers.current[code];
    dispatchKey("keyup", code);
  }, []);

  function bind(code: string) {
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        press(code, e.pointerId);
      },
      onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) =>
        release(code, e.pointerId),
      onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) =>
        release(code, e.pointerId),
    };
  }

  return (
    <div className="touch-controls">
      <div className="touch-group dpad">
        <button
          type="button"
          className="touch-btn dpad-up"
          aria-label="Saltar arriba"
          {...bind(CODES.up)}
        >
          ▲
        </button>
        <button
          type="button"
          className="touch-btn dpad-left"
          aria-label="Saltar izquierda"
          {...bind(CODES.left)}
        >
          ◄
        </button>
        <button
          type="button"
          className="touch-btn dpad-right"
          aria-label="Saltar derecha"
          {...bind(CODES.right)}
        >
          ►
        </button>
        <button
          type="button"
          className="touch-btn dpad-down"
          aria-label="Saltar abajo"
          {...bind(CODES.down)}
        >
          ▼
        </button>
      </div>
    </div>
  );
}
