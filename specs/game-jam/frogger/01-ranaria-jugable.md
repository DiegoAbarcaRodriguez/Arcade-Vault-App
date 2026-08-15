# Spec 01 — Ranaria jugable (alternativa: mínima)

- **Estado:** Draft
- **Depende de:** 06-leaderboard-y-juegos (registro de juegos, Supabase)
- **Fecha:** 2026-08-14
- **Objetivo:** Crear desde cero una versión mínima de Frogger ("cruzá la carretera y llegá a los 5 hogares sin que te atropellen") como `components/RanariaGame.tsx` bajo el contrato `GAME_REGISTRY`, con un único carril de mecánica (carretera, sin río), dar de alta la fila `games` como `ranaria` (metadata reusada de `lib/archived-games.ts`), y dejarlo jugable end-to-end con leaderboard real en `/jugar/ranaria`.
- **Alternativa de implementación:** A de 2 para "Frogger" — excluyente con `specs/game-jam/frogger/02-ranaria-rio-jugable.md`; mismo juego (mover una rana casilla por casilla desde el césped inicial hasta los 5 hogares evitando morir en el intento), distinto alcance de mecánica/engine.

## Alcance

**Incluye:**

- **Fila `games`** nueva: `id: "ranaria"`, `title: "RANARIA"`, `cat: "ARCADE"`, `cover: "cover-rana"` (clase **ya existente** en `app/globals.css`, línea ~849), `color: "green"`, con `short`/`long` reusados tal cual de la entrada archivada `ranaria` en `lib/archived-games.ts`.
- **`components/RanariaGame.tsx`**: motor propio (sin origen en `resources/`), bajo el contrato `GameComponentProps`/`GameHandle` (`components/games/registry.ts`), sin dependencias externas ni assets.
- **Un solo `<canvas>` 800×600** dentro de `.game-arena.game-arena-canvas` (clase `game-canvas`), coincide nativamente con `.crt-screen` (4:3).
- **Grilla lógica de 20 columnas × 15 filas** (celdas de 40×40px) dibujada sobre el canvas:
  - Fila 14 (abajo): césped de inicio, la rana reaparece siempre centrada ahí tras perder una vida.
  - Filas 8–13: césped seguro decorativo (sin peligro).
  - Fila 7: mediana segura.
  - Filas 2–6: **5 carriles de carretera**, cada uno con dirección alternada (izq↔der) y una velocidad fija propia (sin escalar con el tiempo ni con el progreso), poblados por "autos" (rectángulos de 2 celdas de ancho) que se generan en loop desde un extremo del carril.
  - Fila 1: césped seguro.
  - Fila 0 (arriba): **5 hogares** (slots de 3 celdas de ancho cada uno, separados por seto), donde la rana debe terminar cada cruce exitoso.
- **Mecánica central**: la rana se mueve **una casilla por pulsación** (movimiento discreto, no continuo) en las 4 direcciones. Pisar un auto en un carril de carretera resta una vida y reaparece en el césped de inicio. Llegar a la fila 0 dentro de un slot de hogar vacío lo marca como "ocupado" (deja de poder pisarse) y suma puntos; llegar fuera de un slot (contra el seto) resta una vida sin marcar hogar. Cuando los 5 hogares están ocupados simultáneamente, se limpian todos a la vez (vuelven a estar disponibles) y el juego sigue sin cambiar de dificultad — no hay progresión de nivel en esta alternativa.
- **Puntaje**: +10 la primera vez que la rana alcanza una fila más alta (numéricamente menor) que cualquiera alcanzada en la vida actual; +100 al ocupar un hogar vacío. El score nunca baja.
- **Vidas**: inicia en 3; se pierde una al ser atropellada o al llegar a la fila 0 fuera de un slot de hogar; al llegar a 0 vidas, `phase: "gameover"`.
- **HUD interno dibujado en canvas**: grilla de césped/carretera/hogares, autos, rana, contador de hogares ocupados (`X/5`), score/vidas como texto — mismo espíritu que el HUD interno de Asteroids/Serpentina.
- **HUD externo (`GameHudState`)**: `score→score`, `lives→lives` (inicia en 3), `hogares ocupados→extra.hogares`; sin `level` (esta alternativa no tiene progresión de dificultad). `phase` transiciona `playing → paused → playing` (pausa externa vía `togglePause()`) y `playing → gameover` al perder la tercera vida.
- **Controles de teclado**: `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`, con `preventDefault()`, detectados por flanco de bajada (un salto de una celda por pulsación, no repetición continua mientras se mantiene apretada).
- **`components/RanariaTouchControls.tsx`**: cruceta de 4 botones (arriba/abajo/izquierda/derecha) que despachan `KeyboardEvent` sintéticos con esos mismos códigos, reusando `.touch-controls`/`.touch-group`/`.touch-btn` — necesario porque el esquema de 4 direcciones discretas no coincide con `TouchControls` existente (que cubre `←→↑Espacio`, sin `↓`).
- **Alta en `GAME_REGISTRY`**: entrada `ranaria: { Game: RanariaGame, Touch: RanariaTouchControls, showLives: true, showLevel: false }`.

**No incluye (queda fuera de este spec):**

- La alternativa hermana de este mismo juego (`ranaria-rio`, spec 02, en `specs/game-jam/frogger/02-ranaria-rio-jugable.md`) — es la **misma mecánica central** (cruzar hasta los 5 hogares evitando morir) con más alcance: agrega la zona de río con troncos/tortugas flotantes, temporizador por vida y progresión de nivel/dificultad. Ninguno de esos tres sistemas (río, temporizador, nivel) se implementa acá.
- Cualquier otro juego de `resources/` o de `lib/archived-games.ts` distinto de `ranaria`.
- Persistir métricas adicionales (hogares totales ocupados en la partida, cruces exitosos) como columnas propias en `scores` — el leaderboard sigue guardando solo `score`.
- Sonido, animaciones más allá de lo mínimo necesario para leer el estado del juego (posición de autos, rana, hogares ocupados), o cualquier obstáculo que no sean autos (sin río, sin agua, sin depredadores).
- Cambiar el tab por defecto de `/salon` (sigue siendo `asteroides`; `ranaria` disponible como tab adicional si se aprueba e implementa).

## Modelo de datos

### Fila `games` (migración SQL)

```sql
insert into games (id, title, short, long, cat, cover, color)
values (
  'ranaria',
  'RANARIA',
  'Cruza la autopista de pixeles.',
  'Salta entre carriles de coches a toda velocidad y troncos a la deriva en el río. Llega a los nenúfares antes de que se acabe el tiempo.',
  'ARCADE',
  'cover-rana',
  'green'
);
```

(`title`/`short`/`long`/`cat`/`cover`/`color` son los ya redactados para la entrada archivada `ranaria` en `lib/archived-games.ts` — se reusan tal cual, id incluido. Nota: el texto de `long` menciona río/troncos que esta alternativa concreta no implementa; ver Riesgos.)

### Tipos TypeScript

No se agregan tipos nuevos más allá de los ya definidos en `components/games/registry.ts` (`GameHudState`, `GameHandle`, `GameComponentProps`). El estado propio del motor (`frog`, `lanes[]`, `vehicles[]`, `homes[]`, `lives`, `score`, `maxRowReachedThisLife`) es interno a `RanariaGame.tsx`, sin tipos exportados.

`GameHudState.extra` para Ranaria:

```ts
extra: {
  hogares: number; // 0–5, cuántos slots de hogar están ocupados ahora mismo
}
```

### Layout del canvas (dentro de `.game-arena.game-arena-canvas`)

```tsx
<div className="game-arena game-arena-canvas">
  <canvas ref={canvasRef} width={800} height={600} className="game-canvas" />
</div>
```

Un solo canvas, mismo patrón que `AsteroidsGame.tsx`/`BloqueBusterGame.tsx` — `.game-arena.game-arena-canvas`/`.game-canvas` ya cubren fondo negro, `object-fit: contain` en fullscreen y `touch-action: none`. No se agregan clases CSS nuevas de layout (la grilla 20×15 se dibuja íntegramente dentro del canvas 800×600 ya existente, celdas de 40×40px).

## Plan de implementación

1. **Migración `insert into games`** vía `mcp__supabase__apply_migration`, con los valores de la fila `ranaria` definidos en el modelo de datos. Verificable: `select * from games` incluye la fila `ranaria` junto a las ya existentes.

2. **`.cover-rana` en `app/globals.css`**: **no requiere cambios**, la clase ya existe (línea ~849) con su gradiente y sprite de rana en CSS puro. Verificable: la portada de `ranaria` se ve correctamente en `/biblioteca` sin tocar CSS.

3. **`components/RanariaGame.tsx`** — motor propio portado al patrón `forwardRef<GameHandle, GameComponentProps>` (boilerplate de `reference.md` §2):
   - Grilla de 20×15 celdas de 40px definida como constante del módulo dentro del `useEffect` (lanes de carretera con `{row, direction, speed, vehicles[]}`, slots de hogar con `{col, ocupado}`).
   - Movimiento discreto de la rana: cada pulsación de flecha mueve exactamente una celda, con un pequeño cooldown (ej. 120ms) para evitar doble salto por rebote de tecla; clamp a los límites de la grilla.
   - Loop de autos: cada carril mueve sus vehículos a velocidad constante propia, reciclándolos cuando salen del canvas por el lado opuesto.
   - Colisión rana-auto: overlap de rectángulos (celda de la rana vs. rectángulo del auto) evaluado cada frame mientras la rana está en fila de carretera.
   - Llegada a fila 0: si cae dentro de un slot vacío → lo marca ocupado, +100 score, reset de posición al césped de inicio; si los 5 quedan ocupados, limpiar los 5 a la vez; si cae fuera de un slot → pierde una vida.
   - Avance de fila: al alcanzar por primera vez en la vida actual una fila con número menor al mínimo ya alcanzado, +10 score.
   - `togglePause()`/`forceGameOver()` expuestos vía `controlsRef`, sin overlay DOM propio.
   - `reportHud()` mapea `score/lives/extra.hogares/phase`, se llama solo cuando cambia algún valor.
     Verificable: `tsc --noEmit` pasa; el componente compila y monta sin el registro todavía tocado.

4. **`components/RanariaTouchControls.tsx`** — cruceta de 4 botones (`{ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }`) que despachan `KeyboardEvent` sintéticos al `window`, reusando `.touch-controls`/`.touch-group`/`.touch-btn`. Verificable: revisión visual en viewport < 840px, cada botón mueve la rana una celda.

5. **Alta en `GAME_REGISTRY`** (`components/games/registry.ts`): `ranaria: { Game: RanariaGame, Touch: RanariaTouchControls, showLives: true, showLevel: false }`. Verificable: `tsc --noEmit` pasa; `/jugar/ranaria` deja de mostrar la arena decorativa estática.

6. **Verificación end-to-end**: `/jugar/ranaria` jugable con teclado (4 flechas) y táctil (cruceta); PAUSA/FIN/pantalla completa funcionan vía `GamePlayer`; llegar a GAME OVER (perder las 3 vidas atropellado o cayendo fuera de un slot); guardar un puntaje y verlo reflejado en `/juego/ranaria` y `/salon?game=ranaria`; `next build` sin errores.

## Criterios de aceptación

- [ ] La fila `games` con `id: "ranaria"` existe en Supabase con los valores definidos en el modelo de datos.
- [ ] `GAME_REGISTRY` tiene una entrada `ranaria` que apunta a `RanariaGame`/`RanariaTouchControls`, con `showLives: true` y `showLevel: false`.
- [ ] `/jugar/ranaria` monta el juego real (no la arena decorativa) y es jugable de punta a punta con teclado: la rana se mueve una celda por pulsación en las 4 direcciones.
- [ ] `/jugar/ranaria` es jugable con controles táctiles (`RanariaTouchControls`) en viewport < 840px.
- [ ] El canvas 800×600 se ve completo y centrado dentro de `.crt-screen` (4:3) y en pantalla completa.
- [ ] El panel externo de `GamePlayer` muestra `score` y `lives` actualizados en vivo; no muestra nivel.
- [ ] PAUSA (botón externo de `GamePlayer`) pausa/reanuda el juego sin overlay propio del motor.
- [ ] El botón FIN de `GamePlayer`, tras confirmar, fuerza `phase: "gameover"` vía `forceGameOver()`.
- [ ] Llegar a GAME OVER real jugando (perder las 3 vidas) dispara el modal de guardado de puntaje de `GamePlayer`.
- [ ] Ocupar un hogar vacío suma +100 puntos visibles de inmediato en el HUD; avanzar a una fila nueva suma +10.
- [ ] Ocupar los 5 hogares limpia los slots y el juego continúa sin interrupciones ni cambio de dificultad.
- [ ] Guardar un puntaje se refleja, tras recargar, en `/juego/ranaria` y en `/salon?game=ranaria`, incluyendo `best`/`plays` actualizados.
- [ ] `next build` (o `tsc --noEmit`) pasa sin errores de tipos en todos los archivos nuevos/modificados.

## Decisiones

- **Aspect ratio: canvas único 800×600 lógico, centrado en `.crt-screen` (4:3), sin arquitectura de dos canvas.** Motivo: la grilla 20×15 de 40px encaja nativamente en 4:3 sin necesitar panel secundario ni redibujado — igual que `AsteroidsGame.tsx`/`BloqueBusterGame.tsx`.
- **HUD: `score`/`lives` mapeados directo; `hogares` va a `extra`; `showLevel: false`.** Motivo: esta alternativa no tiene ningún concepto de nivel/dificultad progresiva — forzar un valor fijo de `level` sería inventar un dato sin significado real, por eso se apaga `showLevel` en vez de mostrar un `1` constante.
- **Controles: `ArrowUp/ArrowDown/ArrowLeft/ArrowRight` con movimiento discreto por celda, más `RanariaTouchControls.tsx` propio.** Motivo: el esquema de 4 direcciones no coincide con `TouchControls` existente (sin `↓`); un componente de cruceta de 4 botones es la forma más directa de cubrirlo, sin inventar gestos de drag.
- **Pausa y fin de partida: sin overlay propio del motor, solo `togglePause()`/`forceGameOver()` vía el handle.** Motivo: regla dura de la skill — esa capa ya la provee `GamePlayer.tsx`.
- **Sin assets**: todo el juego (rana, autos, hogares, césped) se dibuja con `fillRect`/formas simples en canvas, igual que Asteroids/Tetris. Motivo: mantener el esfuerzo de implementación bajo, coherente con ser la alternativa mínima; no hay sprites ni sonido que portar.
- **Metadata de la fila `games` reusada íntegramente de `lib/archived-games.ts` (`ranaria`/`RANARIA`/`cover-rana`/`green`/`ARCADE`).** Motivo: la entrada archivada ya describe exactamente este concepto de juego (cruzar autopista y río) y su clase CSS de portada ya existe en `app/globals.css` — reusarla evita redactar metadata nueva y evita duplicar `cover-rana` bajo otro nombre. El desajuste entre el texto `long` (menciona río) y el alcance real de esta alternativa (sin río) se documenta como riesgo aceptado, no se reescribe el texto para no romper la equivalencia con la alternativa hermana que sí usa un id distinto (`ranaria-rio`) para su propia fila.
- **Condición de fin de partida real: sí, alcanzable.** Perder la tercera vida (por atropello o por llegar a la fila 0 fuera de un slot) fuerza `phase: "gameover"` de forma determinística — no depende de RNG poder nunca dispararse, los carriles de autos siempre representan un riesgo real de colisión si la rana se queda quieta o se mueve mal.

## Riesgos identificados

- **El texto `long` reusado de `lib/archived-games.ts` menciona "troncos a la deriva en el río", mecánica que esta alternativa concreta no implementa.** Mitigación: ninguna en este spec — es un desajuste de copy aceptado; se puede ajustar en una edición menor si se nota desalineado en producción, o dejarlo así si finalmente se aprueba la alternativa hermana (`ranaria-rio`) en su lugar, que sí cumple la descripción completa.
- **El cooldown de movimiento discreto (ej. 120ms) puede sentirse impreciso si se calibra mal** — muy corto y el jugador pierde control fino cerca de autos; muy largo y se siente lento/injusto frente a la velocidad de los carriles. Mitigación: valor ajustable en una sola constante del componente, calibrar jugando contra los carriles más rápidos antes de dar el spec por completo.
- **Sin progresión de dificultad, la partida puede sentirse repetitiva en sesiones largas** (los 5 carriles siempre tienen la misma velocidad). Mitigación: ninguna en este spec — es la contrapartida esperada de mantener el esfuerzo bajo; la alternativa hermana (`ranaria-rio`) cubre exactamente este caso con progresión de nivel.
- **El `INSERT` público sin restricciones en `scores` (ya documentado en spec 06) aplica igual a los puntajes de Ranaria** — cualquiera puede mandar un score arbitrario sin jugar. Mitigación: ninguna nueva en este spec, mismo riesgo aceptado que el resto de los juegos portados.
