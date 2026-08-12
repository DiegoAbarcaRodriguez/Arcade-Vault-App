# Referencia técnica — contrato de un juego jugable en Arcade Vault

Este archivo es consulta para la skill `add-game`. Documenta los contratos y patrones exactos ya
implementados por Asteroids (spec 05/06) que cualquier juego nuevo debe respetar. No es texto para
copiar dentro del spec — es la fuente de verdad para no reinventar (ni desviarse de) lo que ya existe.

---

## 1. Contrato del registro de juegos (`components/games/registry.ts`)

```ts
export interface GameHudState {
  score: number;
  lives: number;
  level: number;
  phase: "playing" | "paused" | "dead" | "gameover";
  // Métricas propias del juego (ej. tripleShotSeconds, lines) que el
  // canvas dibuja en su propio HUD interno; el panel externo no las usa.
  extra?: Record<string, string | number>;
}

export interface GameHandle {
  togglePause: () => void;
  forceGameOver: () => void; // usado por el botón FIN tras confirmar
}

export interface GameComponentProps {
  onHudChange?: (state: GameHudState) => void;
}

export type GameComponent = ForwardRefExoticComponent<
  GameComponentProps & RefAttributes<GameHandle>
>;

export interface GameEntry {
  Game: GameComponent;
  Touch?: ComponentType; // controles táctiles, opcional
  showLives?: boolean; // default true
  showLevel?: boolean; // default true
}

export const GAME_REGISTRY: Record<string, GameEntry> = {
  asteroides: {
    Game: AsteroidsGame,
    Touch: TouchControls,
    showLives: true,
    showLevel: true,
  },
  // <id>: { Game: <Juego>Game, Touch: <Juego>TouchControls, showLives, showLevel },
};
```

`components/GamePlayer.tsx` busca `GAME_REGISTRY[game.id]`; si no hay entrada, muestra la arena
decorativa estática de siempre (sin cambios). Agregar un juego = agregar una entrada acá + los
archivos que referencia.

## 2. Boilerplate de integración React (patrón obligatorio)

Todo `components/<Juego>Game.tsx` sigue exactamente esta forma — ver `components/AsteroidsGame.tsx`
como implementación de referencia completa:

```tsx
"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { GameComponentProps, GameHandle, GameHudState } from "@/components/games/registry";

const <Juego>Game = forwardRef<GameHandle, GameComponentProps>(
  function <Juego>Game({ onHudChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // El callback más reciente, sin reiniciar el motor cuando cambia.
    const onHudChangeRef = useRef(onHudChange);
    useEffect(() => { onHudChangeRef.current = onHudChange; }, [onHudChange]);

    // Los métodos reales se asignan dentro del useEffect (cierran sobre el
    // estado mutable del motor); este ref los expone sin reiniciar el motor.
    const controlsRef = useRef<GameHandle>({ togglePause: () => {}, forceGameOver: () => {} });
    useImperativeHandle(ref, () => ({
      togglePause: () => controlsRef.current.togglePause(),
      forceGameOver: () => controlsRef.current.forceGameOver(),
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // ── TODO el motor vive acá adentro: input, clases, estado mutable,
      // loop. Cada montaje crea su propio estado aislado, sin globals
      // compartidos entre instancias. ──

      // Input: listeners en window (no en el canvas) — así los controles
      // táctiles pueden despachar KeyboardEvent sintéticos y reusar la
      // misma lógica sin un canal de input paralelo.
      const keys: Record<string, boolean> = {};
      // ... handleKeyDown/handleKeyUp con preventDefault() en las teclas
      // que el juego controla, para que no scrollee la página.

      // HUD externo: reportar solo cuando cambia algún valor, nunca en
      // cada frame (evita renders de React a 60fps).
      let lastHud: GameHudState | null = null;
      function reportHud() {
        const next: GameHudState = { score, lives, level, phase, extra: { /* ... */ } };
        if (/* algún campo relevante cambió respecto a lastHud */) {
          lastHud = next;
          onHudChangeRef.current?.(next);
        }
      }

      controlsRef.current.togglePause = () => { /* playing <-> paused */ reportHud(); };
      controlsRef.current.forceGameOver = () => { /* fuerza phase = "gameover" */ reportHud(); };

      let rafId = 0;
      let lastTime: number | null = null;
      function loop(ts: number) {
        const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05); // dt capeado
        lastTime = ts;
        update(dt); draw(); reportHud();
        rafId = requestAnimationFrame(loop);
      }
      initGame(); reportHud(); rafId = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, []); // deps vacías: el motor se crea una sola vez por montaje

    return (
      <div className="game-arena game-arena-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="game-canvas" />
      </div>
    );
  },
);
export default <Juego>Game;
```

**Nunca** dibujar la pausa/game-over como UI DOM propia del motor fuente — el motor solo necesita
pintar su HUD interno (score/vidas/nivel dentro del canvas, igual que Asteroids) y overlays de texto
tipo "PAUSADO"/"GAME OVER" **dentro del canvas**; el modal de confirmación de FIN y la pantalla de
guardar puntaje ya existen en `GamePlayer.tsx` y no se duplican.

## 3. Controles táctiles

`components/TouchControls.tsx` (existente) cubre `←→↑Espacio` despachando `KeyboardEvent` sintéticos
al `window`:

```ts
const CODES = {
  left: "ArrowLeft",
  right: "ArrowRight",
  thrust: "ArrowUp",
  fire: "Space",
} as const;
function dispatchKey(type: "keydown" | "keyup", code: string) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}
```

Si el esquema del juego nuevo usa otros códigos (ej. sin "thrust", con "hard drop"), copiar este
archivo a `components/<Juego>TouchControls.tsx` y ajustar `CODES` + los botones renderizados — pero
reusar las clases CSS `.touch-controls` / `.touch-group` / `.touch-btn` / `.touch-btn.fire`
(`app/globals.css`, bajo `@media (max-width: 840px)`), no inventar CSS nuevo.

## 4. CSS — cover art y canvas

### Receta de `.cover-<id>` (pixel-art puro CSS)

Elemento base con gradiente de fondo; `::after` con `clip-path` o `linear-gradient` en capas dibuja
el sprite; `::before` opcional agrega un acento pequeño; siempre `filter: drop-shadow(0 0 Npx <neón>)`.

```css
.cover-asteroides {
  /* app/globals.css línea ~811 */
  background: radial-gradient(circle at 55% 35%, #0a1030, #000);
}
.cover-asteroides::after {
  content: "";
  position: absolute;
  inset: 0;
  background: #9a9a9a;
  clip-path: polygon(
    20% 35%,
    30% 20%,
    45% 25%,
    50% 15%,
    62% 22%,
    68% 35%,
    60% 48%,
    65% 60%,
    55% 68%,
    40% 65%,
    28% 55%
  );
  opacity: 0.85;
  filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.15));
}
.cover-asteroides::before {
  content: "";
  position: absolute;
  left: 68%;
  top: 66%;
  width: 0;
  height: 0;
  border-left: 9px solid transparent;
  border-right: 9px solid transparent;
  border-bottom: 15px solid var(--yellow);
  transform: rotate(135deg);
  filter: drop-shadow(0 0 6px var(--yellow));
}
```

```css
.cover-tetro {
  /* app/globals.css línea ~694 */
  background: radial-gradient(circle at 50% 100%, #2a004a, #0a0a18);
}
.cover-tetro::after {
  content: "";
  position: absolute;
  inset: 20% 30% 0 30%;
  background:
    linear-gradient(#00f5ff, #00f5ff) 0 0/25% 33%,
    linear-gradient(#ff006e, #ff006e) 25% 0/25% 33%,
    linear-gradient(#f5ff00, #f5ff00) 50% 33%/25% 33%,
    linear-gradient(#00ff88, #00ff88) 25% 66%/25% 33%,
    linear-gradient(#ff7700, #ff7700) 50% 66%/25% 33%,
    linear-gradient(#aa00ff, #aa00ff) 75% 33%/25% 33%;
  background-repeat: no-repeat;
  filter: drop-shadow(0 0 8px rgba(0, 245, 255, 0.4));
  image-rendering: pixelated;
}
```

Variables de color disponibles: `--cyan`, `--magenta`, `--green`, `--yellow`, `--gold`, `--ink`,
`--ink-faint`, `--line`, `--bg`, `--bg-2`.

### Canvas del juego

Toda arena con motor propio usa las clases genéricas ya generalizadas (no crear una clase nueva por
juego):

```css
.game-arena.game-arena-canvas {
  background: #000;
}
.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none; /* evita scroll al arrastrar sobre el canvas en mobile */
}
```

Fullscreen (`.crt-screen:fullscreen`) ya apunta a `.game-canvas` con `object-fit: contain` — no hace
falta ninguna regla adicional por juego, solo usar esa clase en el `<canvas>`.

## 5. Supabase — esquema y funciones existentes

```sql
create table games (
  id text primary key, title text not null, short text not null, long text not null,
  cat text not null, cover text not null, color text not null,
  created_at timestamptz not null default now()
);
create table scores (
  id bigint generated always as identity primary key,
  game_id text not null references games(id),
  player_name text not null, score integer not null,
  created_at timestamptz not null default now()
);
```

RLS: `games` — `SELECT` público, sin `INSERT`/`UPDATE`/`DELETE` desde cliente (se administra vía
migraciones). `scores` — `SELECT` e `INSERT` públicos sin restricciones (riesgo aceptado y
documentado en spec 06: sin rate-limit ni validación de contenido).

Insertar un juego nuevo, vía `mcp__supabase__apply_migration`:

```sql
insert into games (id, title, short, long, cat, cover, color)
values ('<id>', '<title>', '<short>', '<long>', '<cat>', '<cover>', '<color>');
```

`lib/archived-games.ts` tiene la metadata original de los 8 juegos no-Asteroids que existían antes
de spec 06 (`bloque-buster`, `caida`, `serpentina`, `gloton`, `invasores`, `rocas`, `ranaria`,
`duelo-pixel`) — si el juego nuevo corresponde a una de esas entradas, reusar su `title`/`short`/
`long`/`cat`/`cover`/`color` en vez de reinventarlos.

Funciones de acceso a datos, ya implementadas y **no hay que tocarlas**:

```ts
// lib/supabase/queries.ts
export async function listGames(): Promise<GameWithStats[]>;
export async function getGame(id: string): Promise<GameWithStats | null>;
export async function getScores(
  gameId: string,
  limit?: number,
): Promise<ScoreRow[]>;

// lib/supabase/actions.ts
("use server");
export async function submitScore(
  gameId: string,
  playerName: string,
  score: number,
): Promise<void>;
```

## 6. Qué ya funciona sin tocar nada

Las páginas leen `listGames()`/`getGame()` en runtime, así que un juego nuevo dado de alta en la
tabla `games` **aparece solo** en:

- `app/(home)/page.tsx` (rail de portada)
- `app/biblioteca/page.tsx` (grilla completa)
- `app/juego/[id]/page.tsx` (detalle + leaderboard, o estado vacío si `scores` no tiene filas)
- `app/jugar/[id]/page.tsx` (reproductor — llama `getGame(id)`, `notFound()` si no existe)
- `app/salon/page.tsx` (tabs — pero el **fallback por defecto** de esta página está hard-codeado:
  `games.find(g => g.id === requestedId) ?? games.find(g => g.id === "asteroides") ?? games[0]`;
  no hace falta tocarlo para que el juego nuevo funcione, solo saberlo si el spec quiere cambiar
  cuál es el tab por defecto de `/salon`)

`GamePlayer.tsx` (el flujo de PAUSA/FIN/pantalla completa/guardado de puntaje) tampoco necesita
cambios: es genérico sobre `GAME_REGISTRY`.

## 7. Inventario de `resources/`

| Carpeta        | Resolución    | Controles             | HUD                                                                           | Assets                                                               | Notas de porting                                                                                                                               |
| -------------- | ------------- | --------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `02-asteroids` | 800×600 (4:3) | `←→↑Espacio`          | dibujado en canvas                                                            | ninguno                                                              | ya portado (referencia viva)                                                                                                                   |
| `03-tetris`    | 300×600 (1:2) | flechas + rotación    | **en DOM** (`#score`,`#lines`,`#level`) + canvas secundario "siguiente pieza" | ninguno                                                              | requiere resolver aspect ratio y mover el HUD a `extra`/canvas                                                                                 |
| `04-arkanoid`  | 800×600 (4:3) | `←→` + mouse opcional | dibujado en canvas                                                            | `spritesheet-breakout.png` + 2 `.mp3`, más `levels.js` con 5 niveles | globals repartidos en 3 `<script>` (`assets/spritesheet.js`, `levels.js`, `game.js`) — hay que unificarlos dentro de un solo componente/módulo |

Cada carpeta trae su propio `README.md` (mecánica y controles) y `CLAUDE.md` (arquitectura del
motor fuente) — leerlos siempre en la Fase 1 antes de resumir el juego al usuario.
