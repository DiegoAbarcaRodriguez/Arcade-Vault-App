# Spec 04 — Infraestructura de cliente Supabase

- **Estado:** Implemented
- **Depende de:** 03-about-contact
- **Fecha:** 2026-08-05
- **Objetivo:** Instalar y configurar la infraestructura de cliente de Supabase (`@supabase/supabase-js` + `@supabase/ssr`) en Next.js 16, con clientes separados para browser y server en `lib/supabase/`, sin conectar ninguna feature (Auth, leaderboard) todavía.

## Alcance

**Incluye:**

- Agregar `@supabase/supabase-js` y `@supabase/ssr` a `package.json`.
- `lib/supabase/client.ts`: cliente de browser (`createBrowserClient`), para usar en Client Components.
- `lib/supabase/server.ts`: cliente de servidor (`createServerClient` con manejo de cookies de Next.js), para usar en Server Components/Actions/Route Handlers.
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` agregadas a `.env.example` (vacías) y usadas desde `.env.local` (gitignored).

**No incluye (queda fuera de este spec):**

- Conectar Auth real al formulario de `/auth` (login/signup/logout/sesión) — spec futuro.
- Persistencia de puntajes/leaderboard en una tabla de Supabase — spec futuro.
- Definición de ningún esquema de base de datos, tabla o migración en Supabase.
- `proxy.ts` (middleware de sesión/refresh de cookies) — solo aplica cuando se implemente Auth con sesiones.
- `SUPABASE_SERVICE_ROLE_KEY` u operaciones con privilegios de admin.
- Prueba de conexión real (query de prueba) — se valida solo con `tsc`/build en este spec.

## Modelo de datos

No se introduce ningún modelo de datos nuevo — este spec es solo configuración de clientes/infraestructura, sin tablas, tipos de dominio ni estado persistente.

## Plan de implementación

1. **Instalar dependencias** — `npm install @supabase/supabase-js @supabase/ssr`.
2. **Variables de entorno** — Agregar `NEXT_PUBLIC_SUPABASE_URL=` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` (vacías) a `.env.example`. Confirmar que `.env.local` sigue gitignored (ya lo está, patrón `.env*` + `!.env.example`).
3. **Cliente browser (`lib/supabase/client.ts`)** — Exporta `createClient()` que llama a `createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)` de `@supabase/ssr`, para usar en Client Components.
4. **Cliente server (`lib/supabase/server.ts`)** — Exporta `async function createClient()` que llama a `createServerClient(...)` de `@supabase/ssr`, leyendo/escribiendo cookies vía `next/headers` (`cookies()`), siguiendo el patrón oficial de Supabase para Next.js App Router. Marca el archivo como servidor-only (no `"use client"`).
5. **Verificación** — Correr `tsc --noEmit` (o `next build`) y confirmar que compila sin errores, incluyendo los dos archivos nuevos. No se prueba conexión real a Supabase en este spec.

## Criterios de aceptación

- [ ] `@supabase/supabase-js` y `@supabase/ssr` aparecen en `package.json` (dependencies) y `package-lock.json` está actualizado.
- [ ] `lib/supabase/client.ts` existe y exporta una función que crea un cliente de browser usando `createBrowserClient` de `@supabase/ssr`.
- [ ] `lib/supabase/server.ts` existe y exporta una función asíncrona que crea un cliente de servidor usando `createServerClient` de `@supabase/ssr`, integrado con `cookies()` de `next/headers`.
- [ ] `.env.example` contiene `NEXT_PUBLIC_SUPABASE_URL=` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` vacíos.
- [ ] Las credenciales reales viven solo en `.env.local` (gitignored), nunca commiteadas.
- [ ] `tsc --noEmit` (o `next build`) pasa sin errores de tipos en los archivos nuevos.
- [ ] Ninguna ruta, componente o Server Action existente importa o usa los clientes nuevos todavía (el spec es solo infraestructura, sin features conectadas).

## Decisiones

- **`@supabase/ssr` desde ya, en vez de solo `@supabase/supabase-js`.** Motivo: decisión explícita del usuario — evita tener que re-tocar la config de clientes cuando se implemente Auth (spec futuro), ya que el manejo de cookies/sesión en App Router requiere estos helpers.
- **Nomenclatura de env vars `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**, en vez de `ANON_KEY`. Motivo: decisión explícita del usuario, siguiendo la convención vigente de Supabase (publishable key reemplaza a anon key).
- **Clientes separados browser/server (`lib/supabase/client.ts` y `lib/supabase/server.ts`)**, en vez de un solo archivo. Motivo: convención oficial de Supabase para Next.js App Router — el cliente de servidor necesita acceso a `cookies()` de `next/headers`, que no existe en el browser.
- **Sin prueba de conexión real** en este spec. Motivo: decisión explícita del usuario — alcanza con que compile; la conexión real se validará en el spec futuro que consuma estos clientes (Auth o leaderboard).
- **Sin `SUPABASE_SERVICE_ROLE_KEY`** en este spec. Motivo: no hay ninguna operación con privilegios de admin planeada todavía; agregar la key sin uso sería una credencial expuesta sin propósito.
- **El proyecto de Supabase (URL + keys) ya existe** y es responsabilidad del usuario completar `.env.local` manualmente, igual que `RESEND_API_KEY` en el spec 03. El asistente no genera ni escribe credenciales reales.

## Riesgos identificados

- **Sin credenciales reales configuradas, cualquier código futuro que use estos clientes fallará** hasta que el usuario complete `.env.local`. Mitigación: no aplica a este spec (no hay código que los consuma todavía); queda documentado para los specs futuros de Auth/leaderboard.
- **Cambios futuros en la API de `@supabase/ssr`** (paquete relativamente nuevo, con historial de cambios entre versiones en el manejo de cookies). Mitigación: fijar la versión instalada explícitamente en `package.json` y revisar el changelog antes de actualizarla en specs futuros.
- **Uso accidental del cliente de servidor en un Client Component** (o viceversa) en specs futuros, dado que ambos se llaman `createClient()`. Mitigación: nombres de archivo claros (`lib/supabase/client.ts` vs `lib/supabase/server.ts`) y el cliente de servidor es async (fallaría en build/tipo si se usa mal desde un Client Component).

## Ajustes de seguridad de Auth (spec 11)

Estos ajustes son **configuración del dashboard de Supabase**, no código: el
MCP no los expone y no quedan versionados como migración. Hay que aplicarlos a
mano en el proyecto (y repetirlos en cualquier entorno nuevo). Provienen del
checklist de `resources/security/security-checklist.md` y del advisor de
seguridad de Supabase. El punto 2 (leaked password protection) quedó **fuera de
alcance del spec 11** y sigue pendiente.

### 1. Largo mínimo de contraseña = 8

- **Dónde:** Dashboard → Authentication → Policies → _Minimum password length_.
- **Valor:** `8`.
- **Verificación:** intentar `signUp` con una contraseña de 7 caracteres → Supabase
  responde error (`Password should be at least 8 characters`) y no crea el usuario.

### 2. Protección de contraseñas filtradas (leaked password protection) — PENDIENTE

> Postergada por decisión del usuario (spec 11). El advisor sigue reportando
> `auth_leaked_password_protection` como _disabled_; es esperado hasta que se
> retome en un spec de hardening futuro. Cuando se active:

- **Dónde:** Dashboard → Authentication → Policies → _Leaked password protection_
  (chequeo contra HaveIBeenPwned).
- **Valor:** habilitado.
- **Verificación:** intentar `signUp` (o cambiar la contraseña) con una contraseña
  conocida-filtrada como `password` → Supabase responde error
  (`This password has been found in a data breach`). Además, `get_advisors(type:
"security")` deja de reportar `auth_leaked_password_protection`.

### 3. Rate limit de signup por IP

- **Dónde:** Dashboard → Authentication → Rate Limits → límite de _sign ups / sign
  ins_ por hora.
- **Valor sugerido:** `10` por hora (sitio de bajo tráfico; subir temporalmente
  durante demos o QA si hace falta).
- **Verificación:** superar el límite desde una misma IP en una hora → Supabase
  responde `429` (`email rate limit exceeded` / `over_request_rate_limit`).

> El servicio de email por defecto de Supabase es solo para pruebas (~2
> correos/hora y solo a miembros del proyecto). Para que cualquier persona reciba
> el correo de confirmación hay que configurar **SMTP propio** (Authentication →
> Emails → SMTP) — ver la enmienda "Correos de confirmación que no llegan" en
> `specs/10-registro-login-autenticacion.md`.
