"use client";

import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// Mismos códigos que TetrisGame.tsx escucha vía keydown (ver
// components/TetrisGame.tsx): despachamos eventos de teclado sintéticos
// en vez de duplicar la lógica de input. El esquema difiere del de
// Asteroids (sin "thrust", con soft/hard drop), por eso este componente
// no reusa TouchControls.
const CODES = {
  left: "ArrowLeft",
  right: "ArrowRight",
  rotate: "ArrowUp",
  down: "ArrowDown",
  drop: "Space",
} as const;

function dispatchKey(type: "keydown" | "keyup", code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

/**
 * Controles táctiles on-screen para Tetris, visibles solo en pantallas
 * chicas/táctiles (ver .touch-controls en globals.css). Overlay sobre el
 * canvas: no consume espacio de layout adicional.
 */
export default function TetrisTouchControls() {
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
          aria-label="Mover izquierda"
          {...bind(CODES.left)}
        >
          ◄
        </button>
        <button
          type="button"
          className="touch-btn"
          aria-label="Bajar"
          {...bind(CODES.down)}
        >
          ▼
        </button>
        <button
          type="button"
          className="touch-btn"
          aria-label="Mover derecha"
          {...bind(CODES.right)}
        >
          ►
        </button>
      </div>
      <div className="touch-group">
        <button
          type="button"
          className="touch-btn"
          aria-label="Rotar"
          {...bind(CODES.rotate)}
        >
          ↻
        </button>
        <button
          type="button"
          className="touch-btn fire"
          aria-label="Caída instantánea"
          {...bind(CODES.drop)}
        >
          ⤓
        </button>
      </div>
    </div>
  );
}
