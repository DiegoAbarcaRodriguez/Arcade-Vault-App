# Spec 11 — Hardening de seguridad: RLS, headers y política de contraseñas

> **Estado:** Implementando
> **Depende de:** 04-supabase-setup, 10-registro-login-autenticacion
> **Fecha:** 2026-09-05
> **Objetivo:** Cerrar los hallazgos del checklist de seguridad y del advisor de Supabase: habilitar RLS en `profiles` con políticas explícitas, endurecer las de `scores`, revocar `EXECUTE` público de las funciones `SECURITY DEFINER` de trigger, agregar headers de seguridad en Next.js, validar la complejidad de la contraseña en el registro (`AuthForm`), y documentar los ajustes de dashboard de Supabase Auth (largo mínimo de contraseña y rate limit de signup por IP).

## Alcance

**Incluye:**

- **RLS en `profiles`.** Habilitar Row Level Security en `public.profiles`. Política única: `profiles_select_public` (`SELECT` con `USING (true)`) — el leaderboard (`/salon`, `/juego/[id]`) y el badge del Nav leen `username`/`avatar_url` sin sesión. **Sin** políticas de `INSERT`/`UPDATE`/`DELETE`: la fila la crea el trigger `handle_new_user` (`SECURITY DEFINER`) y nunca se edita desde el cliente.
- **Endurecer RLS en `scores`.** Eliminar la política `scores_insert_public` (`WITH CHECK (true)`, marcada por el advisor como "always true"). Dejar solo `scores_select_public` (`SELECT` con `USING (true)`). Ninguna política de `INSERT`/`UPDATE`/`DELETE` para `anon`/`authenticated`: toda escritura pasa por la RPC `submit_score` (`SECURITY DEFINER`).
- **`games` sin cambios de política.** Ya tiene RLS habilitado y solo `games_select_public`. Se deja como está; se documenta que las filas se siembran por migración (rol `postgres`), no desde el cliente.
- **Revocar `EXECUTE` de funciones `SECURITY DEFINER` de trigger.** `REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public` y lo mismo para `public.rls_auto_enable()`. Son funciones de trigger / event-trigger; no deben ser invocables vía `/rest/v1/rpc/...`. `submit_score(p_game_id, p_score)` conserva `EXECUTE` para `authenticated` (la usa el Server Action `submitScore`) y para `service_role`.
- **Validación de complejidad de contraseña en `AuthForm` (registro).** Constante de módulo `PASSWORD_RE` que espeja el preset de Supabase Auth "Lowercase, uppercase letters, digits and symbols": exige minúscula, mayúscula, dígito y símbolo ASCII, largo 8–72. En `handleSubmit`, tab "Crear cuenta", se rechaza con mensaje claro antes de llamar a `signUp` si `password` no cumple. El `<input type="password">` de la tab de registro suma `minLength={8}` y un hint bajo el campo. Supabase lo vuelve a exigir del lado del servidor; la validación local es solo para dar feedback inmediato.
- **Headers de seguridad en `next.config.ts`.** Agregar `async headers()` que aplica a `/(.*)`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
- **Documentar los ajustes de dashboard de Supabase Auth** (no son código; el MCP no los toca). En `specs/04-supabase-setup.md` se agrega una subsección "Ajustes de seguridad de Auth" con los pasos exactos y cómo verificar cada uno:
  - **Largo mínimo de contraseña:** Authentication → Policies → Minimum password length = `8`.
  - **Rate limit de signup:** Authentication → Rate Limits → fijar un límite de signups por hora/IP acorde a un sitio de bajo tráfico (valor sugerido documentado, p. ej. 10/hora).
- **Re-correr el advisor de seguridad** de Supabase al final y dejar registrado el estado esperado (limpio salvo las notas aceptadas sobre `submit_score` y `auth_leaked_password_protection`, ver Decisiones).

**No incluye (queda fuera de este spec):**

- **CAPTCHA (hCaptcha / Turnstile)** en `AuthForm`. Se confía en el rate limit por IP de Supabase; el CAPTCHA queda para un spec futuro si aparece abuso real.
- **Content-Security-Policy.** Alto riesgo de romper Next.js/Supabase; merece su propio spec con pruebas dedicadas.
- **Medidor de fuerza de contraseña / feedback en vivo por tecla** en `AuthForm`. La validación es de una sola pasada al enviar (regex + `minLength`), sin barra de progreso ni chequeo carácter a carácter.
- **Validación de complejidad en el resto de flujos de contraseña** (`app/auth/actualizar-password`). Solo se cubre el registro en `AuthForm`; el reset de contraseña se apoya únicamente en la validación server-side de Supabase.
- **Protección de contraseñas filtradas (leaked password protection).** Se posterga por pedido del usuario. El advisor seguirá reportando `auth_leaked_password_protection` como _disabled_; queda como candidato a un spec de hardening futuro. Su verificación queda anotada en `specs/04-supabase-setup.md` para cuando se retome.
- **Políticas de `UPDATE` en `profiles`** (edición de `username`/`avatar_url` desde la app). El `username` sigue siendo inmutable post-registro (spec 10).
- **Rotación o scoping de llaves de Supabase**, WAF, protección DDoS a nivel infraestructura, MFA/2FA, y auditoría de sesiones.
- **Rutas protegidas / redirección por falta de sesión.** Sin cambios respecto al spec 10: todo sigue navegable como invitado.
- **Migrar datos existentes.** Las 2 filas de `scores` y los 2 `profiles` actuales quedan como están; las políticas nuevas no requieren backfill.
- **Cambios en `proxy.ts`.** Sigue solo refrescando la cookie de sesión.

## Modelo de datos

Este spec **no introduce tablas ni columnas nuevas**. Cambia políticas RLS y permisos de ejecución. El estado objetivo de la base:

### Políticas RLS (estado final)

```sql
-- profiles: RLS ON, solo lectura pública
alter table public.profiles enable row level security;
create policy profiles_select_public on public.profiles
  for select using (true);
-- (sin políticas de insert/update/delete)

-- scores: RLS ON, solo lectura pública
drop policy if exists scores_insert_public on public.scores;
-- se conserva:
--   scores_select_public  for select using (true)
-- (sin políticas de insert/update/delete)

-- games: sin cambios
--   games_select_public   for select using (true)
```

### Permisos de ejecución (estado final)

```sql
revoke execute on function public.handle_new_user()  from anon, authenticated, public;
revoke execute on function public.rls_auto_enable()  from anon, authenticated, public;
-- submit_score(p_game_id text, p_score integer): conserva execute para authenticated y service_role
```

### Constante en el código

`components/AuthForm.tsx` — regex de complejidad de contraseña (nivel de módulo):

```ts
const PASSWORD_RE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\]).{8,72}$/;
```

- Lookaheads: minúscula, mayúscula, dígito, símbolo (set de puntuación ASCII, el mismo que usa GoTrue por defecto).
- `.{8,72}`: largo total; el tope 72 refleja que bcrypt trunca a 72 bytes.

Convenciones:

- Escrituras a `scores`: exclusivamente vía RPC `public.submit_score` (`SECURITY DEFINER`, usa `auth.uid()`).
- Creación de `profiles`: exclusivamente vía trigger `on_auth_user_created` → `handle_new_user` (`SECURITY DEFINER`).
- Siembra de `games`: exclusivamente vía migración (rol `postgres`).

## Plan de implementación

1. **Migración: RLS en `profiles`.** Vía MCP de Supabase (`apply_migration`, nombre `spec_11_profiles_rls`): `alter table public.profiles enable row level security;` + `create policy profiles_select_public ... for select using (true);`. Verificación: `list_tables` muestra `profiles.rls_enabled = true`; el join de `getScores` en `/salon` sigue mostrando usernames y avatares como invitado (sesión cerrada).

2. **Migración: endurecer `scores`.** `apply_migration` (`spec_11_scores_drop_public_insert`): `drop policy if exists scores_insert_public on public.scores;`. Verificación: `pg_policies` para `scores` deja solo `scores_select_public`. Guardar un puntaje logueado sigue funcionando (pasa por la RPC, no por política de INSERT).

3. **Migración: revocar `EXECUTE` de funciones de trigger.** `apply_migration` (`spec_11_revoke_definer_execute`): `revoke execute on function public.handle_new_user() from anon, authenticated, public;` y lo mismo para `public.rls_auto_enable()`. Verificación: `pg_proc.proacl` ya no lista `anon`/`authenticated` para esas dos; `submit_score` mantiene `authenticated`. Registrar un usuario nuevo por email sigue creando su fila en `profiles` (el trigger corre como owner, no como el rol del request).

4. **Headers de seguridad en `next.config.ts`.** Agregar `async headers()` con el bloque de 5 headers (Alcance) aplicado a `source: "/(.*)"`. No tocar `experimental.serverActions`. Verificación: `curl -I http://localhost:3000/` (o DevTools → Network) muestra los 5 headers en la respuesta de una página y de un asset.

5. **Documentar ajustes de Auth en `specs/04-supabase-setup.md`.** Nueva subsección "Ajustes de seguridad de Auth" con: (a) Minimum password length = 8, (b) Rate Limits → signups = 10/hora, y para cada uno cómo verificar (probar `signUp` con contraseña de 7 chars → error; superar el rate limit → `429`). La protección de contraseñas filtradas se documenta como **pendiente** (fuera de alcance de este spec). Sin código. El usuario aplica los toggles en el dashboard.

6. **Aplicar los toggles de dashboard.** El usuario entra al dashboard de Supabase y ejecuta los 2 ajustes activos del paso 5. Verificación: los chequeos manuales del paso 5 pasan.

7. **Validación de contraseña en `AuthForm`.** Agregar `PASSWORD_RE` a nivel de módulo en `components/AuthForm.tsx`; en `handleSubmit` (tab "Crear cuenta"), rechazar con mensaje claro antes de `signUp` si `password` no cumple; sumar `minLength={8}` y un hint al `<input type="password">` de la tab de registro. Verificación: en `/auth` → "Crear cuenta", una contraseña como `abcdefgh` (sin mayúscula/dígito/símbolo) muestra el mensaje y no llama a `signUp`; `Abcdef1!` pasa la validación local.

8. **Re-correr el advisor y verificación end-to-end.** `get_advisors(type: "security")` → sin `rls_disabled_in_public`, sin los `*_security_definer_function_executable` de `handle_new_user`/`rls_auto_enable`, sin `rls_policy_always_true`. Quedan (aceptadas) las notas de `submit_score` como `authenticated`-executable y de `auth_leaked_password_protection` como _disabled_ (postergada). Además: `npm run build` y `tsc --noEmit` sin errores; recorrer login, registro por email, guardado de puntaje logueado, y `/salon` + `/juego/[id]` como invitado.

## Criterios de aceptación

- [ ] `public.profiles` tiene `rls_enabled = true` y exactamente una política: `profiles_select_public` (`SELECT`, `USING true`).
- [ ] `public.profiles` no tiene ninguna política de `INSERT`, `UPDATE` ni `DELETE`.
- [ ] `public.scores` ya no tiene la política `scores_insert_public`; conserva `scores_select_public` y ninguna política de escritura.
- [ ] Un `INSERT`/`UPDATE`/`DELETE` directo contra `/rest/v1/scores` o `/rest/v1/profiles` con la publishable key (rol `anon` o `authenticated`) es rechazado por RLS.
- [ ] Guardar un puntaje estando logueado sigue funcionando (vía RPC `submit_score`) y `/salon` + `/juego/[id]` muestran el `username`/avatar por join, con y sin sesión.
- [ ] `public.handle_new_user()` y `public.rls_auto_enable()` no tienen `EXECUTE` para `anon`, `authenticated` ni `public`.
- [ ] `public.submit_score(text, integer)` conserva `EXECUTE` para `authenticated` y `service_role`.
- [ ] Registrar un usuario nuevo por email crea su fila en `profiles` (el trigger sigue corriendo pese al `REVOKE`).
- [ ] La respuesta HTTP de una página y de un asset incluye `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` y `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`.
- [ ] `specs/04-supabase-setup.md` tiene la subsección "Ajustes de seguridad de Auth" con los pasos y la verificación de los toggles (password mínimo y rate limit activos; leaked password protection marcada como pendiente).
- [ ] `signUp` con una contraseña de menos de 8 caracteres es rechazado.
- [ ] En `/auth` → "Crear cuenta", una contraseña sin mayúscula, sin dígito o sin símbolo (o de menos de 8) es rechazada con un mensaje visible y **no** dispara `signUp`.
- [ ] Una contraseña que cumple (minúscula + mayúscula + dígito + símbolo, 8–72) pasa la validación local y continúa el flujo de registro.
- [ ] La tab "Iniciar sesión" no aplica la validación de complejidad (no rompe el login de cuentas viejas).
- [ ] `get_advisors(type: "security")` no reporta `rls_disabled_in_public`, `rls_policy_always_true`, ni los `*_security_definer_function_executable` de `handle_new_user`/`rls_auto_enable`. (`auth_leaked_password_protection` sigue apareciendo — postergado, ver Decisiones.)
- [ ] `npm run build` y `tsc --noEmit` pasan sin errores.
- [ ] No hay errores de consola al cargar `/`, `/auth`, `/salon` y `/juego/[id]`.

## Decisiones

- **Sí:** RLS en `profiles` con solo `SELECT` público y sin políticas de escritura. Motivo: la fila la crea el trigger `SECURITY DEFINER` y el `username`/avatar no se editan desde la app (spec 10); no hace falta exponer escritura al cliente.
- **No:** política de `UPDATE` para que el usuario edite su propia fila de `profiles`. Motivo: el `username` es inmutable post-registro; agregar la política ahora sería código muerto.
- **Sí:** eliminar `scores_insert_public` y no reemplazarla por una política acotada (`WITH CHECK (user_id = auth.uid())`). Motivo: el 100% de las escrituras pasan por la RPC `submit_score`; una política de INSERT sería una segunda vía innecesaria y otra superficie que mantener.
- **Sí:** dejar `games` como está. Motivo: ya tiene RLS + `SELECT` público; las filas se siembran por migración.
- **Sí:** `REVOKE EXECUTE` de `handle_new_user` y `rls_auto_enable` para `anon`/`authenticated`/`public`. Motivo: son funciones de trigger/event-trigger; ser invocables por `/rpc/` es solo superficie de ataque. El trigger sigue disparando porque corre con los privilegios del owner.
- **Sí (aceptado):** `submit_score` queda como `authenticated`-executable y el advisor lo seguirá listando. Motivo: es intencional — el Server Action la llama con la sesión del usuario; usa `auth.uid()` internamente y no confía en parámetros de identidad.
- **Sí:** los ajustes de Auth activos (password mínimo, rate limit de signup) se documentan y se aplican a mano en el dashboard. Motivo: el MCP de Supabase no expone la config de Auth; no hay forma de versionarlos como migración.
- **No (por ahora):** protección de contraseñas filtradas (leaked password protection). Motivo: decisión explícita del usuario — se posterga. El advisor seguirá reportando `auth_leaked_password_protection`; se retoma en un spec de hardening futuro (es solo un toggle de dashboard).
- **No:** CAPTCHA en el registro. Motivo: el rate limit por IP de Supabase alcanza para el tráfico actual; el CAPTCHA agrega dependencia de terceros y UI nueva. Candidato a spec futuro si hay abuso.
- **No:** Content-Security-Policy. Motivo: Next.js (scripts inline del runtime) y Supabase (conexiones a `*.supabase.co`, websockets) hacen que una CSP correcta requiera nonces y pruebas dedicadas; va en su propio spec.
- **Sí:** validación client-side de complejidad de contraseña en `AuthForm` (registro), vía `PASSWORD_RE`. Motivo: pedido explícito del usuario — Supabase valida igual del lado del servidor, pero el error server-side es genérico y llega tarde; la regex local da feedback inmediato y espeja el preset del dashboard. Se asume el costo de tener el umbral en dos lugares.
- **No:** replicar la regex en un helper compartido o en `actualizar-password`. Motivo: por ahora solo el registro la necesita; extraerla a `lib/` sin un segundo consumidor sería especulativo.
- **No:** medidor de fuerza / feedback en vivo por tecla. Motivo: una validación de una pasada al enviar alcanza; el medidor es UI extra sin valor de seguridad.
- **Sí:** `Strict-Transport-Security` y `Permissions-Policy` además de los 3 headers del ejemplo del checklist. Motivo: costo cero, cierran clickjacking-adyacentes y fuerzan HTTPS; el checklist mostraba un mínimo, no un tope.

## Riesgos

| Riesgo                                                                                                                                       | Mitigación                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Habilitar RLS en `profiles` rompe el join `scores → profiles` de `getScores` si la política de `SELECT` no cubre al rol `anon`.              | La política es `USING (true)` para todos los roles; el paso 1 verifica `/salon` con sesión cerrada antes de seguir.                                                        |
| `REVOKE EXECUTE` sobre `handle_new_user` podría, si estuviera mal aplicado, hacer fallar el `INSERT` en `auth.users` y romper todo registro. | El trigger corre con privilegios del owner, no del invocador; el `REVOKE` solo quita la vía `/rpc/`. El paso 3 registra un usuario real como verificación inmediata.       |
| Los toggles de dashboard no quedan versionados; un reset del proyecto o un entorno nuevo los pierde.                                         | Quedan documentados con pasos exactos en `specs/04-supabase-setup.md`; hay que re-aplicarlos a mano en cada entorno.                                                       |
| `Strict-Transport-Security` con `preload` es difícil de revertir si algún subdominio no sirve HTTPS.                                         | El deploy es un único dominio servido por la plataforma de hosting sobre HTTPS; no hay subdominios propios sin TLS. Si aparece uno, se quita `includeSubDomains; preload`. |
| El rate limit de signup por IP puede bloquear pruebas legítimas desde una sola IP (demos, QA).                                               | Valor documentado holgado (10/hora); se puede subir temporalmente en el dashboard durante pruebas.                                                                         |
| `Permissions-Policy` con `browsing-topics=()` u otras directivas podría afectar features futuras (p. ej. un juego que use micrófono).        | Ningún juego actual usa cámara/mic/geo; si uno lo necesita, se ajusta la directiva puntual en `next.config.ts`.                                                            |

## Lo que **no** entra en este spec

- CAPTCHA (hCaptcha / Turnstile) en el registro.
- Content-Security-Policy.
- Protección de contraseñas filtradas (leaked password protection) — postergada.
- Medidor de fuerza de contraseña / feedback en vivo, y validación de complejidad fuera del registro (`actualizar-password`).
- Políticas de `UPDATE`/`INSERT`/`DELETE` en `profiles` (edición de perfil desde la app).
- Política de `INSERT` acotada en `scores` (todo pasa por la RPC `submit_score`).
- Rotación o scoping de llaves de Supabase, WAF, protección DDoS a nivel infraestructura, MFA/2FA.
- Rutas protegidas o redirección por falta de sesión.
- Migración o backfill de las filas existentes de `scores` y `profiles`.
- Cambios en `proxy.ts`.

Cada uno, si llega, va en su propio spec.
