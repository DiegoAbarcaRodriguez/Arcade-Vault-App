# Spec 03 — Página "Acerca de" + Contacto con envío real de email

- **Estado:** Draft
- **Depende de:** 02-home-page
- **Fecha:** 2026-07-29
- **Objetivo:** Crear la página "Acerca de" en `/acerca-de` (misión + highlights, portados de `about.jsx`) con un formulario de contacto funcional que envía un email real a través de Resend a `abarcarodriguezdiego@gmail.com` mediante un Server Action.

## Alcance

**Incluye:**
- Nueva ruta `/acerca-de` con la página "Acerca de", portada desde `resources/templates/home-about/home-about/about.jsx`:
  - Hero con kicker, título, párrafo de misión y fila de 3 highlights (iconos SVG pixel-art: HEART, BROWSER, PLANT).
  - Divisor decorativo animado (`about-divider`).
  - Sección de contacto: intro + 3 "tips" (respuesta en 24-48h, sugerencias bienvenidas, sin spam) + formulario (nombre, email, mensaje).
- Animación de scroll-reveal para las secciones (reutilizando `components/Reveal.tsx` ya creado en spec 02, o el patrón `.reveal`/`IntersectionObserver` equivalente si el markup portado lo requiere distinto).
- **Envío real de email** al enviar el formulario de contacto:
  - Server Action (`app/acerca-de/actions.ts` o similar) que recibe `{ name, email, message }`.
  - Validación en el servidor: campos no vacíos + formato de email válido (regex simple). Si falla, retorna un estado de error sin llamar a Resend.
  - Llamada a la API de Resend (paquete `resend`) para enviar el email a `abarcarodriguezdiego@gmail.com`, usando el dominio de pruebas de Resend (`onboarding@resend.dev`) como remitente, con el nombre/email/mensaje del formulario en el cuerpo.
  - Si Resend falla (API caída, key inválida, error de red), el Server Action retorna un estado de error; el formulario vuelve a estado editable mostrando un mensaje de error y **conserva lo que el usuario escribió** (sin perder el input).
  - Si el envío es exitoso, se muestra la pantalla de éxito tipo "terminal" ya presente en el prototipo (`terminal-success`), con opción de "Enviar otro mensaje".
- Nueva variable de entorno `RESEND_API_KEY`, documentada en `.env.example` (vacía) y usada desde `.env.local` (gitignored) en desarrollo.
- Agregar dependencia `resend` (paquete npm oficial) a `package.json`.
- Actualización de `components/Nav.tsx`: el link "Acerca de" pasa de `href="#"` a `href="/acerca-de"`, y se agrega a la lógica `isActive` para que se marque activo en `/acerca-de`. Replicar en el panel móvil.
- Porte de las clases CSS relacionadas (`about-hero`, `highlight-row`, `about-divider`, `about-contact`, `contact-form`, `terminal-success`, etc.) desde `resources/templates/home-about/home-about/styles.css` a `app/globals.css`.

**No incluye (queda fuera de este spec):**
- Protección anti-spam (honeypot, rate limiting, captcha) — se pospone a un spec futuro si se vuelve necesario.
- Persistencia del mensaje de contacto en cualquier base de datos o archivo — el mensaje **solo se envía por email**, no se guarda en ningún lado.
- Dominio propio verificado en Resend — se usa el dominio de pruebas `onboarding@resend.dev` mientras no haya uno.
- Confirmación por email al usuario que llenó el formulario (solo se notifica al destinatario `abarcarodriguezdiego@gmail.com`, no hay auto-respuesta).
- Cualquier cambio a Home (`/`) o Biblioteca (`/biblioteca`) — ya cubiertos por specs 01/02.
- Internacionalización o soporte multi-idioma del formulario/página.

## Modelo de datos

No se introduce ningún modelo de datos persistente (sin DB, sin `lib/data.ts` nuevo). Solo tipos locales para el formulario y la respuesta del Server Action, definidos junto al código que los usa (`app/acerca-de/actions.ts`):

```ts
export interface ContactFormState {
  status: "idle" | "success" | "error";
  error?: string;   // mensaje de error a mostrar si status === "error"
  name?: string;     // nombre confirmado si status === "success" (para el mensaje de la terminal)
}

export async function sendContactMessage(
  prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState>;
```

`sendContactMessage` es el Server Action, pensado para usarse con `useActionState` (React 19) desde el formulario cliente, de modo que el estado de éxito/error se maneje sin JS adicional a mano.

## Plan de implementación

1. **Instalar dependencia y configurar entorno** — Agregar `resend` a `package.json` (`npm install resend`). Crear `.env.example` con `RESEND_API_KEY=` (vacío) en la raíz del proyecto. Confirmar que `.env.local` está en `.gitignore` (Next.js lo ignora por defecto en el scaffold).

2. **Server Action de contacto (`app/acerca-de/actions.ts`)** — Crear `"use server"` action `sendContactMessage(prevState, formData)`: extrae `name`, `email`, `msg` de `FormData`; valida no-vacíos + formato de email (regex); si falla, retorna `{ status: "error", error: "..." }` sin llamar a Resend. Si pasa validación, instancia `new Resend(process.env.RESEND_API_KEY)` y llama a `resend.emails.send({...})` con `from: "onboarding@resend.dev"`, `to: "abarcarodriguezdiego@gmail.com"`, `subject`, y el cuerpo con nombre/email/mensaje del remitente. Si Resend lanza error, retorna `{ status: "error", error: "..." }`; si tiene éxito, retorna `{ status: "success", name }`.

3. **CSS de Acerca de** — Portar a `app/globals.css` las clases del prototipo relacionadas a `about-hero`, `highlight-row`/`.highlight`, `about-divider`, `about-contact`, `contact-grid`, `contact-form` (incluyendo estado `.shake`), `terminal-success` y sus sub-clases (`term-bar`, `term-body`, `line`, `caret`, etc.), desde `resources/templates/home-about/home-about/styles.css`.

4. **Formulario cliente (`components/ContactForm.tsx`)** — Client component que usa `useActionState(sendContactMessage, { status: "idle" })`. Renderiza los 3 campos (nombre, email, mensaje) cuando `status !== "success"`, aplica clase `shake` momentáneamente cuando `status === "error"` (via `useEffect` sobre el cambio de estado) y muestra el mensaje de error. Cuando `status === "success"`, renderiza el bloque `terminal-success` con el nombre devuelto y un botón "Enviar otro mensaje" que resetea el formulario (recargando el componente o usando una key/estado local para volver a `idle`).

5. **Página Acerca de (`app/acerca-de/page.tsx`)** — Server component que ensambla: hero (kicker, título, misión, `highlight-row` con los 3 highlights e íconos SVG inline portados de `HighlightIcon`), divisor decorativo, y sección de contacto (intro + tips + `<ContactForm />`). Envolver secciones en `Reveal` donde el prototipo usa `.reveal`.

6. **Actualizar `components/Nav.tsx`** — Cambiar el link "Acerca de" de `href="#"` a `href="/acerca-de"`, agregarlo a la lógica `isActive` (activo solo en `/acerca-de` exacta). Replicar en el panel móvil (`aside`).

7. **Verificación end-to-end** — Con `RESEND_API_KEY` configurada localmente por el usuario en `.env.local`, probar el envío real: completar el formulario en `/acerca-de`, confirmar que llega el email a `abarcarodriguezdiego@gmail.com`, y probar el caso de error (ej. key inválida temporalmente) para confirmar que el formulario muestra el mensaje de error y conserva el input.

## Criterios de aceptación

- [ ] `/acerca-de` carga sin errores de consola ni de build, con el Nav resaltando "Acerca de" como activo solo en esa ruta.
- [ ] La página muestra hero (kicker, título, misión), los 3 highlights con íconos SVG, el divisor decorativo y la sección de contacto con sus 3 tips.
- [ ] El link "Acerca de" en el Nav (desktop y menú móvil) apunta a `/acerca-de` y ya no usa `href="#"`.
- [ ] Enviar el formulario con campos vacíos no llama a Resend: se aplica la animación `shake` y no cambia a estado de éxito ni de error de red.
- [ ] Enviar el formulario con un email de formato inválido (ej. `"abc"`) es rechazado en el servidor sin llamar a Resend.
- [ ] Enviar el formulario con datos válidos y `RESEND_API_KEY` configurada correctamente envía un email real a `abarcarodriguezdiego@gmail.com` con el nombre, email y mensaje ingresados, y la UI cambia al estado `terminal-success` mostrando el nombre ingresado.
- [ ] Si Resend falla (ej. `RESEND_API_KEY` inválida o ausente), el formulario muestra un mensaje de error visible y conserva los valores que el usuario había escrito (no se limpian los campos).
- [ ] El botón "Enviar otro mensaje" en el estado de éxito vuelve el formulario a su estado inicial vacío.
- [ ] Las secciones de la página hacen fade-in al hacer scroll hasta ellas, sin saltos ni contenido invisible permanentemente.
- [ ] `.env.example` existe en la raíz con `RESEND_API_KEY=` vacío; `RESEND_API_KEY` real solo vive en `.env.local` (gitignored, no commiteado).
- [ ] No hay persistencia del mensaje de contacto en ningún storage, DB o archivo — el único efecto observable del envío exitoso es el email recibido.
- [ ] `tsc --noEmit` (o el build de Next) pasa sin errores de tipos en los archivos nuevos/modificados.

## Decisiones

- **Server Action en vez de API Route** para el envío de email. Motivo: es el patrón idiomático de Next 16 App Router para mutaciones desde formularios, evita crear un endpoint HTTP público innecesario y se integra directamente con `useActionState` en el cliente.
- **Dominio de pruebas `onboarding@resend.dev` como remitente**, en vez de esperar a verificar un dominio propio. Motivo: no hay dominio verificado todavía; el dominio de pruebas de Resend permite implementar y probar el flujo real de envío ahora mismo, y se puede cambiar el `from` más adelante sin tocar el resto de la lógica.
- **Sin protección anti-spam (honeypot, rate limiting, captcha)** en este spec. Motivo: decisión explícita del usuario — se pospone a un spec futuro si el spam se vuelve un problema real, evitando complejidad prematura.
- **Sin persistencia del mensaje de contacto.** Motivo: consistente con la filosofía "sin backend real" de specs 01 y 02 — el envío de email es la única pieza de infraestructura real que se introduce; agregar una base de datos solo para loguear mensajes sería una funcionalidad no pedida.
- **`RESEND_API_KEY` se deja vacía en `.env.example` y el usuario la completa manualmente en `.env.local`.** Motivo: instrucción explícita del usuario — la key es una credencial real que no debe generarse ni escribirse por el asistente.
- **Validación de servidor incluye formato de email (regex), no solo campos no vacíos.** Motivo: evita llamadas a Resend con emails mal formados que fallarían de todas formas, dando un error más rápido y claro al usuario.
- **Estado de error deja el formulario editable con los datos conservados**, en vez de limpiar el formulario o solo loguear en servidor. Motivo: decisión explícita del usuario — mejor UX cuando el envío de un email real puede fallar por causas ajenas al usuario (key inválida, Resend caído).

## Riesgos identificados

- **Sin `RESEND_API_KEY` configurada, todo envío fallará en desarrollo** hasta que el usuario la agregue a `.env.local`. Mitigación: el Server Action debe manejar la ausencia/invalidez de la key como el mismo camino de error ya definido (mensaje visible, formulario conserva input), no como un crash sin manejar.
- **Límites del plan gratuito de Resend y del dominio de pruebas** (`onboarding@resend.dev` solo puede enviar a la dirección verificada de la cuenta, según las reglas de Resend para dominios no verificados). Mitigación: verificar durante la implementación que el envío a `abarcarodriguezdiego@gmail.com` funciona con el dominio de pruebas; si Resend lo bloquea por no ser la cuenta verificada, documentarlo como bloqueante para el usuario en vez de intentar workarounds no solicitados.
- **Sin anti-spam, el endpoint del Server Action queda abierto a envíos automatizados repetidos**, lo que podría agotar la cuota de Resend o generar ruido en el correo destino. Mitigación: ninguna en este spec (decisión explícita); si se vuelve un problema real, se aborda en un spec futuro dedicado.
