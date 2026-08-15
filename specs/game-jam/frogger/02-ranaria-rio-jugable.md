# Spec 02 — Ranaria Río jugable (alternativa: expandida)

- **Estado:** Draft
- **Depende de:** 06-leaderboard-y-juegos (registro de juegos, Supabase)
- **Fecha:** 2026-08-14
- **Objetivo:** Crear desde cero una versión expandida de Frogger ("cruzá la carretera y el río sin convertirte en papilla, contra el reloj y con dificultad creciente") como `components/RanariaRioGame.tsx` bajo el contrato `GAME_REGISTRY`, con zona de río (troncos y tortugas flotantes), temporizador por vida y progresión de nivel, dar de alta la fila `games` como `ranaria-rio`, y dejarlo jugable end-to-end con leaderboard real en `/jugar/ranaria-rio`.
- **Alternativa de implementación:** B de 2 para "Frogger" — excluyente con `specs/game-jam/frogger/01-ranaria-jugable.md`; mismo juego (mover una rana casilla por casilla desde el césped inicial hasta los 5 hogares evitando morir en el intento), distinto alcance de mecánica/engine.

## Alcance

**Incluye:**

- **Fila `games`** nueva: `id: "ranaria-rio"`, `title: "RANARIA"` (mismo nombre de juego que la alternativa mínima — es el mismo concepto), `cat: "ARCADE"`, `cover: "cover-rana-rio"` (clase **nueva**, definida en el modelo de datos), `color: "green"`, con `short`/`long` redactados en el modelo de datos (variante del texto de la entrada archivada `ranaria` de `lib/archived-games.ts`, ajustado para reflejar temporizador y nivel).
- **`components/RanariaRioGame.tsx`**: motor propio (sin origen en `resources/`), bajo el contrato `GameComponentProps`/`GameHandle` (`components/games/registry.ts`), sin dependencias externas ni assets.
- **Un solo `<canvas>` 800×600** dentro de `.game-arena.game-arena-canvas` (clase `game-canvas`), coincide nativamente con `.crt-screen` (4:3).
- **Grilla lógica de 20 columnas × 15 filas** (celdas de 40×40px), con tres zonas de mecánica distinta (a diferencia de la alternativa mínima, que solo tiene carretera):
  - Fila 14 (abajo): césped de inicio, la rana reaparece ahí tras perder una vida.
  - Filas 13: césped seguro.
  - Fila 12: mediana segura.
  - Filas 7–11: **5 carriles de carretera** con autos (igual en espíritu a la alternativa mínima, pero su velocidad escala con el nivel, ver más abajo).
  - Fila 6: mediana segura.
  - Filas 1–5: **5 carriles de río**, cada uno poblado por plataformas flotantes de dos tipos: **troncos** (siempre seguros mientras la rana los pisa, se mueven a velocidad constante del carril) y **grupos de tortugas** (2–3 celdas, alternan entre estado "en superficie" ~4s, seguro, y "sumergidas" ~1.5s, inseguro, con un cambio de color/animación de aviso antes de sumergirse). La rana **se mueve junto con la plataforma** mientras la pisa (su posición X avanza cada frame según la velocidad del carril).
  - Fila 0 (arriba): **5 hogares** (slots de 3 celdas), igual que en la alternativa mínima.
- **Mecánica central**: igual concepto que la alternativa mínima (moverse una celda por pulsación, evitar autos, llegar a un hogar vacío), con estas capas adicionales:
  - **Río**: si la rana está en una fila de río sin estar sobre una plataforma segura (ningún tronco/tortuga bajo ella, o tortuga sumergida), pierde una vida ("se ahoga").
  - **Temporizador por vida**: cada vida tiene un límite de tiempo (empieza en 20s, dibujado como barra en el HUD interno); si llega a 0 antes de llegar a un hogar, pierde una vida. El temporizador se reinicia al reaparecer tras perder una vida y al ocupar un hogar.
  - **Progresión de nivel**: al ocupar los 5 hogares simultáneamente, sube el nivel, se limpian los 5 slots, y la velocidad de **todos** los carriles (carretera y río) escala según `velocidad_base × (1 + 0.15 × (nivel - 1))`; el tiempo límite por vida se reduce 1s por nivel hasta un piso de 10s.
- **Puntaje**: +10 por cada fila nueva alcanzada en la vida actual (igual que la alternativa mínima); +100 base al ocupar un hogar vacío, más un **bono de tiempo** `= round(tiempo_restante_segundos × 5)` sumado en el mismo momento; +200 adicional al completar los 5 hogares y subir de nivel. El score nunca baja.
- **Vidas**: inicia en 3; se pierde una por atropello, por ahogo en el río o por agotar el temporizador; a 0 vidas, `phase: "gameover"`.
- **HUD interno dibujado en canvas**: grilla de césped/carretera/río/hogares, autos, troncos, tortugas (con su estado de sumersión visualmente distinguible), rana, barra de temporizador, contador de hogares ocupados (`X/5`), score/vidas/nivel como texto.
- **HUD externo (`GameHudState`)**: `score→score`, `lives→lives` (inicia en 3), `level→level` (inicia en 1, sube al completar los 5 hogares), `hogares` y `tiempoRestante` (segundos, redondeado) → `extra`. `phase` transiciona `playing → paused → playing` (pausa externa vía `togglePause()`) y `playing → gameover` al perder la tercera vida.
- **Controles de teclado**: idénticos a la alternativa mínima — `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`, movimiento discreto de una celda por pulsación, con `preventDefault()`.
- **`components/RanariaRioTouchControls.tsx`**: cruceta de 4 botones, mismo patrón que `RanariaTouchControls.tsx` de la alternativa mínima pero como componente propio de este spec (autocontenido).
- **Alta en `GAME_REGISTRY`**: entrada `"ranaria-rio": { Game: RanariaRioGame, Touch: RanariaRioTouchControls, showLives: true, showLevel: true }`.

**No incluye (queda fuera de este spec):**

- La alternativa hermana de este mismo juego (`ranaria`, spec 01, en `specs/game-jam/frogger/01-ranaria-jugable.md`) — es la **misma mecánica central** (cruzar hasta los 5 hogares evitando morir) con menos alcance: sin río/plataformas, sin temporizador, sin progresión de nivel, esfuerzo de implementación bajo. No implementar ambas: son excluyentes.
- Cualquier otro juego de `resources/` o de `lib/archived-games.ts` distinto de `ranaria`.
- Persistir métricas adicionales (nivel alcanzado, hogares totales, bono de tiempo acumulado) como columnas propias en `scores` — el leaderboard sigue guardando solo `score`.
- Sonido, o cualquier obstáculo/mecánica adicional no descrita acá (sin cocodrilos, sin power-ups, sin insectos bonus, sin serpientes en el césped).
- Cambiar el tab por defecto de `/salon` (sigue siendo `asteroides`; `ranaria-rio` disponible como tab adicional si se aprueba e implementa).

## Modelo de datos

### Fila `games` (migración SQL)

```sql
insert into games (id, title, short, long, cat, cover, color)
values (
  'ranaria-rio',
  'RANARIA',
  'Cruza la autopista y el río contra el reloj.',
  'Salta entre carriles de coches a toda velocidad y esquiva tortugas que se sumergen sobre troncos a la deriva en el río. Llega a los 5 nenúfares antes de que se acabe el tiempo: cada ronda completa acelera todo un poco más.',
  'ARCADE',
  'cover-rana-rio',
  'green'
);
```

(`title`/`cat`/`color` coinciden con la alternativa mínima a propósito —es el mismo juego—; `short`/`long` son una variante redactada para este spec que sí menciona temporizador y dificultad progresiva; `cover` es una clase nueva, ver Plan de implementación.)

### Tipos TypeScript

No se agregan tipos nuevos más allá de los ya definidos en `components/games/registry.ts` (`GameHudState`, `GameHandle`, `GameComponentProps`). El estado propio del motor (`frog`, `lanes[]` con `type: "road" | "river-log" | "river-turtle"`, `platforms[]`, `homes[]`, `level`, `timeLeft`, `score`, `lives`) es interno a `RanariaRioGame.tsx`, sin tipos exportados.

`GameHudState.extra` para Ranaria Río:

```ts
extra: {
  hogares: number; // 0–5, cuántos slots de hogar están ocupados ahora mismo
  tiempoRestante: number; // segundos redondeados restantes del temporizador de la vida actual
}
```

### Layout del canvas (dentro de `.game-arena.game-arena-canvas`)

```tsx
<div className="game-arena game-arena-canvas">
  <canvas ref={canvasRef} width={800} height={600} className="game-canvas" />
</div>
```

Igual que la alternativa mínima: un solo canvas 800×600, mismo patrón que `AsteroidsGame.tsx`. No se agregan clases CSS nuevas de layout — toda la grilla 20×15 (césped/carretera/río/hogares) se dibuja dentro del canvas ya existente. La única clase nueva es `.cover-rana-rio` (portada, no layout de juego).

## Plan de implementación

1. **Migración `insert into games`** vía `mcp__supabase__apply_migration`, con los valores de la fila `ranaria-rio` definidos en el modelo de datos. Verificable: `select * from games` incluye la fila `ranaria-rio` junto a las ya existentes.

2. **`.cover-rana-rio` en `app/globals.css`** — nueva clase de portada (pixel-art CSS puro, receta de `reference.md` §4): variante de `.cover-rana` existente que agrega una franja azul de "río" con un tronco/tortuga en `::before`, mismo `filter: drop-shadow` en verde neón. Verificable: la portada de `ranaria-rio` se distingue visualmente de `ranaria` en `/biblioteca`.

3. **`components/RanariaRioGame.tsx`** — motor propio portado al patrón `forwardRef<GameHandle, GameComponentProps>` (boilerplate de `reference.md` §2):
   - Grilla de 20×15 celdas de 40px, con 3 zonas de carriles (`road`, `river-log`, `river-turtle`) definidas como constantes por nivel (velocidad base × factor de nivel).
   - Movimiento discreto de la rana (mismo cooldown ~120ms que la alternativa mínima).
   - Loop de autos: igual que la alternativa mínima, con velocidad recalculada al subir de nivel.
   - Loop de plataformas de río: troncos se mueven a velocidad constante del carril; grupos de tortuga alternan estado `surfaced`/`submerged` con temporizador propio y se mueven igual que los troncos mientras están en pantalla.
   - Adherencia rana-plataforma: cada frame, si la rana está en fila de río, buscar la plataforma bajo su celda; si existe y está segura (tronco, o tortuga `surfaced`), sumar la velocidad de esa plataforma a la posición X de la rana; si no hay plataforma o la tortuga está `submerged`, restar una vida y reaparecer en el césped de inicio.
   - Temporizador: cuenta regresiva desde `20 - min(nivel - 1, 10)` segundos (piso 10s) mientras `phase === "playing"`; llegar a 0 resta una vida y reaparece la rana; se reinicia al reaparecer y al ocupar un hogar.
   - Llegada a fila 0: igual que la alternativa mínima (marca hogar, +100 + bono de tiempo, reset de posición); al completar los 5 → +200, `level++`, reset de los 5 slots, recalcular velocidades de todos los carriles y el tiempo límite de la próxima vida.
   - `togglePause()`/`forceGameOver()` expuestos vía `controlsRef`, sin overlay DOM propio; el temporizador se congela mientras `phase === "paused"`.
   - `reportHud()` mapea `score/lives/level/extra.hogares/extra.tiempoRestante/phase`, se llama solo cuando cambia algún valor.
     Verificable: `tsc --noEmit` pasa; el componente compila y monta sin el registro todavía tocado.

4. **`components/RanariaRioTouchControls.tsx`** — cruceta de 4 botones, mismo patrón y códigos que `RanariaTouchControls.tsx` de la alternativa mínima (componente propio, sin importar de la otra carpeta de specs/implementación). Verificable: revisión visual en viewport < 840px, cada botón mueve la rana una celda.

5. **Alta en `GAME_REGISTRY`** (`components/games/registry.ts`): `"ranaria-rio": { Game: RanariaRioGame, Touch: RanariaRioTouchControls, showLives: true, showLevel: true }`. Verificable: `tsc --noEmit` pasa; `/jugar/ranaria-rio` deja de mostrar la arena decorativa estática.

6. **Verificación end-to-end**: `/jugar/ranaria-rio` jugable con teclado y táctil; PAUSA congela el temporizador y las plataformas; FIN/pantalla completa funcionan vía `GamePlayer`; llegar a GAME OVER por atropello, por ahogo y por agotar el temporizador (probar los 3 caminos); completar los 5 hogares al menos una vez y confirmar que sube el nivel y aumenta la velocidad perceptible de autos/plataformas; guardar un puntaje y verlo reflejado en `/juego/ranaria-rio` y `/salon?game=ranaria-rio`; `next build` sin errores.

## Criterios de aceptación

- [ ] La fila `games` con `id: "ranaria-rio"` existe en Supabase con los valores definidos en el modelo de datos.
- [ ] `GAME_REGISTRY` tiene una entrada `ranaria-rio` que apunta a `RanariaRioGame`/`RanariaRioTouchControls`, con `showLives: true` y `showLevel: true`.
- [ ] `/jugar/ranaria-rio` monta el juego real (no la arena decorativa) y es jugable de punta a punta con teclado: la rana se mueve una celda por pulsación en las 4 direcciones, tanto en césped/carretera como sobre plataformas del río.
- [ ] `/jugar/ranaria-rio` es jugable con controles táctiles (`RanariaRioTouchControls`) en viewport < 840px.
- [ ] El canvas 800×600 se ve completo y centrado dentro de `.crt-screen` (4:3) y en pantalla completa.
- [ ] La rana se mueve junto con el tronco/tortuga mientras lo pisa, y cae (pierde una vida) si el río queda sin plataforma bajo ella o si la tortuga está sumergida.
- [ ] El temporizador por vida se ve en el HUD interno, baja mientras se juega, se congela en pausa, y agotarlo resta una vida.
- [ ] El panel externo de `GamePlayer` muestra `score`, `lives` y `level` actualizados en vivo.
- [ ] PAUSA (botón externo de `GamePlayer`) pausa/reanuda el juego (incluyendo temporizador y plataformas) sin overlay propio del motor.
- [ ] El botón FIN de `GamePlayer`, tras confirmar, fuerza `phase: "gameover"` vía `forceGameOver()`.
- [ ] Llegar a GAME OVER real jugando (perder las 3 vidas, por cualquiera de las 3 causas) dispara el modal de guardado de puntaje de `GamePlayer`.
- [ ] Completar los 5 hogares sube el nivel, limpia los slots y acelera de forma perceptible autos y plataformas de río en la ronda siguiente.
- [ ] Guardar un puntaje se refleja, tras recargar, en `/juego/ranaria-rio` y en `/salon?game=ranaria-rio`, incluyendo `best`/`plays` actualizados.
- [ ] `next build` (o `tsc --noEmit`) pasa sin errores de tipos en todos los archivos nuevos/modificados.

## Decisiones

- **Aspect ratio: canvas único 800×600 lógico, centrado en `.crt-screen` (4:3), igual que la alternativa mínima.** Motivo: agregar río y temporizador no requiere más espacio de pantalla, solo más filas de la misma grilla 20×15 — no se justifica una arquitectura de dos canvas (a diferencia de Tetris, que sí necesitaba panel secundario para pieza siguiente).
- **HUD: `score`/`lives`/`level` mapeados directo; `hogares` y `tiempoRestante` van a `extra`.** Motivo: a diferencia de la alternativa mínima, acá `level` sí tiene significado real (escala velocidad y reduce el tiempo límite), por eso `showLevel: true`; `tiempoRestante` es una métrica propia del motor que el HUD interno del canvas ya dibuja como barra, siguiendo el mismo patrón que `lines` en Tetris.
- **Controles: idénticos a la alternativa mínima (`ArrowUp/Down/Left/Right`, movimiento discreto), con `RanariaRioTouchControls.tsx` propio y autocontenido (no reutiliza el archivo de la alternativa hermana).** Motivo: cada spec debe ser autocontenido — aunque el esquema de control es el mismo concepto, este spec define su propio componente para no depender de que la alternativa mínima se implemente primero.
- **Pausa y fin de partida: sin overlay propio del motor; el temporizador se congela explícitamente en pausa.** Motivo: regla dura de la skill sobre no duplicar la capa de pausa/game-over de `GamePlayer.tsx`; congelar el temporizador en pausa es necesario para que "pausar" no equivalga a perder tiempo de vida injustamente.
- **Sin assets**: todo se dibuja con formas simples en canvas (rectángulos/óvalos para troncos, tortugas, autos, rana), igual que la alternativa mínima. Motivo: mantener el foco del mayor esfuerzo de esta alternativa en la lógica de plataformas/temporizador/nivel, no en arte; el costo de "alto esfuerzo" viene del engine, no de assets externos.
- **Metadata de la fila `games`: `title`/`cat`/`color` idénticos a la alternativa mínima; `id`/`cover`/`short`/`long` propios.** Motivo: es el mismo juego (mismo nombre, misma categoría, mismo color de marca), pero necesita su propia fila en `games` para poder implementarse de forma independiente; el texto `long` se reescribió (en vez de reusar el de `lib/archived-games.ts` tal cual) porque esta alternativa sí implementa completamente lo que ese texto describe (río + tiempo), a diferencia de la alternativa mínima que lo reusa con un desajuste documentado.
- **Condición de fin de partida real: sí, alcanzable por 3 caminos independientes (atropello, ahogo, temporizador agotado).** Cualquiera de los tres, si las vidas llegan a 0, fuerza `phase: "gameover"` de forma determinística; el temporizador en particular garantiza que la partida nunca queda "colgada" indefinidamente aunque el jugador no se mueva.

## Riesgos identificados

- **Mayor esfuerzo de implementación (alto): 3 sistemas nuevos (adherencia a plataformas, estado de sumersión de tortugas, temporizador con reinicio en múltiples eventos) que no existen en ningún juego ya portado del repo.** No hay una implementación de referencia directa en `AsteroidsGame.tsx`/`TetrisGame.tsx`/`BloqueBusterGame.tsx` para la mecánica de "moverse con una plataforma" — es lógica nueva. Mitigación: ninguna en este spec; el paso 3 del plan detalla la fórmula de adherencia (sumar velocidad del carril a la posición X de la rana) para reducir ambigüedad al implementar.
- **Calibrar el temporizador (20s iniciales, piso 10s, -1s por nivel) puede resultar injusto si la distancia entre césped y hogar no se recorre cómodamente en ese tiempo a la velocidad base de los carriles.** Mitigación: valores expuestos como constantes fáciles de ajustar en el componente; calibrar jugando una partida completa antes de dar el spec por completo, prestando atención al nivel 1 (el más permisivo) y a niveles altos (el piso de 10s).
- **La transición de estado de las tortugas (`surfaced`→`submerged`) necesita un aviso visual claro (cambio de color/parpadeo) o el jugador percibirá la muerte como injusta/aleatoria.** Mitigación: el paso 3 del plan exige un cambio de color/animación de aviso antes de sumergirse; validar en el paso 6 (verificación end-to-end) que el tiempo de aviso sea perceptible antes de pisar.
- **El `INSERT` público sin restricciones en `scores` (ya documentado en spec 06) aplica igual a los puntajes de Ranaria Río** — cualquiera puede mandar un score arbitrario sin jugar. Mitigación: ninguna nueva en este spec, mismo riesgo aceptado que el resto de los juegos portados.
