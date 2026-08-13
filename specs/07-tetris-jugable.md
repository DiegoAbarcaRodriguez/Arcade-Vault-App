# Spec 07 — Tetris jugable

- **Estado:** Implemented
- **Depende de:** 06-leaderboard-y-juegos (registro de juegos, Supabase)
- **Fecha:** 2026-08-12
- **Objetivo:** Portar el motor de Tetris (`resources/03-tetris`) a un componente `TetrisGame.tsx` bajo el contrato `GAME_REGISTRY`, con arquitectura de dos canvas (tablero primario 300×600 centrado + panel secundario de HUD/siguiente-pieza alineado a la derecha), dar de alta la fila `games` como `tetris`, y dejarlo jugable end-to-end con leaderboard real en `/jugar/tetris`.

## Alcance

**Incluye:**

- **Fila `games`** nueva: `id: "tetris"`, `title: "TETRIS"`, `cat: "PUZZLE"`, `cover: "cover-tetro"` (clase ya existente en `app/globals.css`), `color: "magenta"`, con `short`/`long` definidos en el modelo de datos.
- **`components/TetrisGame.tsx`**: motor de `resources/03-tetris/game.js` portado bajo el contrato `GameComponentProps`/`GameHandle` (`components/games/registry.ts`), sin dependencias externas ni assets.
- **Dos `<canvas>` dentro de `.game-arena.game-arena-canvas`**: un canvas primario 300×600 (tablero de 10×20 celdas de 30px, clase `game-canvas`, centrado) y un canvas secundario más chico alineado a la derecha, dibujando ahí el HUD interno (SCORE, LINES, LEVEL) y la vista previa de la siguiente pieza — reemplazando el panel DOM (`#score`/`#lines`/`#level`) y el `#next-canvas` del original.
- **HUD externo (`GameHudState`)**: `score`→score, `level`→level, `lines`→`extra.lines`; `phase` transiciona `playing → paused → playing` (tecla `P` o pausa externa) y `playing → gameover` cuando una pieza nueva colisiona al aparecer. Vidas no aplica: `showLives: false` en el registro.
- **Controles de teclado**: idénticos al original — `ArrowLeft`/`ArrowRight` mover, `ArrowUp`/`KeyX` rotar, `ArrowDown` soft drop, `Space` hard drop. `KeyP` se elimina como atajo propio del motor (la pausa la dispara `GamePlayer` vía `togglePause()` del handle).
- **`components/TetrisTouchControls.tsx`**: controles táctiles propios (izquierda, derecha, rotar, soft drop, hard drop) reusando las clases `.touch-controls`/`.touch-group`/`.touch-btn` existentes, ya que el esquema difiere de `TouchControls` (que solo cubre `←→↑Espacio`).
- **Alta en `GAME_REGISTRY`**: entrada `tetris: { Game: TetrisGame, Touch: TetrisTouchControls, showLives: false, showLevel: true }`.
- **Ajuste de CSS de fullscreen si hace falta**: `.crt-screen:fullscreen .game-canvas` hoy apunta a un único elemento con esa clase; con dos canvases, verificar que el layout (tablero + panel) siga viéndose correctamente en pantalla completa y ajustar el selector/wrapper si no.

**No incluye (queda fuera de este spec):**

- Cualquier otro juego de `resources/` (`04-arkanoid`) o de `lib/archived-games.ts` — este spec cubre únicamente Tetris.
- Guardar `lines` o `level` como columnas propias en `scores` — el leaderboard sigue guardando solo `score` (esquema ya existente, sin cambios de spec 06).
- Sonido, animaciones de limpieza de línea más allá de las que ya trae el motor fuente, o cualquier mecánica no presente en `resources/03-tetris/game.js` (ej. hold piece, 7-bag randomizer).
- Cambiar el tab por defecto de `/salon` (sigue siendo `asteroides` primero, `tetris` disponible como tab adicional).

## Modelo de datos

### Fila `games` (migración SQL)

```sql
insert into games (id, title, short, long, cat, cover, color)
values (
  'tetris',
  'TETRIS',
  'Encaja las piezas antes de que el techo te aplaste.',
  'Piezas geométricas descienden desde la oscuridad. Rótalas, encástralas y limpia líneas para sobrevivir. La velocidad aumenta sin piedad cada 10 líneas.',
  'PUZZLE',
  'cover-tetro',
  'magenta'
);
```

(`short`/`long` son el texto ya redactado para la entrada archivada `caida` en `lib/archived-games.ts` — se reusa el texto, no el id/título.)

### Tipos TypeScript

No se agregan tipos nuevos más allá de los ya definidos en `components/games/registry.ts` (`GameHudState`, `GameHandle`, `GameComponentProps`). El estado propio del motor (`board`, `current`, `next`, `lines`, `dropInterval`, etc.) es interno a `TetrisGame.tsx`, sin tipos exportados.

`GameHudState.extra` para Tetris:

```ts
extra: {
  lines: number;
}
```

### Layout de los dos canvas (dentro de `.game-arena.game-arena-canvas`)

```tsx
<div className="game-arena game-arena-canvas tetris-arena">
  <canvas ref={boardRef} width={300} height={600} className="game-canvas" />
  <canvas
    ref={panelRef}
    width={200}
    height={600}
    className="tetris-panel-canvas"
  />
</div>
```

- `.tetris-arena` (nueva clase, `app/globals.css`): `display: flex; justify-content: center; align-items: center; gap: <valor a definir en implementación>;` — centra el conjunto dentro de `.crt-screen` (4:3).
- `.tetris-panel-canvas` (nueva clase): mismo tratamiento base que `.game-canvas` (`display: block`) pero sin `width: 100%/height: 100%` forzado, ya que su tamaño es fijo y menor que el tablero.
- El canvas primario conserva la clase `game-canvas` para heredar el comportamiento de fullscreen (`object-fit: contain`) ya definido en `.crt-screen:fullscreen .game-canvas`; el paso 8 del plan de implementación verifica si el panel secundario necesita una regla equivalente.

## Plan de implementación

1. **Migración `insert into games`** vía `mcp__supabase__apply_migration`, con los valores de la fila `tetris` definidos en el modelo de datos. Verificable: `select * from games` devuelve 2 filas (`asteroides`, `tetris`).

2. **`.tetris-arena` / `.tetris-panel-canvas` en `app/globals.css`** — nuevas clases de layout para el wrapper de dos canvas (ver Modelo de datos); `.cover-tetro` no se toca, ya existe. Verificable: revisión visual en Storybook/página de prueba o directamente en el paso 8.

3. **`components/TetrisGame.tsx`** — motor de `resources/03-tetris/game.js` portado al patrón `forwardRef<GameHandle, GameComponentProps>` (boilerplate de `reference.md` §2), con dos `<canvas>` (tablero + panel) en vez de uno solo:
   - Tablero: grid, piezas, ghost piece, pieza actual — igual al original, en el canvas primario 300×600.
   - Panel: SCORE/LINES/LEVEL como texto + vista previa de la siguiente pieza, dibujados en el canvas secundario (reemplaza `#score`/`#lines`/`#level` DOM y `#next-canvas` del original).
   - Controles: listeners en `window` para `ArrowLeft/ArrowRight/ArrowUp/KeyX/ArrowDown/Space`, con `preventDefault()` en las que controla el juego.
   - `togglePause()`/`forceGameOver()` expuestos vía `controlsRef`, sin overlay DOM propio (el original se descarta).
   - `reportHud()` mapea `score/level/lines→extra.lines/phase` y se llama solo cuando cambia algún valor.
     Verificable: `tsc --noEmit` pasa; el componente compila y monta sin el registro todavía tocado.

4. **`components/TetrisTouchControls.tsx`** — copia de `TouchControls.tsx` con `CODES` ajustado a `{ left: "ArrowLeft", right: "ArrowRight", rotate: "ArrowUp", down: "ArrowDown", drop: "Space" }` y botones correspondientes, reusando `.touch-controls`/`.touch-group`/`.touch-btn`. Verificable: revisión visual en mobile viewport (< 840px).

5. **Alta en `GAME_REGISTRY`** (`components/games/registry.ts`): `tetris: { Game: TetrisGame, Touch: TetrisTouchControls, showLives: false, showLevel: true }`. Verificable: `tsc --noEmit` pasa; `/jugar/tetris` deja de mostrar la arena decorativa estática.

6. **Verificación de fullscreen con dos canvas** — entrar a pantalla completa desde `/jugar/tetris` y confirmar que tablero + panel se ven correctamente proporcionados. Si `.crt-screen:fullscreen .game-canvas` no alcanza (el panel queda mal ubicado o cortado), agregar una regla `.crt-screen:fullscreen .tetris-arena` que reordene/escale el conjunto. Verificable: captura en pantalla completa sin recortes ni superposición.

7. **Verificación end-to-end**: `/jugar/tetris` jugable con teclado y táctil; PAUSA/FIN/pantalla completa funcionan vía `GamePlayer`; llegar a GAME OVER (pieza nueva bloqueada); guardar un puntaje y verlo reflejado en `/juego/tetris` y `/salon?game=tetris`; `next build` sin errores.

## Criterios de aceptación

- [ ] La fila `games` con `id: "tetris"` existe en Supabase con los valores definidos en el modelo de datos.
- [ ] `GAME_REGISTRY` tiene una entrada `tetris` que apunta a `TetrisGame`/`TetrisTouchControls`, con `showLives: false` y `showLevel: true`.
- [ ] `/jugar/tetris` monta el juego real (no la arena decorativa) y es jugable de punta a punta con teclado: mover, rotar, soft drop, hard drop.
- [ ] `/jugar/tetris` es jugable con controles táctiles (`TetrisTouchControls`) en viewport < 840px.
- [ ] El tablero (canvas primario, 300×600) se ve centrado y el panel de HUD/siguiente pieza (canvas secundario) se ve alineado a la derecha, ambos legibles dentro de `.crt-screen` (4:3) y en pantalla completa.
- [ ] El panel externo de `GamePlayer` (HUD fuera del canvas) muestra `score` y `level` actualizados en vivo; no muestra vidas.
- [ ] PAUSA (botón externo de `GamePlayer` y tecla si aplica) pausa/reanuda el juego sin el overlay propio del motor original.
- [ ] El botón FIN de `GamePlayer`, tras confirmar, fuerza `phase: "gameover"` vía `forceGameOver()`.
- [ ] Llegar a GAME OVER real jugando (pieza nueva bloqueada al aparecer) dispara el modal de guardado de puntaje de `GamePlayer`.
- [ ] Guardar un puntaje en Tetris se refleja, tras recargar, en `/juego/tetris` y en `/salon?game=tetris`, incluyendo `best`/`plays` actualizados.
- [ ] `next build` (o `tsc --noEmit`) pasa sin errores de tipos en todos los archivos nuevos/modificados.

## Decisiones

- **Arquitectura de dos `<canvas>` (tablero primario + panel secundario) en vez del canvas único que documenta `reference.md`.** Motivo: decisión explícita del usuario — mantiene el tablero a su resolución nativa (300×600, 10×20 celdas de 30px) sin tener que redibujar/reescalar la lógica de dibujo del original, y separa claramente el tablero de juego del HUD interno (SCORE/LINES/LEVEL/siguiente pieza). Costo aceptado: el fullscreen (`object-fit: contain` vía `.game-canvas`) solo cubre el canvas primario por defecto, así que el paso 6 del plan verifica y ajusta si hace falta.
- **id/título personalizados (`tetris`/`TETRIS`) en vez de reusar `caida`/`CAÍDA` de `lib/archived-games.ts`.** Motivo: decisión explícita del usuario — prefiere el nombre original del juego. Se reusa el texto `short`/`long` de la entrada archivada (sin reescribirlo) y la clase CSS `cover-tetro` (sin renombrar), ya que ninguno de los dos depende del id.
- **Sin vidas (`showLives: false`).** Motivo: Tetris no tiene concepto de vidas en el motor original — mostrar un valor fijo o inventado sería engañoso en el panel externo.
- **`lines` va a `extra` en vez de agregar un campo dedicado a `GameHudState`.** Motivo: mismo patrón ya usado por Asteroids para métricas propias del juego (ej. `tripleShotSeconds`) — evita tocar el contrato compartido por un solo juego.
- **Se descarta el overlay de pausa/game-over/reinicio del motor original (`#overlay`, `#restart-btn`).** Motivo: regla dura de la skill — esa capa ya la provee `GamePlayer.tsx`; duplicarla generaría dos UIs de pausa/fin superpuestas.
- **`TetrisTouchControls.tsx` propio en vez de reusar `TouchControls`.** Motivo: el esquema de control de Tetris (`←→` mover, `↑`/`X` rotar, `↓` soft drop, `Espacio` hard drop) no coincide con el de `TouchControls` (`←→↑Espacio` para mover/thrust/fire) — reusarlo mapearía mal las acciones.

## Riesgos identificados

- **El layout de dos canvas puede no comportarse bien en pantalla completa.** `.crt-screen:fullscreen .game-canvas` fue diseñado pensando en un solo canvas por juego; con tablero + panel separados, el panel podría quedar mal escalado, cortado o fuera de foco visual en fullscreen. Mitigación: paso 6 del plan verifica explícitamente este caso y agrega una regla CSS adicional si hace falta antes de dar el spec por completo.
- **Wall kicks y game loop basados en `performance.now()`/timestamps del original pueden comportarse distinto dentro de un `requestAnimationFrame` compartido con el resto de la lógica de React.** El motor fuente asume que es el único loop de la página; portarlo dentro de un `useEffect` con cleanup debe preservar el mismo cálculo de `dt`/`dropAccum` para no alterar la velocidad de caída ni los puntajes. Mitigación: seguir el patrón de `dt` capeado ya usado por `AsteroidsGame.tsx` (`reference.md` §2) y comparar visualmente la sensación de velocidad contra el original abierto en paralelo.
- **Reusar el texto `short`/`long` de la entrada archivada `caida` bajo un id/título distinto (`tetris`/`TETRIS`) puede sonar desalineado** (el texto no menciona "Tetris" explícitamente, fue escrito para el alias "Caída"). Mitigación: ninguna en este spec — aceptado por decisión del usuario; se puede ajustar el texto en una edición menor si se nota desalineado tras verlo en producción.
- **El `INSERT` público sin restricciones en `scores` (ya documentado en spec 06) aplica igual a los puntajes de Tetris** — cualquiera puede mandar un score arbitrario sin jugar. Mitigación: ninguna nueva en este spec, mismo riesgo aceptado que Asteroids.
