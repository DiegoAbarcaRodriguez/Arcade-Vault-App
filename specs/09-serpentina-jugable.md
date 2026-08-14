# Spec 09 — Serpentina jugable

- **Estado:** Approved
- **Depende de:** 06-leaderboard-y-juegos (registro de juegos, Supabase)
- **Fecha:** 2026-08-13
- **Objetivo:** Implementar Snake desde cero como `components/SerpentinaGame.tsx` bajo el contrato `GAME_REGISTRY` — grilla 32×24 en canvas 800×600, 3 vidas, niveles que aceleran el juego cada 5 frutas, sprites reales de fruta (`resources/snake-assets/fruits.png`) y serpiente dibujada en canvas — dar de alta la fila `games` como `serpentina` (metadata reusada de `lib/archived-games.ts`) y dejarlo jugable end-to-end con leaderboard real en `/jugar/serpentina`.

## Alcance

**Incluye:**

- **Fila `games`** nueva: `id: "serpentina"`, `title: "SERPENTINA"`, `cat: "ARCADE"`, `cover: "cover-snake"` (clase ya existente en `app/globals.css`), `color: "green"`, con `short`/`long` reusados de `lib/archived-games.ts`.
- **`components/SerpentinaGame.tsx`**: motor de Snake escrito desde cero (no hay prototipo en `resources/`) bajo el contrato `GameComponentProps`/`GameHandle` (`components/games/registry.ts`).
- **Un solo `<canvas>` lógico 800×600** dentro de `.game-arena.game-arena-canvas` (clase `game-canvas`), con grilla de 32 columnas × 24 filas (celdas de 25×25px) — 4:3 nativo, sin redibujado ni letterboxing.
- **Movimiento en grilla, sin wrap-around**: la serpiente avanza en pasos discretos por tick; no puede invertir dirección 180° en un mismo tick. Golpear cualquier pared o su propia cola cuenta como colisión.
- **3 vidas**: cada colisión resta 1 vida y hace un reset completo (largo inicial, posición inicial, velocidad del nivel actual se conserva), preservando el `score` acumulado. Con 0 vidas restantes, `phase` pasa a `gameover`.
- **Fruta única en pantalla a la vez**, sprite elegido al azar entre las 22 frutas del atlas (`resources/snake-assets/fruits.png` + `sprites.js`) en cada aparición — solo variedad visual, todas suman el mismo puntaje fijo y hacen crecer la serpiente 1 segmento.
- **Niveles**: `level` sube +1 cada 5 frutas comidas (acumuladas en toda la partida); cada nivel reduce el intervalo del tick del movimiento en 15ms respecto al nivel anterior, con un piso mínimo de ~60ms.
- **Serpiente dibujada en canvas** (sin sprite propio): cuerpo como segmentos verdes (`--green`) con drop-shadow de neón, cabeza en tono más claro con "ojos" simples — mismo lenguaje visual pixel/neón del resto de la app.
- **HUD interno dibujado en canvas**: score, vidas (iconos), nivel — mismo patrón que Asteroids/Bloque Buster.
- **HUD externo (`GameHudState`)**: mapeo directo `score→score`, `lives→lives` (inicia en 3), `level→level` (inicia en 1), sin `extra`. `phase` transiciona `playing ↔ paused` vía `togglePause()` externo, y `playing → gameover` al perder la 3ª vida.
- **Controles**: `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` cambian la dirección de movimiento (con `preventDefault()`). En táctil, `components/SerpentinaTouchControls.tsx` nuevo con 4 botones tipo d-pad, reusando clases `.touch-controls`/`.touch-btn`.
- **Assets**: `fruits.png` copiado a `public/games/serpentina/`, con las coordenadas de `sprites.js` portadas como constante dentro de `SerpentinaGame.tsx` (no se sirve `sprites.js` como script global).
- **Alta en `GAME_REGISTRY`**: entrada `"serpentina": { Game: SerpentinaGame, Touch: SerpentinaTouchControls, showLives: true, showLevel: true }`.

**No incluye (queda fuera de este spec):**

- Cualquier otro juego de `resources/` o de `lib/archived-games.ts` — este spec cubre únicamente Serpentina.
- Wrap-around en los bordes (variante descartada, ver pregunta de mecánica respondida).
- Puntaje diferenciado por tipo de fruta — todas las 22 frutas del atlas suman el mismo puntaje fijo.
- Power-ups, obstáculos, o modo multijugador — Snake clásico de un jugador únicamente.
- Persistir métricas adicionales (nivel alcanzado, frutas comidas) como columnas propias en `scores` — el leaderboard sigue guardando solo `score`.
- Cambiar el tab por defecto de `/salon` (sigue siendo `asteroides`; `serpentina` disponible como tab adicional).

## Modelo de datos

### Fila `games` (migración SQL)

```sql
insert into games (id, title, short, long, cat, cover, color)
values (
  'serpentina',
  'SERPENTINA',
  'Crece sin morder tu propia cola.',
  'Una serpiente de luz recorre la grilla buscando núcleos magenta. Cada bocado la alarga y la hace más veloz. Un movimiento en falso y se devora a sí misma.',
  'ARCADE',
  'cover-snake',
  'green'
);
```

(`title`/`short`/`long`/`cat`/`cover`/`color` son los ya redactados para la entrada archivada `serpentina` en `lib/archived-games.ts` — se reusan tal cual, id incluido.)

### Tipos TypeScript

No se agregan tipos exportados más allá de los ya definidos en `components/games/registry.ts` (`GameHudState`, `GameHandle`, `GameComponentProps`). Internos a `SerpentinaGame.tsx`, sin exportar:

```ts
interface Point {
  x: number; // columna (0–31)
  y: number; // fila (0–23)
}

interface FruitSprite {
  x: number; y: number; w: number; h: number; // recorte dentro de fruits.png
}

// Atlas de las 22 frutas, portado desde resources/snake-assets/sprites.js
const FRUIT_ATLAS: Record<string, FruitSprite> = { apple: {...}, banana: {...}, /* ...22 entradas */ };
```

`GameHudState` para Serpentina — mapeo directo, sin `extra`:

```ts
{
  score: number; // +10 fijo por fruta comida, independiente del sprite
  lives: number; // 3 → 0; cada colisión resta 1
  level: number; // 1 en adelante; +1 cada 5 frutas comidas (acumuladas)
  phase: "playing" | "paused" | "gameover"; // "dead" no aplica: perder una vida con vidas restantes no cambia phase
}
```

- Perder una vida sin llegar a 0 (reset de posición/largo) no dispara ningún cambio de `phase` — el juego sigue en `"playing"`, solo cambian `lives` (y se resetea el largo de la serpiente, no el `score`).
- `lives === 0` tras una colisión es la única transición a `phase: "gameover"`.
- La velocidad del tick (`tickMs`) es estado interno del motor, no forma parte de `GameHudState` — se deriva de `level`: `tickMs = Math.max(60, 150 - (level - 1) * 15)`.

## Plan de implementación

1. **Migración `insert into games`** vía `mcp__supabase__apply_migration`, con los valores de la fila `serpentina` definidos en el modelo de datos. Verificable: `select * from games` devuelve 4 filas (`asteroides`, `tetris`, `bloque-buster`, `serpentina`).

2. **Assets a `public/games/serpentina/`**: copiar `fruits.png` desde `resources/snake-assets/`. Verificable: el archivo existe en `public/games/serpentina/fruits.png`.

3. **`components/SerpentinaGame.tsx`** — motor de Snake escrito desde cero, siguiendo el boilerplate de `reference.md` §2 (`forwardRef<GameHandle, GameComponentProps>`, estado del motor aislado dentro del `useEffect`, listeners en `window`):
   - Grilla 32×24 (celdas 25×25px) sobre canvas lógico 800×600; estado: `snake: Point[]`, `direction`, `nextDirection` (buffer para evitar giros de 180° en el mismo tick), `fruit: { pos: Point; sprite: keyof typeof FRUIT_ATLAS }`, `score`, `lives`, `level`, `tickMs`, `gamePhase`.
   - Loop de juego desacoplado del `requestAnimationFrame` de dibujo: un acumulador de tiempo dispara el movimiento de la serpiente cada `tickMs` (no cada frame), mientras que `draw()` corre a la tasa normal de rAF.
   - Colisión: si la nueva posición de la cabeza cae fuera de la grilla o coincide con algún segmento del cuerpo → resta 1 vida, si `lives > 0` hace reset completo (largo inicial 3 segmentos, posición inicial centrada, dirección inicial), si `lives === 0` fuerza `gamePhase = "gameover"`.
   - Fruta: al ser comida, +10 a `score`, la serpiente crece 1 segmento, se reposiciona una nueva fruta en una celda libre al azar con sprite aleatorio del `FRUIT_ATLAS`, y se incrementa un contador de frutas comidas; cada 5 frutas → `level++` y recalcula `tickMs = Math.max(60, 150 - (level - 1) * 15)`.
   - Carga de `fruits.png` vía `Image()` apuntando a `/games/serpentina/fruits.png` (ruta absoluta), dibujado con `ctx.drawImage()` usando las coordenadas de `FRUIT_ATLAS`.
   - Serpiente dibujada con `ctx.roundRect()` (o `ctx.arc()`/`fillRect()` según celda) en `--green` con `shadowBlur`/`shadowColor` para el efecto neón; cabeza en un verde más claro con 2 "ojos" (pequeños círculos) orientados según `direction`.
   - Input: `keydown` en `window` para `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` (con `preventDefault()`), escribiendo en `nextDirection` (aplicado recién en el siguiente tick, y solo si no es el opuesto a `direction` actual).
   - `togglePause()` alterna `gamePhase` entre `"playing"`/`"paused"` (pausa el acumulador del tick, no el rAF de dibujo — sigue pintando el overlay "PAUSADO"); `forceGameOver()` fuerza `gamePhase = "gameover"`. Ambos expuestos vía `controlsRef`.
   - `reportHud()` mapea `score/lives/level/phase` (sin `extra`) y se llama solo cuando cambia algún valor.
     Verificable: `tsc --noEmit` pasa; el componente compila y monta sin el registro todavía tocado.

4. **`components/SerpentinaTouchControls.tsx`** — copia de `components/TouchControls.tsx` adaptada: 4 botones (`↑↓←→`) en layout d-pad, cada uno despachando `KeyboardEvent` sintéticos con los `code` correspondientes (`ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`) al `window`; reusa clases `.touch-controls`/`.touch-group`/`.touch-btn` de `app/globals.css`. Verificable: los botones renderizan y disparan cambios de dirección visibles en el canvas.

5. **Alta en `GAME_REGISTRY`** (`components/games/registry.ts`): `"serpentina": { Game: SerpentinaGame, Touch: SerpentinaTouchControls, showLives: true, showLevel: true }`. Verificable: `tsc --noEmit` pasa; `/jugar/serpentina` deja de mostrar la arena decorativa estática.

6. **Verificación end-to-end**: `/jugar/serpentina` jugable con teclado (4 flechas) y táctil (d-pad); PAUSA/FIN/pantalla completa funcionan vía `GamePlayer`; comer frutas hace crecer la serpiente y sube `score`; cada 5 frutas sube `level` y se nota la aceleración; chocar con pared o cola resta una vida y resetea largo/posición manteniendo `score`; perder las 3 vidas dispara `phase: "gameover"` y el modal de guardado de puntaje; guardar un puntaje y verlo reflejado en `/juego/serpentina` y `/salon?game=serpentina`; `next build` sin errores.

## Criterios de aceptación

- [ ] La fila `games` con `id: "serpentina"` existe en Supabase con los valores definidos en el modelo de datos.
- [ ] `GAME_REGISTRY` tiene una entrada `serpentina` que apunta a `SerpentinaGame`, con `Touch: SerpentinaTouchControls`, `showLives: true` y `showLevel: true`.
- [ ] `/jugar/serpentina` monta el juego real (no la arena decorativa) y es jugable de punta a punta con teclado: cambiar dirección con las 4 flechas, comer frutas, crecer.
- [ ] En viewport táctil (< 840px), el d-pad de `SerpentinaTouchControls` cambia la dirección de la serpiente igual que el teclado.
- [ ] El canvas 800×600 (grilla 32×24) se ve completo y centrado dentro de `.crt-screen` (4:3) y en pantalla completa (`object-fit: contain` vía `.game-canvas`).
- [ ] La serpiente no puede invertir dirección 180° en un solo tick (ej. moverse a la derecha y presionar izquierda de inmediato no la hace chocar consigo misma).
- [ ] Comer una fruta suma +10 al `score`, hace crecer la serpiente 1 segmento y reposiciona una nueva fruta (sprite aleatorio del atlas) en una celda libre.
- [ ] Cada 5 frutas comidas (acumuladas) incrementa `level` en 1 y reduce el intervalo del tick en 15ms (piso mínimo ~60ms), notándose la aceleración en pantalla.
- [ ] Chocar contra una pared o contra la propia cola resta 1 vida, resetea la serpiente a su largo/posición inicial, y conserva el `score` acumulado.
- [ ] El panel externo de `GamePlayer` (HUD fuera del canvas) muestra `score`, `lives` y `level` actualizados en vivo.
- [ ] PAUSA (botón externo de `GamePlayer`) pausa/reanuda el movimiento de la serpiente sin overlay propio del motor (el "PAUSADO" en canvas es solo visual, controlado por `togglePause()`).
- [ ] El botón FIN de `GamePlayer`, tras confirmar, fuerza `phase: "gameover"` vía `forceGameOver()`.
- [ ] Perder las 3 vidas jugando (colisión con `lives === 0`) dispara `phase: "gameover"` y el modal de guardado de puntaje de `GamePlayer`.
- [ ] Guardar un puntaje en Serpentina se refleja, tras recargar, en `/juego/serpentina` y en `/salon?game=serpentina`, incluyendo `best`/`plays` actualizados.
- [ ] Los sprites de fruta se ven correctamente recortados desde `public/games/serpentina/fruits.png` (sin distorsión ni desalineación de coordenadas del atlas).
- [ ] `next build` (o `tsc --noEmit`) pasa sin errores de tipos en todos los archivos nuevos/modificados.

## Decisiones

- **Snake se escribe desde cero, sin prototipo en `resources/`.** Motivo: `resources/snake-assets/` solo trae assets visuales (`fruits.png` + atlas `sprites.js`), no un motor de juego — a diferencia de Tetris/Bloque Buster, este spec define la mecánica completa en la Fase 1 en vez de portarla.
- **Grilla 32×24 sobre canvas único 800×600, sin arquitectura de dos canvas.** Motivo: decisión explícita del usuario — el tablero es 4:3 nativo por diseño (celdas de 25px), coincide con `.crt-screen` sin redibujado ni panel secundario, siguiendo el mismo patrón que Asteroids/Bloque Buster.
- **Sin wrap-around en los bordes — chocar con cualquier pared cuenta como colisión.** Motivo: decisión explícita del usuario — variante clásica de Snake, más simple de comunicar en el HUD/reglas que la versión con wrap.
- **3 vidas con reset completo (largo inicial) en cada colisión, conservando el `score` acumulado.** Motivo: decisión explícita del usuario — a diferencia de Bloque Buster (que solo reposiciona la pelota), acá perder una vida también resetea el progreso de largo de la serpiente, dando más peso a cada colisión sin perder el puntaje ya ganado.
- **Niveles atados a velocidad, no a dificultad estructural.** Motivo: decisión explícita del usuario — cada 5 frutas comidas sube `level` y reduce el tick en 15ms (piso ~60ms); no hay otros cambios de dificultad (sin obstáculos nuevos ni multiplicadores de puntaje).
- **Todas las frutas valen el mismo puntaje fijo (+10); el sprite es solo variedad visual.** Motivo: decisión explícita del usuario — evita mantener una tabla de 22 valores distintos sin aportar profundidad real de juego.
- **Serpiente dibujada en canvas (segmentos + drop-shadow neón), sin sprite propio.** Motivo: el atlas provisto (`fruits.png`) solo cubre frutas — decisión explícita del usuario de resolver la serpiente con el mismo lenguaje visual pixel/neón ya usado en el resto de la app, sin depender de un asset adicional no provisto.
- **`SerpentinaTouchControls.tsx` dedicado (d-pad de 4 botones), no se reusa `TouchControls.tsx`.** Motivo: el esquema de control de Snake (4 direcciones discretas) no matchea el contrato de `TouchControls` existente (`left/right/thrust/fire`) — sigue el mismo criterio ya aplicado en Tetris (`TetrisTouchControls`).
- **Sin campos en `extra` de `GameHudState`.** Motivo: `score`/`lives`/`level` cubren el 100% del estado relevante del motor — no hay métrica adicional (ej. frutas comidas en el nivel actual) que justifique usar `extra`.
- **id/metadata (`serpentina`/`SERPENTINA`/`cover-snake`/`green`/`ARCADE`) reusados íntegramente de `lib/archived-games.ts`.** Motivo: mismo criterio que Bloque Buster — el nombre "Serpentina" ya es la marca de este juego dentro de Arcade Vault, no hay razón para reinventar el copy.

## Riesgos identificados

- **Desacoplar el tick de movimiento del `requestAnimationFrame` de dibujo puede introducir bugs de timing** (movimientos perdidos o dobles si el acumulador no se maneja bien, especialmente tras cambios de `level`/`tickMs` a mitad de partida). Mitigación: usar un acumulador de `dt` capeado (patrón ya usado en `AsteroidsGame.tsx`/`BloqueBusterGame.tsx`) y recalcular `tickMs` solo al cruzar el umbral de frutas, sin reiniciar el acumulador.
- **Buffer de `nextDirection` mal implementado puede permitir un giro de 180° "colado"** si el jugador presiona dos teclas entre dos ticks (ej. ↓ luego ← estando en movimiento →, ambas antes del próximo tick). Mitigación: validar el giro contra la `direction` real vigente al aplicar `nextDirection` en cada tick, no contra la última tecla presionada.
- **Colocar la fruta al azar puede intentar una celda ocupada por el cuerpo de la serpiente**, especialmente cuando la serpiente ya es larga y ocupa buena parte de la grilla (32×24 = 768 celdas). Mitigación: filtrar candidatas contra `snake` antes de sortear, o resortear si la celda elegida está ocupada.
- **Portar a mano las 22 coordenadas de `sprites.js` a `FRUIT_ATLAS` dentro de `SerpentinaGame.tsx` puede introducir errores de transcripción** (offsets `x`/`y`/`w`/`h` incorrectos → frutas recortadas mal). Mitigación: copiar el objeto literal tal cual desde `resources/snake-assets/sprites.js` en vez de retipearlo, y verificar visualmente en el paso 6 del plan que ninguna fruta se vea recortada o desplazada.
- **El `INSERT` público sin restricciones en `scores` (ya documentado en spec 06) aplica igual a los puntajes de Serpentina** — cualquiera puede mandar un score arbitrario sin jugar. Mitigación: ninguna nueva en este spec, mismo riesgo aceptado que Asteroids, Tetris y Bloque Buster.
