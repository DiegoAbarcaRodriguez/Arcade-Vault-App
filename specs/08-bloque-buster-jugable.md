# Spec 08 — Bloque Buster jugable

- **Estado:** Implemented
- **Depende de:** 06-leaderboard-y-juegos (registro de juegos, Supabase)
- **Fecha:** 2026-08-12
- **Objetivo:** Portar el motor de Arkanoid (`resources/04-arkanoid`) a un componente `BloqueBusterGame.tsx` bajo el contrato `GAME_REGISTRY`, con controles de teclado y mouse/drag, dar de alta la fila `games` como `bloque-buster` (metadata reusada de `lib/archived-games.ts`), y dejarlo jugable end-to-end con leaderboard real en `/jugar/bloque-buster`.

## Alcance

**Incluye:**

- **Fila `games`** nueva: `id: "bloque-buster"`, `title: "BLOQUE BUSTER"`, `cat: "ARCADE"`, `cover: "cover-bricks"` (clase ya existente en `app/globals.css`), `color: "cyan"`, con `short`/`long` reusados de `lib/archived-games.ts`.
- **`components/BloqueBusterGame.tsx`**: motor de `resources/04-arkanoid/game.js` (+ `levels.js` + `assets/spritesheet.js`) portado bajo el contrato `GameComponentProps`/`GameHandle` (`components/games/registry.ts`), unificando los 3 scripts globales del original en un solo módulo/componente.
- **Un solo `<canvas>` 800×600** dentro de `.game-arena.game-arena-canvas` (clase `game-canvas`) — coincide nativamente con `.crt-screen` (4:3), sin redibujado a otra resolución.
- **HUD interno dibujado en canvas**: score (arriba-izq), nivel (arriba-centro), vidas como iconos de pelota (arriba-der) — igual que el original.
- **HUD externo (`GameHudState`)**: mapeo directo `score→score`, `lives→lives`, `level→level`, sin `extra`. `phase` transiciona `playing → paused → playing` (pausa externa vía `togglePause()`) y `playing → gameover` tanto al quedarse sin vidas como al completar los 5 niveles (estado `win` original también mapea a `gameover`).
- **Controles**: `ArrowLeft`/`ArrowRight` mueven el paddle; el mouse (drag/mousemove sobre el canvas, con el mismo escalado `scaleX` que usa el original) también lo mueve. En táctil, el drag sobre el canvas mueve el paddle — no se agrega un componente `TouchControls` dedicado ni el registro trae `Touch`.
- **Overlay de pausa con selector de nivel (botones 1–5, click) del motor original**: se elimina por completo — la pausa la maneja `GamePlayer` sin overlay propio del motor.
- **Assets**: `spritesheet-breakout.png`, `ball-bounce.mp3`, `break-sound.mp3` copiados a `public/games/bloque-buster/` con rutas absolutas.
- **Alta en `GAME_REGISTRY`**: entrada `"bloque-buster": { Game: BloqueBusterGame, showLives: true, showLevel: true }` (sin `Touch`, ya que el control táctil es drag directo sobre el canvas, manejado dentro del propio componente).

**No incluye (queda fuera de este spec):**

- Cualquier otro juego de `resources/` o de `lib/archived-games.ts` — este spec cubre únicamente Bloque Buster.
- El selector de nivel por click del overlay de pausa original (se descarta, ver regla dura de la skill).
- Persistir métricas adicionales (nivel alcanzado, bloques rotos) como columnas propias en `scores` — el leaderboard sigue guardando solo `score`.
- Cambiar el tab por defecto de `/salon` (sigue siendo `asteroides`; `bloque-buster` disponible como tab adicional).

## Modelo de datos

### Fila `games` (migración SQL)

```sql
insert into games (id, title, short, long, cat, cover, color)
values (
  'bloque-buster',
  'BLOQUE BUSTER',
  'Rebota la pelota y destruye muros de neón.',
  'Pilota una nave-paleta y rebota un núcleo de plasma para pulverizar muros de bloques cromáticos. Cada nivel reorganiza la grilla en patrones imposibles. ¿Hasta dónde llegará tu racha?',
  'ARCADE',
  'cover-bricks',
  'cyan'
);
```

(`title`/`short`/`long`/`cat`/`cover`/`color` son los ya redactados para la entrada archivada `bloque-buster` en `lib/archived-games.ts` — se reusan tal cual, id incluido.)

### Tipos TypeScript

No se agregan tipos nuevos más allá de los ya definidos en `components/games/registry.ts` (`GameHudState`, `GameHandle`, `GameComponentProps`). El estado propio del motor (`paddle`, `ball`, `blocks[]`, `explosions[]`, `currentLevel`, `LEVELS`, etc.) es interno a `BloqueBusterGame.tsx`, sin tipos exportados.

`GameHudState` para Bloque Buster — mapeo directo, sin `extra`:

```ts
{
  score: number; // score del motor, +10 por bloque
  lives: number; // lives del motor, inicia en 3
  level: number; // currentLevel del motor (1–5)
  phase: "playing" | "paused" | "gameover"; // "dead" no aplica: perder una vida con vidas restantes no cambia phase
}
```

- `gameState === 'gameover'` (sin vidas) **y** `gameState === 'win'` (completó nivel 5) mapean ambos a `phase: "gameover"` — es la única forma de que completar el juego dispare el modal de guardado de puntaje de `GamePlayer`. El mensaje dibujado en canvas justo antes de terminar sigue distinguiendo "GAME OVER" de "¡Completaste el juego!" (texto ya existente en `drawOverlay`), pero el HUD externo no diferencia el motivo.
- Perder una vida sin quedarse en 0 (`initBall()` reposiciona la pelota) no dispara ningún cambio de `phase` — el juego sigue en `"playing"`, solo cambia `lives`.

### Input: teclado + mouse + touch, unificados

El componente escucha:

- `keydown`/`keyup` en `window` para `ArrowLeft`/`ArrowRight` (con `preventDefault()`), igual que el resto de los juegos portados.
- `mousemove` **y** `touchmove`/`touchstart` sobre el propio `<canvas>` (no en `window`, ya que necesita `getBoundingClientRect()` del canvas para escalar coordenadas): reusa el cálculo `scaleX = canvas.width / rect.width` del original para convertir la posición del puntero/dedo a coordenadas lógicas del canvas (800×600) y mover el paddle, funcionando igual en desktop (mouse) y mobile (drag táctil) sin un componente `Touch` separado.
- El `click` del original (saltar de nivel durante la pausa) no se porta — no hay overlay de pausa propio.

## Layout del canvas (dentro de `.game-arena.game-arena-canvas`)

```tsx
<div className="game-arena game-arena-canvas">
  <canvas ref={canvasRef} width={800} height={600} className="game-canvas" />
</div>
```

Un solo canvas, mismo patrón que `AsteroidsGame.tsx` — `.game-arena.game-arena-canvas`/`.game-canvas` ya cubren fondo negro, `object-fit: contain` en fullscreen y `touch-action: none` (necesario para que el drag táctil sobre el canvas no scrollee la página). No se agregan clases CSS nuevas de layout.

## Plan de implementación

1. **Migración `insert into games`** vía `mcp__supabase__apply_migration`, con los valores de la fila `bloque-buster` definidos en el modelo de datos. Verificable: `select * from games` devuelve 3 filas (`asteroides`, `tetris`, `bloque-buster`).

2. **Assets a `public/games/bloque-buster/`**: copiar `spritesheet-breakout.png`, `ball-bounce.mp3` y `break-sound.mp3` desde `resources/04-arkanoid/assets/`. Verificable: los 3 archivos existen bajo `public/games/bloque-buster/` con esos nombres.

3. **`components/BloqueBusterGame.tsx`** — motor de `resources/04-arkanoid/game.js` + `levels.js` + `assets/spritesheet.js` portado al patrón `forwardRef<GameHandle, GameComponentProps>` (boilerplate de `reference.md` §2), unificando los 3 scripts globales en un solo módulo:
   - Estado del motor (`paddle`, `ball`, `blocks[]`, `explosions[]`, `LEVELS`, `currentLevel`, `score`, `lives`, `gameState`) vive dentro del `useEffect`, aislado por instancia — sin globals compartidos entre montajes.
   - Carga del spritesheet vía `loadSpritesheet()` adaptada para apuntar a `/games/bloque-buster/spritesheet-breakout.png` (ruta absoluta en `public/`, no relativa al HTML fuente).
   - Sonidos (`Audio` de `ball-bounce.mp3`/`break-sound.mp3`) apuntando a `/games/bloque-buster/`, reproducidos con `.cloneNode().play()` igual que el original en cada rebote/rotura de bloque.
   - Input: `keydown`/`keyup` en `window` para `ArrowLeft`/`ArrowRight`; `mousemove`/`touchmove`/`touchstart` en el propio `<canvas>` con el escalado `scaleX`/`scaleY` documentado en el modelo de datos.
   - `gameState === 'win'` (nivel 5 completado) y `gameState === 'gameover'` (sin vidas) mapean ambos a `phase: "gameover"` en el HUD externo, manteniendo mensajes de canvas distintos ("¡Completaste el juego!" / "GAME OVER").
   - Se elimina el overlay de pausa propio (`drawPauseOverlay`, botones de selector de nivel, listener de `click` para saltar nivel) y el atajo de teclado `P`/`Escape` — la pausa la dispara `GamePlayer` vía `togglePause()`.
   - `togglePause()`/`forceGameOver()` expuestos vía `controlsRef`.
   - `reportHud()` mapea `score/lives/level/phase` y se llama solo cuando cambia algún valor.
     Verificable: `tsc --noEmit` pasa; el componente compila y monta sin el registro todavía tocado.

4. **Alta en `GAME_REGISTRY`** (`components/games/registry.ts`): `"bloque-buster": { Game: BloqueBusterGame, showLives: true, showLevel: true }` (sin `Touch`: el control táctil es drag directo sobre el canvas, manejado dentro del propio componente). Verificable: `tsc --noEmit` pasa; `/jugar/bloque-buster` deja de mostrar la arena decorativa estática.

5. **Verificación end-to-end**: `/jugar/bloque-buster` jugable con teclado (`←→`), mouse (drag) y táctil (drag sobre canvas); PAUSA/FIN/pantalla completa funcionan vía `GamePlayer` sin el overlay propio del motor; llegar a GAME OVER (sin vidas) y también completar el nivel 5 (`win`), confirmando que ambos casos disparan el modal de guardado de puntaje; guardar un puntaje y verlo reflejado en `/juego/bloque-buster` y `/salon?game=bloque-buster`; sonidos de rebote/rotura audibles; `next build` sin errores.

## Criterios de aceptación

- [ ] La fila `games` con `id: "bloque-buster"` existe en Supabase con los valores definidos en el modelo de datos.
- [ ] `GAME_REGISTRY` tiene una entrada `bloque-buster` que apunta a `BloqueBusterGame`, con `showLives: true` y `showLevel: true`, sin `Touch`.
- [ ] `/jugar/bloque-buster` monta el juego real (no la arena decorativa) y es jugable de punta a punta con teclado: mover el paddle con `←→`, rebotar la pelota, romper bloques.
- [ ] El paddle también se mueve arrastrando el mouse sobre el canvas, con el mismo escalado de coordenadas que el original.
- [ ] En viewport táctil (< 840px), arrastrar el dedo sobre el canvas mueve el paddle, sin necesitar botones adicionales.
- [ ] El canvas 800×600 se ve completo y centrado dentro de `.crt-screen` (4:3) y en pantalla completa (`object-fit: contain` vía `.game-canvas`).
- [ ] El panel externo de `GamePlayer` (HUD fuera del canvas) muestra `score`, `lives` y `level` actualizados en vivo.
- [ ] PAUSA (botón externo de `GamePlayer`) pausa/reanuda el juego sin el overlay propio del motor original (sin selector de nivel por click, sin atajo `P`/`Escape`).
- [ ] El botón FIN de `GamePlayer`, tras confirmar, fuerza `phase: "gameover"` vía `forceGameOver()`.
- [ ] Llegar a GAME OVER real jugando (perder las 3 vidas) dispara el modal de guardado de puntaje de `GamePlayer`.
- [ ] Completar el nivel 5 (`win` del motor original) también dispara el modal de guardado de puntaje, mapeando a `phase: "gameover"`.
- [ ] Guardar un puntaje en Bloque Buster se refleja, tras recargar, en `/juego/bloque-buster` y en `/salon?game=bloque-buster`, incluyendo `best`/`plays` actualizados.
- [ ] Los sonidos de rebote (`ball-bounce.mp3`) y rotura de bloque (`break-sound.mp3`) se escuchan durante el juego, cargados desde `public/games/bloque-buster/`.
- [ ] `next build` (o `tsc --noEmit`) pasa sin errores de tipos en todos los archivos nuevos/modificados.

## Decisiones

- **Un solo `<canvas>` 800×600, sin arquitectura de dos canvas (a diferencia de Tetris).** Motivo: el tablero fuente ya es 4:3 nativo, coincide con `.crt-screen` sin necesitar redibujado ni panel secundario — sigue el patrón original de `AsteroidsGame.tsx` documentado en `reference.md` §2.
- **Se portan teclado Y mouse (drag sobre canvas), no solo teclado.** Motivo: decisión explícita del usuario — mantiene la sensación de control de precisión del original en desktop; el mismo mecanismo de drag cubre también el control táctil en mobile, evitando duplicar lógica de movimiento.
- **Sin componente `Touch` dedicado en el registro — el control táctil es drag directo sobre el canvas.** Motivo: decisión explícita del usuario — el esquema del juego (mover paddle) se resuelve naturalmente con drag/mousemove unificado, a diferencia de Tetris (rotar/soft-drop/hard-drop) que sí necesitaba botones discretos.
- **`gameState: 'win'` mapea a `phase: "gameover"`, igual que `gameState: 'gameover'`.** Motivo: decisión explícita del usuario — es la única forma de que completar los 5 niveles dispare el modal de guardado de puntaje; el contrato `GameHudState` no distingue victoria de derrota, y ambos casos son "fin de partida" desde la perspectiva del leaderboard.
- **Se elimina por completo el overlay de pausa con selector de nivel (botones 1–5) del motor original.** Motivo: regla dura de la skill — esa capa ya la provee `GamePlayer.tsx`; el selector de nivel además era un atajo/cheat que no tiene equivalente en el flujo de pausa externo.
- **id/metadata (`bloque-buster`/`BLOQUE BUSTER`/`cover-bricks`/`cyan`/`ARCADE`) reusados íntegramente de `lib/archived-games.ts`.** Motivo: decisión explícita del usuario — a diferencia de Tetris (que usó id propio), acá se reusa todo tal cual porque el nombre "Bloque Buster" ya es el nombre de marca del juego dentro de Arcade Vault.
- **Sonido incluido en este spec (no diferido).** Motivo: decisión explícita del usuario — los 2 assets de audio son livianos y el motor ya trae la lógica de reproducción lista para portar.
- **Sin campos en `extra` de `GameHudState`.** Motivo: `score`/`lives`/`level` cubren el 100% del estado relevante del motor original — no hay métrica adicional (a diferencia de `lines` en Tetris) que justifique usar `extra`.

## Riesgos identificados

- **El drag táctil sobre el canvas puede competir con el gesto de pantalla completa o scroll de la página si `touch-action: none` no se aplica correctamente.** Mitigación: `.game-canvas` ya define `touch-action: none` (`reference.md` §4); verificar en el paso 5 del plan que el drag no dispare scroll ni zoom en mobile real.
- **Unificar 3 scripts globales (`game.js`, `levels.js`, `assets/spritesheet.js`) en un solo componente puede introducir colisiones de nombres o pérdida de estado si no se encapsula todo dentro del `useEffect`.** El original depende de variables de módulo (`ssImg`, `ssLoaded`, `ssCallbacks`) compartidas entre "scripts" — portarlas mal generaría estado compartido entre instancias del componente si dos partidas se montan en la misma sesión de navegador (ej. SPA navigation). Mitigación: todo el estado del spritesheet debe recrearse dentro del `useEffect` de cada montaje, no como constante de módulo, siguiendo el patrón de aislamiento ya usado por `AsteroidsGame.tsx`/`TetrisGame.tsx`.
- **Mapear `'win'` a `phase: "gameover"` puede confundir al jugador si el mensaje de canvas no se distingue claramente de un `'gameover'` por derrota.** Mitigación: ninguna nueva en este spec — se preserva el texto distinto ya dibujado por `drawOverlay()` ("¡Completaste el juego!" vs "GAME OVER"), aceptado como suficiente por decisión del usuario.
- **El `INSERT` público sin restricciones en `scores` (ya documentado en spec 06) aplica igual a los puntajes de Bloque Buster** — cualquiera puede mandar un score arbitrario sin jugar. Mitigación: ninguna nueva en este spec, mismo riesgo aceptado que Asteroids y Tetris.
