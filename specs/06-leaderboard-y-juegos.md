# Spec 06 — Leaderboard y tabla de juegos en Supabase

- **Estado:** Implemented
- **Depende de:** 04-supabase-setup (clientes de Supabase), 05-asteroids-jugable (único juego jugable)
- **Fecha:** 2026-08-07
- **Objetivo:** Migrar `GAMES` desde `lib/data.ts` a tablas reales en Supabase (`games` + `scores`), calcular `best`/`plays` en vivo desde los puntajes reales, y conectar el flujo completo del leaderboard de Asteroids —pedir nombre al terminar la partida, guardar el puntaje, y mostrarlo en `/juego/[id]` y en un `/salon` con tabs funcionales— dejando el resto de los juegos con un estado vacío ("sé el primero en registrar un puntaje") hasta que sean jugables.

## Alcance

**Incluye:**

- **Tabla `games` en Supabase**, con todos los campos hoy en `lib/data.ts` (`id`, `title`, `short`, `long`, `cat`, `cover`, `color`) migrados vía migración SQL, sembrada con las 9 entradas actuales (incluye `asteroides`). `best` y `plays` **no** son columnas: se calculan en vivo desde `scores`.
- **Tabla `scores`** con `game_id` (FK a `games.id`), `player_name` (texto libre, corto), `score` (entero), `created_at`. Sin `user_id`/relación a `auth.users` — no hay Auth conectado todavía.
- **RLS de `scores`**: `SELECT` público y `INSERT` público sin restricciones (rol `anon`), documentado como riesgo conocido (sin rate-limit ni validación de contenido). `games` es `SELECT` público, sin `INSERT`/`UPDATE`/`DELETE` desde el cliente (se administra vía migraciones).
- **`lib/data.ts`**: se elimina `GAMES`, `PLAYERS` y `seededScores()`. Se conservan `Category`, `CATS` y el tipo `Game` (ajustado a la forma de la fila de `games`, sin `best`/`plays` fijos).
- **Capa de acceso a datos** (`lib/supabase/queries.ts` o similar): funciones server-side para listar juegos, traer un juego por id, traer scores de un juego (ordenados, con `best`/`plays` calculados), e insertar un score.
- **Server Action para insertar un score** (ej. `lib/supabase/actions.ts`), invocada solo desde el flujo de fin de partida de Asteroids.
- **Home (`app/(home)/page.tsx`) y Biblioteca (`app/biblioteca/page.tsx`)**: pasan a ser `async` Server Components que leen `games` desde Supabase en vez de importar `GAMES`. Sin cambios visuales ni de comportamiento más allá de la fuente de datos.
- **`/juego/[id]`**: sigue siendo `async` Server Component; en vez de `seededScores`, lee `scores` reales del juego. Si no hay filas, muestra el estado vacío ("Sé el primero en registrar un puntaje"). `best`/`plays` mostrados en la página vienen del cálculo en vivo.
- **`/jugar/[id]`**: busca el juego en `games` (Supabase) en vez de `GAMES`.
- **Flujo de guardado de puntaje en Asteroids:** al llegar a `phase === "gameover"`, `GamePlayer` muestra una pantalla/input pidiendo un nombre corto (estilo arcade, ej. "ingresá tus iniciales") con un botón para confirmar y guardar el puntaje vía la Server Action; también se puede omitir/cerrar sin guardar. Se guarda una sola vez por game-over (no se reenvía si el jugador reinicia y vuelve a perder sin recargar el flujo).
- **`/salon`**: pasa a tener tabs funcionales que cambian el juego mostrado (podio + tabla), consultando `scores` reales del juego seleccionado; estado vacío para los juegos sin partidas.

**No incluye (queda fuera de este spec):**

- Cualquier conexión con Auth (`/auth`, `auth.users`, sesiones) — el "nombre" del score es texto libre, no un usuario autenticado.
- Rate limiting, validación anti-trampa, moderación de nombres, o cualquier protección contra spam/abuso del `INSERT` público — documentado como riesgo, no mitigado.
- Hacer jugable cualquier juego que no sea `asteroides` — los otros 8 quedan con `scores` vacío indefinidamente en este spec.
- `ACTIVITY_TICKER` / `TOP_PLAYERS_TODAY` (`app/(home)/data.ts`), el widget decorativo de "actividad en vivo" del Home — sigue siendo mock estático, sin relación con `scores` real.
- Búsqueda y filtro por categoría en Biblioteca (`av-search`, `av-chips`) — siguen sin funcionar, tal cual hoy, sin relación con este spec.
- Edición/borrado de puntajes, moderación desde un panel admin.
- Caching/ISR de `games` (se usa fetch directo en cada request; no se agrega `revalidate`).

## Modelo de datos

### Tablas en Supabase

```sql
create table games (
  id text primary key,              -- ej. "asteroides", "bloque-buster"
  title text not null,
  short text not null,
  long text not null,
  cat text not null,                -- "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS"
  cover text not null,               -- clase CSS, ej. "cover-asteroides"
  color text not null,               -- "cyan" | "magenta" | "green" | "yellow"
  created_at timestamptz not null default now()
);

create table scores (
  id bigint generated always as identity primary key,
  game_id text not null references games(id),
  player_name text not null,
  score integer not null,
  created_at timestamptz not null default now()
);

create index scores_game_id_score_idx on scores (game_id, score desc);

alter table games enable row level security;
alter table scores enable row level security;

create policy "games_select_public" on games for select using (true);
create policy "scores_select_public" on scores for select using (true);
create policy "scores_insert_public" on scores for insert with check (true);
```

### Tipos TypeScript (`lib/data.ts` y `lib/supabase/queries.ts`)

```ts
// lib/data.ts — se conservan, GAMES/PLAYERS/seededScores se eliminan
export type Category = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

export interface Game {
  id: string;
  title: string;
  short: string;
  long: string;
  cat: Category;
  cover: string;
  color: "cyan" | "magenta" | "green" | "yellow";
}

export const CATS = ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"] as const;

// lib/supabase/queries.ts
export interface ScoreRow {
  rank: number;
  name: string;
  score: number;
  date: string; // formateado desde created_at, mismo formato "DD/MM/YYYY"
}

export interface GameWithStats extends Game {
  best: number; // 0 si no hay scores
  plays: number; // 0 si no hay scores
}

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

`best`/`plays` se calculan con una query agregada a `scores` (`max(score)`, `count(*)`) filtrada por `game_id`, no con columnas propias en `games`.

## Plan de implementación

1. **Migración SQL en Supabase** — Crear `games` y `scores` con las columnas, índice y políticas RLS del modelo de datos, y sembrar `games` con las 9 filas actuales de `GAMES` (mismos valores que hoy en `lib/data.ts`, sin `best`/`plays`). Aplicar con `mcp__supabase__apply_migration`. Verificable: `list_tables` muestra ambas tablas; `select * from games` devuelve 9 filas; `select * from scores` devuelve 0 filas.

2. **Capa de queries (`lib/supabase/queries.ts`)** — Implementar `listGames()`, `getGame(id)` y `getScores(gameId, limit)` usando el cliente de servidor (`lib/supabase/server.ts`, spec 04), con `best`/`plays` calculados vía agregación sobre `scores`. Standalone, sin integrar todavía a ninguna página. Verificable: `tsc --noEmit` pasa; una llamada de prueba a `listGames()` devuelve las 9 filas sembradas con `best: 0, plays: 0`.

3. **Server Action `submitScore` (`lib/supabase/actions.ts`)** — `"use server"`, inserta en `scores` y llama `revalidatePath` sobre `/juego/[gameId]` y `/salon`. Verificable: invocada manualmente (o desde una página de prueba), inserta una fila y las páginas afectadas reflejan el cambio al recargar.

4. **Home y Biblioteca a `listGames()`** — Convertir `app/(home)/page.tsx` y `app/biblioteca/page.tsx` en `async` Server Components que llaman `listGames()` en vez de importar `GAMES`. `GameCard` y el resto del JSX no cambian (mismos campos `title/short/cover/color/cat`, `best` ahora viene calculado). Verificable: Home y Biblioteca renderizan las 9 tarjetas igual que antes, con `MEJOR PUNTUACIÓN: 0` (sin scores sembrados todavía).

5. **`/juego/[id]` a datos reales** — Usar `getGame(id)` y `getScores(id)` en vez de `GAMES.find` / `seededScores`. Si `getScores` devuelve `[]`, reemplazar la lista por un estado vacío ("Sé el primero en registrar un puntaje"). `stat-strip` usa `best`/`plays` calculados. Verificable: `/juego/asteroides` y `/juego/<otro>` muestran el estado vacío (0 scores todavía en ambos).

6. **`/jugar/[id]` a `getGame`** — Reemplazar `GAMES.find` por `getGame(id)` (async ya lo es la página). Verificable: `/jugar/asteroides` sigue cargando el juego igual que antes.

7. **Pantalla de nombre + guardado real en `GamePlayer`** — Cuando `hud?.phase === "gameover"`, mostrar una pantalla/overlay (mismo lenguaje visual que el modal de FIN: pixel font, bordes neón) con un input de nombre corto (maxlength razonable, ej. 12) y botón "GUARDAR PUNTAJE", más opción de omitir. Confirmar llama a `submitScore(game.id, nombre, score)` (Server Action) una sola vez para ese game-over (se resetea al reiniciar la partida). Verificable: jugar hasta GAME OVER, ingresar un nombre, guardar; recargar `/juego/asteroides` muestra ese puntaje en la lista.

8. **`/salon` con tabs funcionales** — Convertir a Server Component que lee el juego seleccionado desde `searchParams` (`?game=<id>`, default `asteroides`), con los tabs como `<Link href="/salon?game=...">` en vez de `<button>` sin handler. Usa `getGame`/`getScores` del juego seleccionado; podio + tabla muestran datos reales, con el mismo estado vacío del paso 5 si no hay filas. Verificable: cambiar de tab navega y muestra el leaderboard de ese juego (vacío salvo Asteroids si ya tiene puntajes).

9. **Limpieza de `lib/data.ts`** — Eliminar `GAMES`, `PLAYERS` y `seededScores()` (ya sin consumidores tras los pasos 4-8); conservar `Category`, `CATS`, `Game`. Verificable: `tsc --noEmit`/`next build` pasa sin errores ni imports rotos en todo el proyecto.

## Criterios de aceptación

- [ ] Las tablas `games` y `scores` existen en Supabase con las columnas, índice y políticas RLS definidas en el modelo de datos.
- [ ] `games` contiene 9 filas, una por cada juego actualmente en `GAMES` (incluida `asteroides`), con los mismos valores de `title`/`short`/`long`/`cat`/`cover`/`color`.
- [ ] `scores` permite `SELECT` e `INSERT` públicos (rol `anon`); `games` permite `SELECT` público sin `INSERT`/`UPDATE`/`DELETE` desde el cliente.
- [ ] `lib/supabase/queries.ts` expone `listGames()`, `getGame(id)` y `getScores(gameId, limit)`, con `best`/`plays` calculados en vivo desde `scores` (no columnas fijas).
- [ ] `lib/supabase/actions.ts` expone una Server Action `submitScore(gameId, playerName, score)` que inserta en `scores` y revalida `/juego/[gameId]` y `/salon`.
- [ ] Home y Biblioteca muestran las 9 tarjetas de juego leyendo desde Supabase (`listGames()`), no desde `lib/data.ts`.
- [ ] `/juego/[id]` muestra los puntajes reales de `scores` para ese juego, o el estado vacío "Sé el primero en registrar un puntaje" si no hay filas.
- [ ] `/jugar/[id]` sigue funcionando igual que antes, obteniendo el juego desde `getGame(id)`.
- [ ] Al terminar una partida de Asteroids (GAME OVER), aparece una pantalla para ingresar un nombre y guardar el puntaje; confirmar inserta una fila real en `scores` vía `submitScore`; se puede omitir sin guardar nada.
- [ ] Guardar un puntaje en Asteroids se refleja, tras recargar, en `/juego/asteroides` y en `/salon` (tab Asteroids), incluyendo `best`/`plays` actualizados.
- [ ] Los 8 juegos no jugables muestran siempre el estado vacío en `/juego/[id]` y en su tab de `/salon` (nunca reciben scores reales en este spec).
- [ ] `/salon` tiene tabs funcionales: hacer click en un tab distinto navega y muestra el podio/tabla de ese juego (vía `?game=<id>`).
- [ ] `GAMES`, `PLAYERS` y `seededScores()` ya no existen en `lib/data.ts`; ningún archivo del proyecto los importa.
- [ ] `tsc --noEmit` (o `next build`) pasa sin errores de tipos en todos los archivos nuevos/modificados.

## Decisiones

- **Lectura + escritura completa en este spec, en vez de solo migrar lectura.** Motivo: decisión explícita del usuario — conectar el guardado real de puntajes de Asteroids da valor inmediato al único juego jugable, en vez de dejar el leaderboard como una migración de datos mock a otro lugar mock.
- **Nombre libre por partida (sin cuenta), en vez de esperar a Auth o usar un nombre fijo.** Motivo: decisión explícita del usuario — Auth no está conectado (spec 04 lo dejó fuera explícitamente) y bloquear el leaderboard hasta que exista pospondría el valor de este spec indefinidamente; un input de nombre corto es consistente con el patrón "INVITADO" que ya muestra `GamePlayer`.
- **Migración completa de `GAMES` a Supabase (incluyendo título/textos/cover/color/cat), en vez de dejar la metadata visual en código.** Motivo: decisión explícita del usuario — unifica la fuente de verdad de juegos en Supabase, evitando mantener dos fuentes (código + DB) para la misma entidad.
- **Solo Asteroids participa del leaderboard real; los otros 8 juegos quedan en estado vacío indefinido.** Motivo: decisión explícita del usuario — son los únicos juegos realmente jugables hoy (spec 05); sembrar puntajes falsos para el resto sería volver a mostrar datos mock disfrazados de reales.
- **Sin seed de puntajes falsos en `scores` (ni siquiera para Asteroids); estado vacío explícito en su lugar.** Motivo: decisión explícita del usuario tras la alternativa de sembrar mock — mantiene `scores` como reflejo fiel de partidas reales jugadas, sin números inventados que confundan qué es real.
- **`best`/`plays` calculados en vivo desde `scores` (agregación), no columnas fijas en `games`.** Motivo: decisión explícita del usuario — evita que queden desincronizados de los puntajes reales a medida que se juega, sin necesidad de triggers/columnas derivadas que mantener.
- **Insert público sin restricciones en `scores` (sin rate-limit ni validación de contenido).** Motivo: decisión explícita del usuario — mantiene el spec simple dado que no hay Auth; el riesgo de spam/trampa queda documentado y se puede mitigar en un spec futuro (ej. cuando exista Auth o un sistema anti-abuso).
- **Server Components `async` con fetch directo a Supabase en cada request, sin ISR/`revalidate`.** Motivo: decisión explícita del usuario — más simple de razonar mientras el tráfico es bajo; se puede agregar cacheo en un spec futuro si hace falta.
- **Tabs de `/salon` funcionales vía `searchParams` (`?game=<id>`) y `<Link>`, en vez de estado de cliente.** Motivo: mismo patrón Server Component ya usado en el resto de la app (spec 01-05 no introducen client state para navegación); evita convertir `/salon` en Client Component solo para alternar de juego.
- **`ACTIVITY_TICKER`/`TOP_PLAYERS_TODAY` del Home quedan fuera de alcance.** Motivo: decisión explícita del usuario (implícita en el alcance acordado) — son un widget decorativo de marketing con su propio mock (`app/(home)/data.ts`), sin relación con la tabla `scores` real que pide este spec.

### Enmienda posterior a la implementación inicial

- **Los 8 juegos no jugables se sacaron por completo de `games` (Supabase) y de la UI (Home/Biblioteca/Salón), en vez de quedar visibles con estado vacío.** Motivo: decisión explícita del usuario tras ver la implementación — solo quiere que se muestre Asteroids, el único juego realmente jugable hoy. Su metadata original queda preservada como referencia (no usada por la app) en `lib/archived-games.ts`, con instrucciones para volver a insertarlos en `games` cuando tengan su propio spec de implementación. Esto reemplaza la decisión original de "Solo Asteroids participa del leaderboard real; los otros 8 juegos quedan en estado vacío indefinido".

## Riesgos identificados

- **`INSERT` público sin restricciones en `scores` permite spam o puntajes falsos** (cualquiera puede mandar un `score` arbitrariamente alto con cualquier nombre, sin jugar). Mitigación: ninguna en este spec — documentado explícitamente como aceptado por decisión del usuario; a mitigar en un spec futuro (Auth, rate-limit, o validación server-side del puntaje contra la partida real).
- **El nombre ingresado en la pantalla de fin de partida no tiene validación de contenido** (puede quedar vacío, tener espacios, o contener texto ofensivo). Mitigación: constraint mínima de "no vacío" en el input del cliente; sin moderación de contenido en este spec.
- **Migrar Home/Biblioteca/`/juego/[id]`/`/jugar/[id]` a `async` con fetch a Supabase agrega latencia de red donde antes era data en memoria (`GAMES` importado).** Si Supabase está lento o caído, esas páginas tardan o fallan en vez de cargar instantáneo. Mitigación: ninguna especial en este spec (sin loading states/skeleton ni fallback offline); páginas ya son `async` para `/juego/[id]` y `/jugar/[id]` hoy, el cambio nuevo es Home/Biblioteca.
- **`revalidatePath` tras `submitScore` puede no cubrir todas las variantes de `/salon` (`?game=<id>` por tab) si Next.js cachea cada combinación de searchParams por separado.** Riesgo de que el puntaje recién guardado no aparezca en `/salon` sin recarga manual completa. Mitigación: verificar en el paso 8 que `revalidatePath("/salon")` invalida todas las variantes con searchParams (comportamiento por defecto de Next.js App Router); si no, ajustar a `revalidatePath("/salon", "page")`.
- **Eliminar `GAMES`/`PLAYERS`/`seededScores` de `lib/data.ts` en el último paso puede romper el build si algún consumidor no migrado se pasó por alto** (ej. un componente no revisado en la exploración de este spec). Mitigación: el paso 9 corre `tsc --noEmit`/`next build` como verificación explícita antes de dar el paso por completo; si falla, se identifica y migra el consumidor faltante antes de continuar.
- **La tabla `games` sembrada por migración puede desincronizarse de futuros cambios manuales a los juegos** (hoy `lib/data.ts` se editaba directamente en código; ahora requiere una migración SQL o panel de Supabase). Mitigación: ninguna en este spec — documentado como cambio de flujo de trabajo a tener en cuenta para specs futuros que agreguen o editen juegos.
