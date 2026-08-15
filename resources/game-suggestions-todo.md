# Backlog de juegos sugeridos

> Memoria de game-planner. No editar a mano salvo para cambiar el **Estado** de una entrada.
> Estados: Propuesto → Implementado | Descartado.

## Propuesto

### Batch 2026-08-14 — 20 propuestas (4 agentes paralelos, 1 categoría cada uno)

#### Plataformas / Acción

- **Saltarín** — ARCADE — plataformero vertical infinito (Doodle Jump/Icy Tower); score = altura, gameover al caer. Sin prototipo. Esfuerzo: medio.
- **Corredor Neón** — ARCADE — endless runner lateral, control mínimo (salto/agache), muy táctil. Sin prototipo. Esfuerzo: bajo-medio.
- **Guardián de Plataformas** — ARCADE — plataformero clásico de niveles fijos, vidas + nivel nativos al HUD. Sin prototipo. Esfuerzo: alto.
- **Comando Pixel** — SHOOTER/ARCADE — run-and-gun lateral (correr+saltar+disparar), distinto de Asteroides (cenital). Sin prototipo. Esfuerzo: alto.
- **Callejón Neón** — ARCADE — beat 'em up de scroll lateral, único subgénero de combate cuerpo a cuerpo. Sin prototipo. Esfuerzo: alto.

#### Deportes / Carreras

- **Pique Arcade** — ARCADE — carrera top-down esquivando tráfico (Enduro/Out Run); score = distancia. Sin prototipo. Esfuerzo: medio.
- **Gol Express** — ARCADE — penales de fútbol, apuntar+timing contra un arquero. Sin prototipo. Esfuerzo: medio.
- **Boliche Neón** — ARCADE — boliche de 10 frames, apuntar ángulo/potencia, física bola-pinos. Sin prototipo. Esfuerzo: medio-alto.
- **Golf de Bolsillo** — ARCADE — mini golf de varios hoyos con obstáculos, potencia+ángulo. Sin prototipo. Esfuerzo: alto.
- **Slalom Glacial** — ARCADE — esquí descendente esquivando banderas, scroll vertical, velocidad creciente. Sin prototipo. Esfuerzo: medio.

#### Estrategia / Cartas / Mesa

- **Buscaminas** — PUZZLE — lógica pura sin reflejos, contrapeso a los juegos de acción actuales. Sin prototipo. Esfuerzo: bajo-medio.
- **Memoria** — PUZZLE — pares de cartas, control solo tap/click. Sin prototipo. Esfuerzo: bajo.
- **Conecta 4** — VERSUS — jugador contra CPU con IA mínima (minimax), 4 en línea. Sin prototipo. Esfuerzo: medio.
- **Solitario (Klondike)** — PUZZLE — drag-and-drop de cartas, reglas de apilado. Sin prototipo. Esfuerzo: alto.
- **Damas** — VERSUS — capturas obligatorias, coronación, IA mínima. Sin prototipo. Esfuerzo: alto.

#### Arcade clásicos / Ritmo / Reflejos

- **Glotón** — ARCADE — laberinto tipo Pac-Man; ya tiene metadata en `lib/archived-games.ts` (cover-glot, color yellow). Sin prototipo de código. Esfuerzo: alto (IA de 4 fantasmas + pathfinding).
- **Ranaria** — ARCADE — cruce de carriles tipo Frogger; metadata ya en `lib/archived-games.ts` (cover-rana, color green). Sin prototipo de código. Esfuerzo: bajo-medio.
- **Topo Veloz** — ARCADE — whack-a-mole, reflejos puros, grilla 4x4/5x5. Sin prototipo. Esfuerzo: bajo.
- **Secuencia** — ARCADE — Simon Says / memoria rítmica, 4 cuadrantes de color. Sin prototipo. Esfuerzo: bajo.
- **Reflejo Rápido** — ARCADE — reacción a estímulo con posición+timing, dificultad progresiva. Sin prototipo. Esfuerzo: bajo.

## Implementado

### Asteroides — 2026-08-14

- **Estado:** Implementado
- **Categoría:** SHOOTER
- **Spec:** specs/05-asteroids-jugable.md

### Caída (Tetris) — 2026-08-14

- **Estado:** Implementado
- **Categoría:** PUZZLE
- **Spec:** specs/07-tetris-jugable.md

### Bloque Buster — 2026-08-14

- **Estado:** Implementado
- **Categoría:** ARCADE
- **Spec:** specs/08-bloque-buster-jugable.md

### Serpentina — 2026-08-14

- **Estado:** Implementado
- **Categoría:** ARCADE
- **Spec:** specs/09-serpentina-jugable.md

## Descartado
