---
name: add-game
description: Diseña el spec de un videojuego nuevo para Arcade Vault, conectado a Supabase (tabla games + leaderboard en scores). Toma un juego existente de resources/ o la descripción de uno nuevo, hace las preguntas necesarias y guarda specs/NN-slug.md. No escribe código.
disable-model-invocation: true
argument-hint: "<carpeta de resources/ | descripción de la mecánica del juego>"
---

# /add-game — Diseñador de specs para juegos nuevos

Esta skill produce el spec de un juego jugable nuevo para Arcade Vault: portado desde `resources/` (motor vanilla JS + canvas ya escrito) o descrito desde cero por el usuario. **No escribe código.** Tu trabajo es entender el juego, adaptarlo al contrato de la app (registro de juegos, HUD, Supabase), y dejar un spec listo para `/spec-impl` en `specs/`.

## Filosofía

Agregar un juego toca siempre las mismas piezas — motor portado, cover CSS, fila en `games`, alta en el registro — pero cada juego rompe algún supuesto distinto (aspect ratio, esquema de control, si tiene vidas/niveles, si trae assets). Esta skill existe para que esas fricciones se resuelvan **en el spec**, no a mitad de la implementación. Lee `reference.md` (en el mismo directorio que esta skill) antes de escribir nada: ahí están los contratos exactos, con nombres de archivo y líneas reales del repo.

## Flujo del comando

- Sigue las fases en orden. **No las saltees.**
- Responde siempre en español — es el idioma de todos los specs existentes (`specs/01-*.md` a `specs/06-*.md`).

### Fase 0 — Contexto del repo

1. Lee `CLAUDE.md`.
2. Lee `reference.md` completo (mismo directorio que este archivo) — ahí están los contratos que vas a citar en el spec.
3. Verifica que existe `components/games/registry.ts`. **Si no existe, avisá al usuario que falta el refactor previo al registro multi-juego y detenete** — sin él no hay a qué apuntar el juego nuevo.
4. Lista `specs/` para determinar el próximo número `NN` y lee los dos specs más recientes para tono/convenciones.
5. Con `mcp__supabase__execute_sql`, consulta `select id from games` — necesitás saber qué ids ya están ocupados antes de proponer uno nuevo.

### Fase 1 — Origen del juego

Según `$ARGUMENTS`:

- **Juego existente en `resources/`:** si el argumento nombra una carpeta (`02-asteroids`, `03-tetris`, `04-arkanoid`, o el nombre del juego), o si `$ARGUMENTS` viene vacío, listá las carpetas de `resources/` (excluyendo `templates/`) y preguntá cuál. Leé su `README.md`, `CLAUDE.md`, `index.html` y el/los `.js` del motor. Resumile al usuario, antes de seguir: resolución del canvas, esquema de controles, sistema de puntaje, si usa vidas/niveles, si el HUD está dibujado en el canvas o vive en el DOM, y qué assets externos (imágenes/audio) usa.
- **Juego nuevo descrito por el usuario:** si `$ARGUMENTS` trae una descripción, o no matchea ninguna carpeta de `resources/`, tratalo como juego desde cero. Pedí: mecánica central, condición de victoria/derrota, cómo se puntúa, si hay vidas y niveles.

No avances a la Fase 2 sin poder resumir estos puntos vos mismo — si algo no está claro, preguntalo acá.

### Fase 2 — Preguntas de adaptación al contrato de la app

En bloques de 3 a 5 preguntas, con recomendación explícita en cada una (ver estilo en el ejemplo más abajo). Estas siete áreas son las fricciones reales ya detectadas al portar Asteroids y Tetris/Arkanoid a este contrato — cubrilas siempre, aunque alguna tenga respuesta obvia:

1. **Aspect ratio.** `.crt-screen` tiene `aspect-ratio: 4/3` fijo (ver `reference.md`). Si el tablero fuente no es 4:3 (ej. Tetris es 300×600 = 1:2), ¿se redibuja el juego en un canvas lógico 800×600 con el tablero centrado y el HUD del juego ocupando el espacio lateral, o se usan barras negras? Recomendación: canvas 800×600 con el tablero centrado — mantiene el patrón de Asteroids y no requiere tocar `.crt-screen`.
2. **HUD.** ¿Qué mapea a `score` / `lives` / `level` de `GameHudState`? Si el juego no tiene vidas o niveles, marcalo (`showLives: false` / `showLevel: false` en la entrada del registro) en vez de inventar valores fijos. Cualquier métrica extra (líneas, combo, etc.) va a `extra`.
3. **Controles.** Códigos de tecla exactos (`KeyboardEvent.code`). Si el esquema no es `←→↑Espacio`, hace falta un `components/<Juego>TouchControls.tsx` propio (reutilizando las clases `.touch-controls`/`.touch-btn` ya existentes) en vez de reusar `TouchControls`.
4. **Pausa y fin de partida.** El motor fuente suele traer su propia pausa/overlay/reinicio en DOM (ver Tetris: `#overlay`, `#restart-btn`). Esa UI **se descarta**: el juego portado debe exponer `togglePause()`/`forceGameOver()` vía el handle del registro, y dejar que `GamePlayer` maneje pausa/FIN/game-over.
5. **Assets.** ¿Sprites o sonidos? (Arkanoid trae `spritesheet-breakout.png` + 2 `.mp3`.) Van a `public/games/<id>/` con rutas absolutas — no relativas al HTML fuente.
6. **Metadata de la fila `games`.** `id` (slug), `title`, `short`, `long`, `cat` (`ARCADE|PUZZLE|SHOOTER|VERSUS`), `color` (`cyan|magenta|green|yellow`), y la clase `cover-<id>`. Si el juego corresponde a una entrada de `lib/archived-games.ts` (ej. `caida` para Tetris, `bloque-buster` para Arkanoid), proponé reusar esa metadata en vez de inventarla — decisión del usuario si la acepta o la cambia.
7. **Condición de fin de partida real.** Confirmá que el juego efectivamente llega a `phase: "gameover"` en algún momento alcanzable. Sin eso no dispara el modal de guardado de puntaje que ya existe en `GamePlayer` — y sin ese modal, el juego nunca entra al leaderboard.

No sigas a la Fase 3 sin poder responder, sin asumir nada: ¿qué archivos van a aparecer o cambiar?, ¿cuál es el primer paso ejecutable y cuál el último?, ¿cómo se verifica que el juego quedó terminado?

### Fase 3 — Redactar el spec sección por sección

Igual que `/spec`: mostrás cada sección en markdown y esperás confirmación antes de pasar a la siguiente. No generes el spec completo de una sola vez.

Formato de casa (ver `specs/06-leaderboard-y-juegos.md`), en español:

```markdown
# Spec NN — <Título del juego jugable>

- **Estado:** Draft
- **Depende de:** 06-leaderboard-y-juegos (registro de juegos, Supabase)
- **Fecha:** YYYY-MM-DD
- **Objetivo:** una sola frase.
```

Secciones, en este orden: `## Alcance` (**Incluye:** / **No incluye (queda fuera de este spec):**), `## Modelo de datos` (tipos TS nuevos si el juego necesita alguno más allá de `GameHudState`/`GameHandle`), `## Plan de implementación`, `## Criterios de aceptación` (checklist booleano), `## Decisiones`, `## Riesgos identificados`.

El **plan de implementación** sigue siempre esta forma (adaptala al juego concreto, no la reinventes):

1. Migración `insert into games (...)` vía `mcp__supabase__apply_migration`, y limpiar/anotar la entrada correspondiente en `lib/archived-games.ts` si aplica.
2. `.cover-<id>` en `app/globals.css` (receta documentada en `reference.md`).
3. `components/<Juego>Game.tsx`: motor portado bajo el contrato `GameComponentProps`/`GameHandle` de `components/games/registry.ts`.
4. Assets a `public/games/<id>/` (solo si el juego los usa).
5. `components/<Juego>TouchControls.tsx` (solo si el esquema de control difiere de `←→↑Espacio`).
6. Alta de la entrada en `GAME_REGISTRY` (`components/games/registry.ts`).
7. Verificación end-to-end: `/jugar/<id>` jugable con teclado y táctil, PAUSA/FIN/pantalla completa funcionan, llegar a GAME OVER, guardar un puntaje y verlo reflejado en `/juego/<id>` y `/salon?game=<id>`; `next build` sin errores.

Después de cada sección: mostrala formateada y preguntá "¿Esta sección queda así o la ajustamos?". Solo avanzás con confirmación explícita.

### Fase 4 — Guardar

1. Generá un slug corto desde el objetivo (ej. `tetris-jugable`).
2. Confirmá el nombre de archivo propuesto con el usuario antes de escribirlo.
3. Creá `specs/NN-slug.md` con `Estado: Draft`.
4. Confirmá al usuario: ruta del archivo creado, recordatorio de que está en `Draft` (debe pasar a `Approved` a mano tras revisarlo), y que el siguiente paso es correr `/spec-impl NN-slug`.
5. **Detenete ahí.** No propongas implementar, no escribas código.

## Reglas duras

- **Nunca escribas código.** Solo el `.md` del spec al final.
- **Nunca propongas implementar** después de guardar el spec — eso es trabajo de `/spec-impl`.
- **Nunca inventes un `id` que ya exista** en la tabla `games` — verificalo con `mcp__supabase__execute_sql` en la Fase 0.
- **Nunca dejes pasar un juego sin condición de `gameover` alcanzable** — sin eso no hay leaderboard posible.
- **Nunca portes la UI de pausa/game-over/reinicio del motor fuente.** Esa capa ya la provee `GamePlayer.tsx`; el juego portado solo expone `togglePause()`/`forceGameOver()`.
- **Nunca asumas decisiones que el usuario no confirmó** (aspect ratio, controles, metadata de `games`) — son justo las preguntas de la Fase 2.

## Ejemplo de bloque de preguntas bien formado

> Antes de seguir con el modelo de datos necesito resolver tres cosas:
>
> 1. **Aspect ratio.** El tablero fuente es 300×600 (1:2), pero `.crt-screen` es 4:3 fijo. ¿Lo redibujamos centrado en un canvas lógico 800×600 (recomendado, mismo patrón que Asteroids) o preferís otra solución?
> 2. **Vidas.** Este juego no tiene vidas — ¿marcamos `showLives: false` en el registro para ocultar ese stat del HUD externo?
> 3. **Controles.** El original usa `←→` para mover y `↑`/`Espacio` para rotar/hard-drop. ¿Mantenemos exactamente esos códigos o los adaptamos a algo?

## Argumentos

Si `$ARGUMENTS` nombra una carpeta de `resources/` (ej. `03-tetris`), arrancá la Fase 1 leyendo esa carpeta directamente. Si trae una descripción de juego nuevo, tratalo como tal. Si viene vacío, preguntá cuál de los dos caminos quiere el usuario (listando las carpetas disponibles de `resources/`) antes de seguir.
