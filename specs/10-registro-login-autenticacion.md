# Spec 10 — Registro, login y autenticación con Supabase Auth

> **Estado:** Approved
> **Depende de:** 04-supabase-setup, 06-leaderboard-y-juegos
> **Fecha:** 2026-09-04
> **Objetivo:** Implementar registro y login (email+contraseña y OAuth Google/GitHub) con Supabase Auth, sesión persistente vía `proxy.ts`, recuperación de contraseña, y una tabla `profiles` con `username` editable que reemplaza el `player_name` de texto libre, de modo que solo usuarios autenticados puedan guardar puntajes.

## Alcance

**Incluye:**

- Reescritura de `app/auth/page.tsx` (hoy mockup estático) para que sea funcional, manteniendo el diseño actual: una sola ruta `/auth` con tabs "Iniciar sesión" / "Crear cuenta".
- **Registro con email + contraseña**: campos Usuario, Correo, Contraseña. Al enviarse, llama a `supabase.auth.signUp` pasando el username en `options.data` (`user_metadata`). Como la confirmación de email está activa en Supabase, tras registrarse se muestra un estado "revisa tu correo" y no hay sesión hasta confirmar.
- **Login con email + contraseña**: `supabase.auth.signInWithPassword`. Éxito → redirige a `/`. Error → mensaje visible, formulario conserva lo escrito.
- **OAuth con Google y GitHub**: botones "GOOGLE" y "GITHUB" del mockup llaman a `supabase.auth.signInWithOAuth` con `redirectTo` a `/auth/callback`.
- **Nueva route handler `app/auth/callback/route.ts`**: intercambia el `code` por sesión (`exchangeCodeForSession`) tanto para OAuth como para el link de confirmación de email, y redirige a `/`.
- **Recuperación de contraseña**:
  - Link "¿Olvidaste tu contraseña?" en la tab de login → vista/estado que pide el correo y llama a `supabase.auth.resetPasswordForEmail` con `redirectTo` a `app/auth/actualizar-password`.
  - Nueva ruta `app/auth/actualizar-password/page.tsx`: formulario para setear la nueva contraseña (`supabase.auth.updateUser`), disponible solo con la sesión de recuperación activa. Éxito → redirige a `/`.
- **`proxy.ts` en la raíz del proyecto** (equivalente Next 16 del middleware): refresca la cookie de sesión de Supabase en cada request para que `getUser()` funcione en Server Components. Solo refresca; no bloquea ninguna ruta.
- **Tabla `profiles` en Supabase**: `id` (uuid, PK, FK a `auth.users.id`), `username` (text, nullable), `created_at`. Trigger `on auth.users insert` que crea la fila con `username` sembrado desde `user_metadata` (registro por email) o `null` (OAuth).
- **Migración de `scores`**: agregar columna `user_id` (uuid, FK a `auth.users.id`), eliminar la columna `player_name`, y **borrar todas las filas existentes** de `scores`.
- **Cambios en el guardado de puntaje** (`lib/supabase/actions.ts` + `components/GamePlayer.tsx`):
  - `submitScore` pasa a exigir sesión: obtiene el usuario con el cliente servidor de Supabase; si no hay sesión, retorna/lanza error y no inserta nada.
  - La pantalla de guardado de puntaje al terminar la partida muestra un campo de username **precargado** con `profiles.username` del usuario (vacío si aún no tiene). El usuario puede editarlo; guardar el puntaje hace `upsert` de `profiles.username` con ese valor (obligatorio, no vacío) y luego inserta el `score` con `user_id`.
  - Si no hay sesión, esa pantalla no muestra el campo de nombre: muestra un aviso "Inicia sesión para guardar tu puntaje" con link a `/auth`.
- **Consultas del leaderboard** (`lib/supabase/queries.ts`): `getScores` (y lo que use nombres de jugador) hace join `scores → profiles` para mostrar `profiles.username` en vez del viejo `player_name`.
- **Estado de sesión en `components/Nav.tsx`**: con sesión, el botón "Iniciar Sesión" se reemplaza por "Cerrar sesión" (llama a `supabase.auth.signOut` y refresca; el resto del Nav no cambia). Replicado en el panel móvil.
- Nuevo helper `lib/supabase/auth.ts` (o similar) con funciones de conveniencia server-side (`getSessionUser`) reutilizables por `proxy.ts`, Server Actions y Server Components.

**No incluye (queda fuera de este spec):**

- **Row Level Security** en `scores` y `profiles`: se posterga. El único gate de "solo autenticados guardan puntaje" vive en el Server Action, no en la base de datos.
- Pantalla dedicada de edición de perfil / cambio de username fuera de la pantalla de guardado de puntaje.
- Verificación de unicidad del `username` (dos usuarios pueden tener el mismo nombre visible).
- Avatares, foto de perfil o cualquier otro dato de perfil más allá de `username`.
- Página de "mi cuenta", historial de puntajes propios, o borrado de cuenta.
- Rutas protegidas / redirección por falta de sesión: todos los juegos y páginas siguen siendo navegables como invitado; lo único que exige sesión es **guardar** un puntaje.
- Migrar los `player_name` viejos a usuarios reales: esas filas se borran.
- Vincular una misma persona que entra por email y por OAuth con el mismo correo (Supabase decide el linking por su cuenta; no se fuerza).
- Cambiar el `redirectTo` de OAuth por dominio propio verificado (se usa la URL del entorno).
- Internacionalización de los textos de auth.

## Modelo de datos

### Tabla nueva: `profiles`

```sql
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text,
  created_at timestamptz not null default now()
);
```

- `id`: mismo uuid que `auth.users.id`. No se genera aparte.
- `username`: lo escribe el usuario, arbitrario, puede repetirse entre usuarios, puede ser `null` hasta que guarde su primer puntaje.
- RLS: **no** se activa en este spec (ver Alcance).

### Trigger: crear `profiles` al registrarse

```sql
create function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username)
  values (new.id, nullif(new.raw_user_meta_data ->> 'username', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- Registro email+contraseña: `signUp` manda `options.data.username`, que llega a `raw_user_meta_data`.
- OAuth Google/GitHub: no hay `username` en la metadata → `profiles.username` nace `null`.

### Tabla existente: `scores` (migración)

Antes:

```
scores ( id, game_id, player_name text, score int, created_at )
```

Después:

```sql
alter table public.scores drop column player_name;
alter table public.scores add column user_id uuid not null references auth.users (id) on delete cascade;
delete from public.scores;   -- se borran todas las filas previas
```

- El nombre visible en el leaderboard ya no se guarda en `scores`; sale de `profiles.username` vía join por `user_id`.
- Editar el `username` en la pantalla de fin de partida hace `upsert` en `profiles` y, por el join, cambia el nombre mostrado en **todos** los puntajes de ese usuario.

### Tipos en el código

`lib/supabase/queries.ts` — el shape de fila de score cambia de `player_name` a join:

```ts
// lectura de scores con nombre del perfil
type ScoreRow = { rank: number; name: string; score: number; date: string };
// name proviene de profiles.username (o "Anónimo" si es null)
```

`lib/supabase/auth.ts` (nuevo):

```ts
import type { User } from "@supabase/supabase-js";
export async function getSessionUser(): Promise<User | null>;
```

`lib/supabase/actions.ts` — `submitScore` cambia de firma:

```ts
// antes: submitScore(gameId, playerName, score)
// después:
export async function submitScore(
  gameId: string,
  username: string, // valor del campo editable; se upsertea en profiles.username
  score: number,
): Promise<void>; // lanza si no hay sesión o si username queda vacío
```

Convenciones:

- `username` se guarda tal cual lo escribe el usuario, sólo con `.trim()`; sin normalizar mayúsculas ni validar unicidad.
- `profiles.username` vacío o `null` se muestra como `"Anónimo"` en cualquier listado.

## Plan de implementación

1. **Migración de base de datos.** Vía MCP de Supabase: crear tabla `profiles`, la función `handle_new_user` y el trigger `on_auth_user_created`; luego `alter table scores` (drop `player_name`, add `user_id not null` con FK) y `delete from scores`. Verificación: `list_tables` muestra `profiles` y `scores.user_id`; `scores` queda vacía.

2. **Configurar proveedores OAuth en Supabase.** En el dashboard de Supabase habilitar Google y GitHub con sus client id/secret, y registrar `http://localhost:3000/auth/callback` (+ la URL de producción) como Redirect URL. Documentar en `specs/04-supabase-setup.md` o en un comentario en `.env.example` que estas credenciales se configuran en Supabase, no en el `.env` del proyecto. Sin código todavía; verificación manual en el dashboard.

3. **Helper de sesión server-side (`lib/supabase/auth.ts`).** Crear `getSessionUser(): Promise<User | null>` que instancia el cliente servidor (`lib/supabase/server.ts`) y devuelve `data.user` de `supabase.auth.getUser()` (o `null`). Sin uso aún. Verificación: `tsc --noEmit` pasa.

4. **`proxy.ts` en la raíz.** Crear `proxy.ts` exportando `proxy(request)` según `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`: usa `@supabase/ssr` con el patrón de cookies request/response para llamar a `supabase.auth.getUser()` y devolver la respuesta con las cookies refrescadas. `config.matcher` excluye assets estáticos. No bloquea ninguna ruta. Verificación: navegar el sitio logueado (tras el paso 6) mantiene la sesión al recargar un Server Component.

5. **`app/auth/callback/route.ts`.** Route handler `GET` que lee `code` de la query, llama a `supabase.auth.exchangeCodeForSession(code)` con el cliente servidor, y hace `redirect("/")`. Si no hay `code` o falla, redirige a `/auth?error=oauth`. Verificación: pegar manualmente una URL `/auth/callback?code=...` inválida redirige a `/auth?error=oauth`.

6. **Formulario de auth funcional (`app/auth/page.tsx`).** Convertir el mockup en cliente funcional con el cliente browser (`lib/supabase/client.ts`), conservando el markup/estilos actuales:
   - Tab "Crear cuenta": `signUp({ email, password, options: { data: { username }, emailRedirectTo: <origin>/auth/callback } })`. Éxito → estado "revisa tu correo para confirmar". Error → mensaje visible, conserva inputs.
   - Tab "Iniciar sesión": `signInWithPassword({ email, password })`. Éxito → `router.push("/")` + `router.refresh()`. Error → mensaje visible, conserva inputs.
   - Botones Google/GitHub: `signInWithOAuth({ provider, options: { redirectTo: <origin>/auth/callback } })`.
   - Leer `?error=oauth` de la URL para mostrar un mensaje si el callback falló.
     Verificación: registro real → llega email; confirmar → sesión activa en `/`. Login con credenciales válidas → `/`. OAuth Google y GitHub → vuelven logueado a `/`.

7. **Recuperar contraseña — pedir email.** En la tab de login agregar link "¿Olvidaste tu contraseña?" que muestra un sub-formulario (un campo email) → `resetPasswordForEmail(email, { redirectTo: <origin>/auth/actualizar-password })`. Éxito → mensaje "revisa tu correo". Verificación: llega el email de reset.

8. **Recuperar contraseña — setear nueva (`app/auth/actualizar-password/page.tsx`).** Página cliente con formulario (contraseña + repetir). Al montar, si no hay sesión de recuperación, muestra aviso y link a `/auth`. Submit → `updateUser({ password })`. Éxito → `router.push("/")` + `refresh()`. Verificación: seguir el link del email, cambiar la contraseña, quedar logueado en `/`, y poder volver a entrar con la nueva contraseña.

9. **Estado de sesión en `components/Nav.tsx`.** El Nav (client) se suscribe a `supabase.auth.onAuthStateChange` y consulta la sesión inicial con el cliente browser. Con sesión: el `<Link href="/auth">Iniciar Sesión</Link>` se reemplaza por un `<button>Cerrar sesión</button>` que hace `signOut()` + `router.refresh()`; sin sesión, queda como está. Replicar en el `aside` móvil. El resto del Nav no cambia. Verificación: al loguear/desloguear, solo ese botón cambia, sin recargar la página entera.

10. **`submitScore` con sesión (`lib/supabase/actions.ts`).** Cambiar la firma a `submitScore(gameId, username, score)`. Implementación: `const user = await getSessionUser()`; si `!user` → `throw new Error("Debes iniciar sesión para guardar tu puntaje.")`. `const name = username.trim()`; si vacío → `throw`. `upsert` en `profiles` `{ id: user.id, username: name }`. `insert` en `scores` `{ game_id: gameId, user_id: user.id, score }`. Mantener los `revalidatePath`. Verificación: llamar sin sesión lanza; con sesión inserta el score y actualiza el perfil.

11. **Pantalla de fin de partida (`components/GamePlayer.tsx`).**
    - Si hay sesión: precargar el campo de nombre con `profiles.username` actual (consulta al montar o al entrar en `gameover`); al guardar, llamar a `submitScore(game.id, scoreName, score)` con la nueva firma.
    - Si no hay sesión: no mostrar el campo de nombre ni el botón "Guardar"; mostrar "Inicia sesión para guardar tu puntaje" + link a `/auth`.
      Verificación: invitado ve el aviso; usuario logueado guarda, y editar el nombre acá cambia lo que muestra el leaderboard.

12. **Leaderboard con join a `profiles` (`lib/supabase/queries.ts`).** Actualizar `getScores` (y cualquier consulta que devolviera `player_name`) para seleccionar `user_id, score, created_at` y traer `profiles.username` vía join/`select("..., profiles(username)")`, mapeando a `name` (con fallback `"Anónimo"`). Ajustar los tipos `ScoreRow`/`ScoreStatsRow` y los componentes que los consumen (`/salon`, `/juego/[id]`). Verificación: `/salon` y `/juego/[id]` muestran los usernames actuales; cambiar un username se refleja en ambos.

13. **Verificación end-to-end.** Recorrer los criterios de aceptación con Supabase configurado: registro por email con confirmación, login, ambos OAuth, reset de contraseña, guardado de puntaje logueado, bloqueo de guardado como invitado, edición de username reflejada en el leaderboard, y persistencia de sesión al recargar. `npm run build` y `tsc --noEmit` sin errores.

## Criterios de aceptación

- [ ] Existe la tabla `profiles` con `id` (FK a `auth.users`), `username` (nullable) y `created_at`; `scores` tiene `user_id not null` (FK a `auth.users`) y ya no tiene `player_name`; `scores` quedó vacía tras la migración.
- [ ] Registrarse con email + contraseña + Usuario crea el usuario, muestra el estado "revisa tu correo" y **no** deja sesión activa hasta confirmar el correo.
- [ ] Al confirmar el correo desde el link, el usuario queda logueado y aterriza en `/`.
- [ ] Tras registrarse, existe una fila en `profiles` con `id` del usuario y `username` = el texto ingresado en el campo "Usuario".
- [ ] Login con email + contraseña válidos redirige a `/` y el Nav pasa a mostrar "Cerrar sesión".
- [ ] Login con credenciales inválidas muestra un mensaje de error visible y conserva el email escrito.
- [ ] El botón "GOOGLE" completa el flujo OAuth y vuelve a `/` logueado, con una fila en `profiles` cuyo `username` es `null`.
- [ ] El botón "GITHUB" completa el flujo OAuth y vuelve a `/` logueado, con una fila en `profiles` cuyo `username` es `null`.
- [ ] `/auth/callback` con un `code` inválido o ausente redirige a `/auth?error=oauth` y la página muestra un mensaje de error.
- [ ] El link "¿Olvidaste tu contraseña?" permite pedir el email de reset y muestra "revisa tu correo"; el email llega.
- [ ] Siguiendo el link del email de reset, `/auth/actualizar-password` permite setear una nueva contraseña, redirige a `/` logueado, y el login posterior funciona con la contraseña nueva.
- [ ] Abrir `/auth/actualizar-password` sin sesión de recuperación muestra un aviso y un link a `/auth`, sin permitir cambiar la contraseña.
- [ ] Recargar una página que es Server Component estando logueado mantiene la sesión (el `proxy.ts` refresca la cookie).
- [ ] `proxy.ts` existe en la raíz del proyecto, exporta `proxy`, y no redirige ni bloquea ninguna ruta por falta de sesión.
- [ ] El Nav (desktop y panel móvil) muestra "Iniciar Sesión" sin sesión y "Cerrar sesión" con sesión; hacer clic en "Cerrar sesión" quita la sesión y solo cambia ese botón, sin navegar a otra página.
- [ ] Terminar una partida **sin** sesión muestra "Inicia sesión para guardar tu puntaje" con link a `/auth` y no muestra campo de nombre ni botón de guardar.
- [ ] Terminar una partida **con** sesión muestra el campo de nombre precargado con el `username` actual del perfil (vacío si es `null`).
- [ ] Guardar un puntaje con el campo de nombre vacío es rechazado y no inserta nada en `scores` ni en `profiles`.
- [ ] Guardar un puntaje con sesión inserta una fila en `scores` con `user_id` del usuario y actualiza `profiles.username` con el valor del campo.
- [ ] Llamar a `submitScore` sin sesión lanza error y no inserta nada.
- [ ] `/salon` y `/juego/[id]` muestran como nombre de jugador el `profiles.username` actual (o "Anónimo" si es `null`), obtenido por join con `scores.user_id`.
- [ ] Editar el username al terminar una partida cambia el nombre mostrado en **todos** los puntajes previos de ese usuario en `/salon` y `/juego/[id]`.
- [ ] `npm run build` y `tsc --noEmit` pasan sin errores en los archivos nuevos y modificados.
- [ ] No hay consola con errores al cargar `/auth`, `/auth/actualizar-password`, `/salon` y `/juego/[id]`.

## Decisiones

- **Sí:** Supabase Auth como sistema de autenticación. Motivo: el proyecto ya tiene `@supabase/ssr` cableado (`lib/supabase/client.ts`, `server.ts`) y usa Supabase como backend de datos; no se agrega infraestructura nueva.
- **Sí:** email+contraseña **y** OAuth Google + GitHub en el mismo spec. Motivo: el mockup de `/auth` ya dibuja los tres caminos; implementarlos juntos evita un segundo spec para "activar los botones que ya están ahí".
- **Sí:** confirmación de email obligatoria en el registro. Motivo: decisión explícita del usuario — el usuario debe revisar su correo para completar el registro.
- **Sí:** tabla `profiles` con `id` + `username` + trigger sobre `auth.users`. Motivo: el nombre visible debe ser editable y global (editarlo cambia todos los puntajes del usuario), lo que exige una fila propia por usuario en vez de un texto suelto por partida.
- **No:** tomar el nombre visible del perfil de Google/GitHub (`name`, handle). Motivo: decisión explícita del usuario — el username lo ingresa la persona a mano; para usuarios OAuth nace `null` y se pide la primera vez que guardan un puntaje.
- **No:** unicidad del `username`. Motivo: sin tabla intermedia de reserva ni índice único; se acepta que dos usuarios compartan nombre visible. Se puede endurecer en un spec futuro si genera confusión en el leaderboard.
- **Sí:** `scores.user_id` como FK y **eliminar** `player_name`; el nombre sale por join a `profiles`. Motivo: decisión explícita del usuario — editar el username debe reflejarse en todos los puntajes pasados, no solo en los nuevos.
- **Sí:** borrar todas las filas actuales de `scores` en la migración. Motivo: decisión explícita del usuario — no vale la pena migrar `player_name` de texto libre a usuarios reales inexistentes.
- **No:** Row Level Security en `scores` y `profiles` en este spec. Motivo: decisión explícita del usuario — se posterga; el gate "solo autenticados guardan puntaje" vive por ahora únicamente en el Server Action `submitScore`.
- **No:** rutas protegidas / redirección por falta de sesión. Motivo: todos los juegos y páginas siguen jugables como invitado; la cuenta solo habilita **guardar** puntajes, así que no hace falta gatear navegación.
- **Sí:** una sola ruta `/auth` con tabs + `app/auth/callback/route.ts`. Motivo: conserva el diseño del mockup (tabs "Iniciar sesión" / "Crear cuenta") y centraliza el intercambio de `code` (OAuth y confirmación de email) en un único route handler.
- **Sí:** `proxy.ts` en la raíz (no `middleware.ts`). Motivo: Next.js 16 renombró middleware a Proxy (ver `CLAUDE.md` y `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`); Supabase SSR necesita ese refresco de cookie para que `getUser()` funcione en Server Components.
- **Sí:** tras login/reset exitoso redirigir a `/` y solo actualizar el estado del Nav. Motivo: decisión explícita del usuario — sin dashboard ni pantalla de cuenta, la home es el destino natural y el único cambio visible es el botón del Nav.
- **No:** pantalla dedicada de edición de perfil. Motivo: decisión explícita del usuario — el único punto de edición del username es la pantalla de fin de partida, que ya tiene el campo de nombre.
- **No:** vincular manualmente cuentas email y OAuth con el mismo correo. Motivo: se deja el comportamiento por defecto de Supabase; forzar el linking es complejidad no pedida.

## Riesgos

| Riesgo                                                                                                                                                                                                                                 | Mitigación                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin RLS, cualquiera con la `publishable key` puede insertar filas en `scores` o modificar `profiles` directo contra la API de Supabase, saltándose el Server Action.                                                                   | Aceptado explícitamente en este spec. El gate real (RLS con `user_id = auth.uid()`) queda anotado como el primer candidato para un spec de hardening.                                                 |
| El trigger `handle_new_user` con `security definer` mal escrito puede romper **todo** registro de usuario (falla el `insert on auth.users`).                                                                                           | Probar el trigger con un registro real en el paso 1 antes de seguir; si falla, el registro devuelve error 500 y es visible de inmediato. Mantener la función mínima (solo el `insert` en `profiles`). |
| `exchangeCodeForSession` y el flujo PKCE dependen de que las Redirect URLs (`/auth/callback`) estén registradas en Supabase para localhost **y** producción; si falta una, OAuth y el link de confirmación fallan solo en ese entorno. | Paso 2 del plan registra ambas URLs; el criterio de aceptación de `/auth/callback?error=oauth` cubre el camino de fallo.                                                                              |
| Borrar `player_name` y todas las filas de `scores` es destructivo e irreversible.                                                                                                                                                      | Decisión explícita del usuario; `scores` hoy solo tiene datos de prueba. La migración se aplica vía MCP en un solo paso revisable.                                                                    |
| `profiles.username` puede quedar `null` indefinidamente para usuarios OAuth que nunca guardan un puntaje; cualquier listado que asuma string no-nulo se rompe.                                                                         | Fallback `"Anónimo"` centralizado en `queries.ts`; los tipos marcan `username` como `string                                                                                                           | null`. |
| El campo de nombre en fin de partida se precarga con una consulta a `profiles` desde el cliente; si esa consulta falla, el usuario podría sobrescribir su username con vacío.                                                          | `submitScore` rechaza `username` vacío en el servidor; ante fallo de la precarga, el campo queda vacío y el guardado exige que el usuario escriba algo.                                               |
| Dos pestañas / `onAuthStateChange` en el Nav pueden desincronizarse con Server Components ya renderizados.                                                                                                                             | El handler de login/logout llama a `router.refresh()` además de actualizar el estado local, forzando revalidación del árbol server.                                                                   |

## Lo que **no** entra en este spec

- Row Level Security en `scores` y `profiles`.
- Pantalla de "mi cuenta", edición de perfil fuera del fin de partida, avatares, o historial de puntajes propios.
- Unicidad del `username`.
- Rutas protegidas o redirección por falta de sesión (todo sigue jugable como invitado).
- Migrar los `player_name` previos a usuarios reales (se borran).
- Vinculación manual de cuentas email + OAuth con el mismo correo.
- Borrado de cuenta y export de datos.
- Internacionalización de los textos de auth.

Cada uno, si llega, va en su propio spec.

## Enmienda (2026-09-05) — identidad visible desde OAuth

Se revierten dos decisiones de este spec por pedido explícito del usuario:

- **Ahora SÍ:** tomar el nombre visible del proveedor de Google/GitHub. El
  trigger `handle_new_user` siembra `profiles.username` desde
  `raw_user_meta_data` (`full_name` → `name` → `user_name` → parte local del
  correo) en vez de dejarlo `null` para usuarios OAuth. Migración
  `add_profile_identity_from_oauth`, con backfill que **sobrescribe** los
  `username` ya existentes.
- **Ahora SÍ:** avatar. Nueva columna `profiles.avatar_url` (nullable),
  sembrada por el mismo trigger desde `avatar_url`/`picture`. El Nav
  (`components/UserBadge.tsx`) muestra la foto del proveedor y cae a un
  círculo con iniciales si no hay imagen o falla la carga.
- El Nav (desktop y panel móvil) muestra avatar + nombre del usuario en
  sesión, además del botón "Cerrar Sesión". Hook compartido
  `lib/supabase/useProfile.ts`; helpers puros en `lib/profile.ts`. El
  nombre truncado tiene `title` (tooltip) con el nombre completo.
- RLS de `profiles` sigue deshabilitado y pendiente (riesgo ya anotado
  arriba); ahora también expone `avatar_url`.

### El `username` se fija al crear la cuenta y no se edita después

Revierte dos decisiones del spec (nombre editable en fin de partida; sin
unicidad):

- **Único a nivel global.** Índice `profiles_username_lower_key` sobre
  `lower(username)`, insensible a mayúsculas (`null` libre). Migración
  `enforce_unique_profile_username`.
- **Validado al registrarse.** `AuthForm` (registro por email) consulta
  `profiles` antes de `signUp` y rechaza el nombre si ya existe
  ("Ese nombre de usuario ya está en uso. Elige otro."). El índice es la
  garantía real ante una carrera.
- **OAuth:** el trigger `handle_new_user` siembra el nombre del proveedor
  y, si choca, prueba "Nombre 2", "Nombre 3"… (hasta 50) y si aun así
  falla cae a `null`.
- **Fin de partida (`components/GamePlayer.tsx`):** ya **no** hay campo
  editable. Se muestra "GUARDANDO COMO · <nombre de la cuenta>" en
  solo-lectura y el botón guarda el puntaje. `submitScore` cambió a
  `submitScore(gameId, score)` — ya no recibe ni actualiza el username.
  El nombre del leaderboard sale del join `scores.user_id → profiles`.

### Un solo puntaje por usuario y juego

Revierte el modelo de `scores` (que guardaba una fila por partida):

- Constraint `scores_game_user_key` unique `(game_id, user_id)`. Migración
  `one_score_per_user_per_game`, que primero deja una sola fila por par
  (la de mayor score).
- `submitScore` ya no hace `insert`: llama a la RPC
  `public.submit_score(p_game_id, p_score)` (`security definer`, usa
  `auth.uid()`) que hace `insert ... on conflict (game_id, user_id) do
update set score = greatest(...)`. Si el nuevo score es mayor lo
  sobrescribe y actualiza `created_at`; si no, la fila queda intacta.
- `getScores` no cambia: al haber una fila por usuario, el top ya no
  repite nombres.

### Correos de confirmación que no llegan

Dos causas:

1. **Registro con un correo ya existente** (`user_repeated_signup` en los
   logs de Auth). Con "Confirmar correo" activo, Supabase **no envía nada**
   y devuelve un usuario sin `identities` para no revelar si la cuenta
   existe. `AuthForm` mostraba igual "revisa tu correo". Corregido: si
   `data.user.identities` viene vacío, se muestra "ese correo ya está
   registrado" y se cambia a la pestaña de login.
2. **Servicio de email por defecto de Supabase.** Es solo para pruebas:
   límite de ~2 correos/hora y, en proyectos nuevos, solo entrega a
   direcciones que son miembros del proyecto/organización. Para que
   cualquier persona reciba el correo de confirmación hay que configurar
   **SMTP propio** en el dashboard (Authentication → Emails → SMTP). El
   proyecto ya usa Resend para el formulario de contacto; se puede reusar:
   host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = la
   API key de Resend, y un dominio verificado en Resend como remitente
   (el `onboarding@resend.dev` solo entrega al dueño de la cuenta). Subir
   además el rate limit en Authentication → Rate Limits. Esto es config de
   dashboard, no de código.
