# Spec 01 — Vistas MVP de Arcade Vault

- **Estado:** Draft
- **Depende de:** Ninguno (primer spec del proyecto)
- **Fecha:** 2026-07-26
- **Objetivo:** Construir las 5 pantallas de Arcade Vault (Biblioteca, Detalle, Reproductor, Auth, Salón de la Fama) como vistas Next.js navegables con datos mock y el tema visual retro-arcade del prototipo, sin lógica de negocio real (sin auth, sin persistencia, sin juegos jugables).

## Alcance

**Incluye:**
- Layout raíz (`app/layout.tsx`) con `Nav` y `Footer` compartidos entre todas las pantallas, fuentes Press Start 2P + JetBrains Mono vía `next/font/google`.
- 5 rutas navegables con contenido real (mock):
  - `/` — Biblioteca (grilla de juegos, buscador y chips de categoría visibles pero inertes)
  - `/juego/[id]` — Detalle del juego (info + leaderboard mock del juego)
  - `/jugar/[id]` — Reproductor (HUD + marco CRT estáticos, sin simulación de puntuación ni modal de fin de juego)
  - `/auth` — Inicio de sesión / Crear cuenta (tabs funcionales, submit sin acción real)
  - `/salon` — Salón de la Fama (podio + tabla, tabs de juego visibles pero inertes, siempre en estado "invitado")
- Menú hamburguesa móvil funcional (abrir/cerrar panel, solo estado de UI).
- Navegación real entre las 5 rutas (links/botones funcionan).
- Tema visual retro-arcade portado desde `resources/templates/styles.css` casi tal cual (adaptado a Tailwind v4 vía `@theme`/`@layer` en `globals.css`).
- Datos mock (`GAMES`, jugadores, generador de scores) tipados en TypeScript.

**No incluye (queda para specs futuros):**
- Autenticación real (login/signup, sesión persistida, OAuth).
- Persistencia de puntuaciones o cualquier dato en `localStorage`/backend/DB.
- Lógica jugable de los 8 juegos (ninguno se implementa de verdad).
- Buscador y filtro de categoría funcionales en Biblioteca.
- Tabs funcionales en Salón de la Fama (cambiar de juego).
- Estado de sesión dinámico en el Nav (siempre se muestra como invitado).
- Botones sociales (Google/GitHub) con integración real.
- Cualquier API route o server action.

## Modelo de datos

Nuevo archivo `lib/data.ts` (portado de `resources/templates/data.jsx`), sin persistencia — solo constantes en memoria usadas por las vistas:

```ts
export type Category = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export interface Game {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: Category;
  cover: string;   // clase CSS de portada (ej. "cover-bricks")
  color: "cyan" | "magenta" | "green" | "yellow";
  best: number;
  plays: string;   // ej. "12.4K"
}

export const GAMES: Game[];
export const CATS: readonly ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"];
export const PLAYERS: string[];

export interface ScoreRow {
  rank: number;
  name: string;
  score: number;
  date: string; // "DD/MM/2026"
}

export function seededScores(seed: number, count?: number): ScoreRow[];
```

## Plan de implementación

1. **Base visual y datos** — Crear `lib/data.ts` (tipos + mock data). Configurar `next/font/google` para Press Start 2P y JetBrains Mono en `app/layout.tsx`. Portar `resources/templates/styles.css` a `app/globals.css` adaptado a Tailwind v4 (`@theme` para tokens de color/fuente, `@layer` para las clases custom del prototipo: `.av-nav`, `.card`, `.crt`, `.chip`, etc.). Verificar que la app compila y muestra el fondo/grid/scanlines.

2. **Layout raíz + Nav** — Crear `components/Nav.tsx` (client component: estado del menú hamburguesa móvil), `components/Footer.tsx`, e integrarlos en `app/layout.tsx`. El Nav siempre renderiza el estado "invitado" (botón "Iniciar Sesión") y usa `next/link` para navegar a `/`, `/salon`, `/auth`.

3. **Biblioteca (`app/page.tsx`)** — Grilla de `GameCard` a partir de `GAMES`, buscador y chips de categoría visibles (con "TODOS" marcado activo) pero sin `onChange`/`onClick` funcional, hero con título y efecto flicker/blink vía CSS. Cards enlazan a `/juego/[id]`.

4. **Detalle (`app/juego/[id]/page.tsx`)** — Info del juego (`GAMES.find`), leaderboard con `seededScores`, botón "JUGAR AHORA" enlaza a `/jugar/[id]`, botón "VOLVER" enlaza a `/`. Ruta 404/`notFound()` si el `id` no existe en `GAMES`.

5. **Reproductor (`app/jugar/[id]/page.tsx`)** — HUD estático (puntuación 0, 3 vidas, nivel 01, jugador "INVITADO"), marco CRT con arena de juego placeholder (sin `setInterval`, sin modal de fin de juego), botones PAUSA/FIN/SALIR visibles pero sin acción (o solo `SALIR` navega a `/juego/[id]`).

6. **Auth (`app/auth/page.tsx`) + Salón de la Fama (`app/salon/page.tsx`)** — Auth con tabs funcionales (estado local) entre "Iniciar sesión"/"Crear cuenta", formulario sin submit real, botones sociales/invitado decorativos. Salón con podio + tabla usando `seededScores` para el primer juego de `GAMES` fijo, tabs de juego visibles pero inertes, sin fila "TU MEJOR MARCA" (siempre invitado).

## Criterios de aceptación

- [ ] Las 5 rutas (`/`, `/juego/[id]`, `/jugar/[id]`, `/auth`, `/salon`) cargan sin errores de consola ni de build.
- [ ] `next/link` conecta todas las pantallas según el prototipo (Biblioteca → Detalle → Reproductor, Auth ↔ Biblioteca, Salón ↔ Biblioteca).
- [ ] El tema visual (colores neón, fuentes pixel/mono, fondo de grid, scanlines, efecto CRT) coincide visualmente con `resources/templates/Arcade Vault.html` renderizado en el navegador.
- [ ] El buscador y los chips de categoría en Biblioteca se ven pero no filtran nada al interactuar.
- [ ] Las tabs de juego en Salón de la Fama se ven pero no cambian la tabla al hacer clic.
- [ ] Las tabs de Auth (Iniciar sesión/Crear cuenta) cambian el formulario visible al hacer clic, sin enviar ni navegar al submit.
- [ ] El menú hamburguesa móvil abre y cierra el panel lateral.
- [ ] El Nav siempre muestra el estado "invitado" (nunca aparece un usuario logueado).
- [ ] El Reproductor muestra HUD y CRT estáticos: no hay `setInterval` incrementando puntuación ni modal de "Fin del juego" automático.
- [ ] No hay llamadas a `localStorage`, fetch/API routes, ni server actions en ninguna de las vistas.
- [ ] `tsc --noEmit` (o el build de Next) pasa sin errores de tipos en `lib/data.ts` y los componentes nuevos.

## Decisiones

- **Portar `styles.css` casi tal cual** (adaptado a Tailwind v4 vía `@theme`/`@layer`) en vez de reescribir todo con utilidades Tailwind. Motivo: preservar fidelidad visual exacta del prototipo (CRT, scanlines, glow) sin el riesgo/esfuerzo de traducir efectos complejos a utility classes.
- **Rutas reales de Next.js App Router** en vez de replicar el router SPA por hash del prototipo. Motivo: es el patrón nativo del framework y lo que espera el resto del proyecto (spec-driven, App Router ya definido en CLAUDE.md).
- **TypeScript (`.tsx`) con tipos explícitos** para datos mock, en vez de JSX sin tipar. Motivo: consistencia con el resto del proyecto (`create-next-app` con TS).
- **Interactividad limitada a UI pura sin efecto de negocio**: tabs de Auth y menú móvil quedan funcionales porque son solo estado visual local; búsqueda/filtro de Biblioteca y tabs del Salón quedan inertes porque tocan la idea de "funcionalidad" (filtrar/consultar datos) que se pospone a un spec futuro.
- **Nav siempre en estado "invitado"**. Motivo: no hay auth real todavía; mostrar el estado logueado sería simular una función que no existe.
- **Reproductor sin simulación de partida ni modal de fin de juego**. Motivo: ningún juego está implementado aún; simular puntuación creciente daría una falsa impresión de funcionalidad.
