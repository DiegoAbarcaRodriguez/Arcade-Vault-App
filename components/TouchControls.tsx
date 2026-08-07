"use client";

import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// Mismos códigos que game.js escucha vía keydown/keyup (ver
// AsteroidsGame.tsx): despachamos eventos de teclado sintéticos en vez
// de duplicar la lógica de input, así el motor no distingue entre
// teclado físico y estos botones.
const CODES = {
  left: "ArrowLeft",
  right: "ArrowRight",
  thrust: "ArrowUp",
  fire: "Space",
} as const;

function dispatchKey(type: "keydown" | "keyup", code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

/**
 * Controles táctiles on-screen para Asteroids, visibles solo en
 * pantallas chicas/táctiles (ver .touch-controls en globals.css).
 * Overlay sobre el canvas: no consume espacio de layout adicional, así
 * el cálculo de tamaño del CRT en GamePlayer.tsx no necesita conocerlos.
 */
export default function TouchControls() {
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
      <div className="touch-group">
        <button
          type="button"
          className="touch-btn"
          aria-label="Rotar izquierda"
          {...bind(CODES.left)}
        >
          ◄
        </button>
        <button
          type="button"
          className="touch-btn"
          aria-label="Propulsar"
          {...bind(CODES.thrust)}
        >
          ▲
        </button>
        <button
          type="button"
          className="touch-btn"
          aria-label="Rotar derecha"
          {...bind(CODES.right)}
        >
          ►
        </button>
      </div>
      <button
        type="button"
        className="touch-btn fire"
        aria-label="Disparar"
        {...bind(CODES.fire)}
      >
        ●
      </button>
    </div>
  );
}
