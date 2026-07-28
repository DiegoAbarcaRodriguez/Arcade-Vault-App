# Spec 02 — Home Page + Site Restructure

- **Estado:** Approved
- **Depende de:** 01-vistas-mvp
- **Fecha:** 2026-07-28
- **Objetivo:** Crear una nueva página de inicio (Home) en `/`, moviendo la Biblioteca actual a `/biblioteca`, con las secciones de marketing del prototipo (hero, por qué Arcade Vault, vista previa de juegos, estadísticas, actividad en vivo, precios y CTA final), navegación real hacia las demás pantallas, y animaciones de scroll-reveal — sin lógica de negocio real ni datos dinámicos.

## Alcance

**Incluye:**
- Nueva ruta `/` con la página Home (reemplaza a la Biblioteca actual como landing page).
- Movimiento de la Biblioteca existente de `/` a `/biblioteca` (sin cambios de contenido/funcionalidad respecto al spec 01, solo cambio de ruta).
- Secciones de Home portadas desde `resources/templates/home-about/home-about/home.jsx`:
  - Hero con eyebrow, título de 3 líneas, subtítulo, CTAs ("Explorar Juegos" → `/biblioteca`, "Crear Cuenta" → `/auth`), indicador de scroll y siluetas decorativas flotantes (SVG).
  - Sección "¿Por qué Arcade Vault?" (4 feature cards con iconos SVG pixel-art).
  - Sección "Juegos disponibles ahora" (mini-rail con los primeros 6 juegos de `GAMES`, cada uno enlaza a `/juego/[id]`; botón "Ver todos los juegos" → `/biblioteca`).
  - Sección de estadísticas (3 bloques numéricos).
  - Sección "Actividad en vivo" (ticker de puntuaciones recientes + top 5 jugadores de hoy; botón "Ver salón" → `/salon`).
  - Sección de precios (plan único gratuito + FAQ).
  - CTA final ("Insertar moneda" → `/biblioteca`).
- Animación de scroll-reveal (fade-in al entrar en viewport) vía un componente cliente reutilizable (`components/Reveal.tsx`) que envuelve cada sección, usando `IntersectionObserver`.
- Actualización de `components/Nav.tsx`: agrega link "Inicio" (→ `/`), agrega link "Acerca de" (`href="#"`, sin página real todavía), actualiza el link de "Biblioteca" para apuntar a `/biblioteca`, y ajusta la lógica `isActive` para que "Inicio" solo esté activo en `/` exacta y "Biblioteca" lo esté en `/biblioteca`, `/juego/*` y `/jugar/*`.
- Nuevo archivo de datos mock `app/(home)/data.ts` con el contenido editorial de Home (features, ticker de actividad, top jugadores, precios/FAQ) — no toca `lib/data.ts` salvo para reutilizar `GAMES` en la sección de vista previa.
- Porte de las secciones nuevas de CSS del prototipo (`HOME PAGE`, y las partes de `ACTIVITY`/`PRICING` que Home usa) a `app/globals.css`.

**No incluye (queda para specs futuros):**
- Página "Acerca de" / Contacto (`about.jsx`) — el link del Nav queda como `href="#"` sin destino real.
- Cualquier dato real (juegos jugados, ranking global, puntuaciones recientes): los números de estadísticas, el ticker de actividad y el top de jugadores son contenido estático de ejemplo, no derivado de `seededScores` ni de ninguna fuente dinámica.
- Cambios al formulario de Auth, Detalle, Reproductor o Salón (ya cubiertos por spec 01).
- Botón "Crear cuenta"/"Empezar gratis" con integración real (solo navega a `/auth`, que ya es decorativo).
- Cualquier lógica de suscripción/pricing real (el plan es informativo, sin checkout).

## Modelo de datos

Nuevo archivo `app/(home)/data.ts` (contenido editorial de Home, sin persistencia — solo constantes en memoria usadas por la página):

```ts
export interface Feature {
  icon: "GAMEPAD" | "FREE" | "TROPHY" | "ROCKET";
  title: string;
  desc: string;
  color: "cyan" | "yellow" | "magenta" | "green";
}
export const FEATURES: Feature[];

export interface StatBlock {
  n: string;   // ej. "12+", "MILES", "GLOBAL"
  u: string;   // ej. "JUEGOS"
  s: string;   // ej. "Y CONTANDO"
}
export const STATS: StatBlock[];

export interface ActivityRow {
  player: string;
  game: string;
  score: number;
  time: string;   // ej. "hace 2 min"
  color: "magenta" | "yellow" | "green" | "cyan";
}
export const ACTIVITY_TICKER: ActivityRow[];

export interface TopPlayerRow {
  rank: number;
  player: string;
  score: number;
}
export const TOP_PLAYERS_TODAY: TopPlayerRow[];

export interface FaqItem {
  q: string;
  a: string;
}
export const PRICING_FAQ: FaqItem[];
```

`GAMES` (para el mini-rail de "Juegos disponibles ahora") se reutiliza tal cual desde `lib/data.ts`, sin duplicarlo aquí.

## Plan de implementación

1. **Mover Biblioteca a `/biblioteca`** — Crear `app/biblioteca/page.tsx` con el contenido actual de `app/page.tsx` (sin cambios de lógica/markup). Verificar que `/biblioteca` funciona igual que la antigua `/`.

2. **Componente `Reveal`** — Crear `components/Reveal.tsx` (client component): envuelve `children`, usa `IntersectionObserver` para agregar una clase `in` cuando el elemento entra en viewport (umbral ~0.12, `unobserve` tras disparar una vez), replicando `useReveal()` del prototipo. Sin dependencias de datos, reutilizable en cualquier sección.

3. **Datos y CSS de Home** — Crear `app/(home)/data.ts` con `FEATURES`, `STATS`, `ACTIVITY_TICKER`, `TOP_PLAYERS_TODAY`, `PRICING_FAQ`. Portar a `app/globals.css` las secciones `HOME PAGE` (hero, silhouettes, feature-grid, mini-rail, stats) y las partes de `ACTIVITY`/`PRICING` que usa Home, desde `resources/templates/home-about/home-about/styles.css`.

4. **Página Home (`app/(home)/page.tsx`)** — Construir la página como server component ensamblando, en orden: hero (con siluetas SVG decorativas inline) envuelto en `Reveal` donde corresponda, sección "Por qué Arcade Vault" (mapeando `FEATURES`, con iconos SVG pixel-art inline según `icon`), sección "Juegos disponibles ahora" (mapeando `GAMES.slice(0, 6)` en mini-cards, cada una enlaza a `/juego/[id]`), sección de estadísticas (`STATS`), sección de actividad en vivo (`ACTIVITY_TICKER` + `TOP_PLAYERS_TODAY`), sección de precios (`PRICING_FAQ`), y CTA final. Todos los botones/enlaces usan `next/link` hacia `/biblioteca`, `/auth`, `/juego/[id]` o `/salon` según corresponda.

5. **Actualizar `components/Nav.tsx`** — Agregar link "Inicio" (→ `/`, activo solo en ruta exacta `/`), agregar link "Acerca de" (`href="#"`, sin estado activo), cambiar el link de "Biblioteca" para apuntar a `/biblioteca` y ajustar `isActive` para que "Biblioteca" esté activo en `/biblioteca`, `/juego/*` y `/jugar/*`. Replicar los mismos cambios en el panel móvil (`aside`).

## Criterios de aceptación

- [ ] `/` carga la nueva página Home sin errores de consola ni de build.
- [ ] `/biblioteca` muestra exactamente la misma pantalla de Biblioteca que antes vivía en `/` (grilla, buscador y chips inertes, igual que spec 01).
- [ ] El Nav muestra "Inicio", "Biblioteca", "Salón de la Fama", "Acerca de" y "Iniciar Sesión" (desktop y menú móvil).
- [ ] "Inicio" está activo solo en `/`; "Biblioteca" está activo en `/biblioteca`, `/juego/[id]` y `/jugar/[id]`; "Acerca de" nunca aparece activo y su `href="#"` no navega a ninguna página real.
- [ ] Todos los CTAs de Home navegan correctamente: "Explorar Juegos" y "Ver todos los juegos" → `/biblioteca`; "Crear Cuenta" y "Empezar Gratis" → `/auth`; cada mini-card de juego → `/juego/[id]` correspondiente; "Ver Salón" → `/salon`; CTA final → `/biblioteca`.
- [ ] Las secciones de Home hacen fade-in al hacer scroll hasta ellas (vía `Reveal`/`IntersectionObserver`), sin saltos ni contenido invisible permanentemente.
- [ ] El tema visual de Home (tipografía pixel/mono, colores neón, siluetas flotantes, efectos glow) coincide visualmente con `resources/templates/home-about/home-about/arcade-vault-standalone.html` renderizado en el navegador.
- [ ] No hay llamadas a `localStorage`, fetch/API routes, ni server actions en la página Home ni en `app/(home)/data.ts`.
- [ ] `tsc --noEmit` (o el build de Next) pasa sin errores de tipos en los archivos nuevos/modificados.

## Decisiones

- **`/` pasa a ser Home y la Biblioteca se muda a `/biblioteca`**, en vez de mantener la Biblioteca en `/` y ubicar Home en otra ruta. Motivo: es la estructura de sitio estándar que implica el `nav.jsx` de referencia (Inicio y Biblioteca como enlaces separados), y coincide con "página principal de la aplicación" del pedido del usuario.
- **Página "Acerca de" fuera de alcance**, aunque el folder de referencia la incluye junto a Home. El link del Nav queda como `href="#"` sin destino. Motivo: el usuario pidió enfocarse solo en Home; About se abordará en un spec futuro.
- **Datos mock de Home en `app/(home)/data.ts`** (colocado junto a la página) en vez de agregarlos a `lib/data.ts`. Motivo: es contenido editorial de una sola pantalla (features, ticker, top jugadores, precios/FAQ), no un modelo de datos compartido entre vistas como `GAMES`/`seededScores`.
- **Scroll-reveal implementado como componente cliente reutilizable (`Reveal.tsx`)** en vez de convertir toda la página Home en client component. Motivo: mantiene la página como server component (más cercano al patrón de Detalle/Reproductor/Salón) y aísla el único fragmento que necesita `IntersectionObserver` a un wrapper pequeño y reutilizable.
- **Estadísticas, ticker de actividad y top jugadores son contenido estático de ejemplo**, no derivados de `seededScores` ni de ninguna fuente dinámica. Motivo: consistente con la filosofía de spec 01 — ninguna función real (rankings, actividad en vivo) existe todavía; simularla con datos "vivos" falsos daría una impresión de funcionalidad inexistente.
- **El link "Acerca de" no lanza ningún error ni redirección**, simplemente `href="#"`. Motivo: opción explícita del usuario en vez de omitir el link del todo, para dejar visible la estructura de navegación completa del sitio aunque la página aún no exista.

## Riesgos identificados

- **Nuevas capas decorativas animadas (siluetas flotantes, `Reveal`) podrían reproducir el bug de stacking/z-index ya corregido en spec 01** (`.av-bg` interfiriendo con el pintado de contenido). Mitigación: verificar explícitamente con scroll y esperas de varios segundos que ninguna sección de Home desaparezca visualmente tras la animación, igual que se validó para las 5 vistas existentes.
- **Mover `/` de Biblioteca a Home es un cambio de ruta breaking** para cualquier enlace/bookmark que asumiera que `/` es la Biblioteca. Mitigación: no aplica en este proyecto (MVP sin usuarios reales todavía), pero queda documentado por si se retoma en el futuro.
