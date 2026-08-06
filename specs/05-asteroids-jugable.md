# Spec 05 — Asteroids jugable ("Asteroides")

- **Estado:** Implemented
- **Depende de:** 01-vistas-mvp (define `/jugar/[id]`)
- **Fecha:** 2026-08-05
- **Objetivo:** Portar el juego Asteroids de `resources/02-asteroids` (canvas HTML5 vanilla) a un componente cliente de React que reemplaza el arena decorativa estática en `/jugar/asteroides` (nueva entrada en `GAMES`), con HUD sincronizado entre el canvas y el panel externo, controles de teclado y táctiles, y botones PAUSA/FIN funcionales — sin persistencia de puntajes.

## Alcance

**Incluye:**

- Nueva entrada `asteroides` en `GAMES` (`lib/data.ts`): título "ASTEROIDES", categoría `SHOOTER`, color `yellow`, cover `cover-asteroides`, `short`/`long` adaptados del `README.md` fuente, `best`/`plays` con valores mock placeholder (mismo estilo que el resto de `GAMES`).
- Nueva clase CSS `.cover-asteroides` en `app/globals.css` para la miniatura de portada (Biblioteca/Home), en el mismo lenguaje visual pixel-art que las coberturas existentes (`cover-bricks`, `cover-invaders`, etc.).
- Nuevo componente cliente `components/AsteroidsGame.tsx` que porta la lógica de `resources/02-asteroids/game.js` (clases `Bullet`, `Asteroid`, `Ship`, `Particle`, `PowerUp`, loop de juego, colisiones, niveles, power-up de disparo triple) a TypeScript, manteniendo el mismo comportamiento y balance (velocidades, puntos, spawn de power-ups) del original.
- `app/jugar/[id]/page.tsx`: cuando `id === "asteroides"`, renderiza `<AsteroidsGame game={game} />` dentro del `.crt-screen` en vez del `.game-arena` decorativo estático. Para cualquier otro `id`, la página se comporta exactamente igual que hoy (arena decorativa, sin cambios).
- **HUD dual sincronizado:** el canvas sigue dibujando su propio HUD (score/nivel/vidas/triple-shot) igual que el juego original, y además `AsteroidsGame` reporta esos mismos valores hacia arriba (vía callback) para que el panel `.player-hud` externo (Jugador/Puntuación/Vidas/Nivel) de la página se actualice en tiempo real con los mismos datos.
- **Botones PAUSA y FIN funcionales:**
  - PAUSA alterna pausa/reanudación del loop de juego; mientras está pausado, se muestra un overlay "PAUSADO" sobre el canvas (mismo patrón visual que el overlay "GAME OVER" del original) con indicación de cómo reanudar.
  - FIN abre un modal de confirmación propio (estilo arcade: fuente pixel, bordes neón, botones SI/NO, consistente con el resto de la UI) preguntando si se desea terminar la partida. Confirmar fuerza game over inmediato (mismo camino que quedarse sin vidas); cancelar no tiene efecto.
- **Canvas responsive:** resolución interna de juego fija en 800×600 (misma lógica de coordenadas del original), mostrada con escalado CSS manteniendo aspect ratio 4:3 para llenar el `.crt-screen` disponible en cualquier tamaño de pantalla.
- **Controles táctiles:** en pantallas táctiles/chicas (mismo breakpoint que ya usa la app para el menú móvil), aparecen botones fijos superpuestos/debajo del frame CRT: ◄ ► (rotar), ▲ (propulsar), ● (disparar). Ocultos en desktop. Estilo visual consistente con el resto de botones de la app (`.btn` variants).
- Controles de teclado idénticos al original: `←`/`→` rotar, `↑` propulsar, `Espacio` disparar.
- **Atajo de teclado para pausar:** tecla `P` alterna pausa/reanudación (mismo efecto que el botón PAUSA del HUD externo, incluyendo el overlay "PAUSADO"). Funciona tanto dentro como fuera de pantalla completa.
- **Botón de pantalla completa:** nuevo botón en el HUD externo (junto a PAUSA/FIN/SALIR) que usa la Fullscreen API nativa del navegador sobre el canvas del juego. En pantalla completa solo se ve el canvas (con su propio HUD dibujado adentro); el HUD externo no es visible. Salir de pantalla completa es el comportamiento nativo del navegador (tecla `Escape`), sin código adicional. El canvas mantiene su aspect ratio 4:3 en pantalla completa (sin deformarse), centrado con barras negras si el aspect ratio de la pantalla no coincide.

**No incluye (queda fuera de este spec):**

- Persistencia del puntaje/resultado de la partida en cualquier storage, DB o Salón de la Fama — el estado del juego vive solo en memoria del componente durante la sesión de juego y se pierde al salir/recargar.
- Conexión con los clientes de Supabase creados en el spec 04 — este spec no los usa.
- Cambios a la entrada `rocas` existente en `GAMES` ni a ningún otro juego — queda intacta, sin relación con este spec.
- Cambios al comportamiento de `/jugar/[id]` para ids distintos de `asteroides` (siguen mostrando la arena decorativa estática tal cual está hoy).
- Guardado de configuración/preferencias del jugador (volumen, sensibilidad, remapeo de teclas).
- Sonido/efectos de audio — el juego fuente no los tiene y no se agregan en este spec.
- Leaderboard específico del juego en `/juego/asteroides` (info + leaderboard mock) — puede usar el mismo patrón mock ya existente para otros juegos, sin cambios especiales.
- Modo multijugador o comparación de puntajes en vivo.

## Modelo de datos

Este spec no agrega tipos de dominio persistentes (no hay DB ni `lib/data.ts` con nuevas entidades más allá de la entrada `asteroides` en `GAMES`, que usa el tipo `Game` ya existente). Los tipos nuevos son locales al juego y viven junto a `AsteroidsGame.tsx`:

```ts
// components/AsteroidsGame.tsx

export interface AsteroidsHudState {
  score: number;
  lives: number;
  level: number;
  tripleShotSeconds: number;   // 0 si no está activo el power-up
  phase: "playing" | "paused" | "dead" | "gameover";
}

export interface AsteroidsGameHandle {
  togglePause: () => void;
  forceGameOver: () => void;   // usado por el botón FIN tras confirmar
}

export interface AsteroidsGameProps {
  onHudChange?: (state: AsteroidsHudState) => void;
}

// Componente expuesto vía forwardRef para que la página controle
// pausa/fin desde los botones del HUD externo:
const AsteroidsGame = forwardRef<AsteroidsGameHandle, AsteroidsGameProps>(...)
```

`onHudChange` se invoca solo cuando cambia algún valor relevante (no en cada frame de `requestAnimationFrame`), para evitar renders de React innecesarios en el HUD externo. La lógica interna del motor (clases `Bullet`, `Asteroid`, `Ship`, `Particle`, `PowerUp` y el loop) es un port directo de `game.js`, encapsulada dentro del `useEffect`/clase del componente — no se expone como tipos públicos porque es implementación interna del canvas, no estado de React.

## Plan de implementación

1. **Datos del juego** — Agregar la entrada `asteroides` a `GAMES` en `lib/data.ts` (título, short/long adaptados del README fuente, cat `SHOOTER`, color `yellow`, cover `cover-asteroides`, `best`/`plays` mock). Agregar `.cover-asteroides` a `app/globals.css`. Verificable: la tarjeta aparece en Biblioteca/Home y `/juego/asteroides` muestra su detalle con el patrón mock ya existente.

2. **Motor del juego portado (`components/AsteroidsGame.tsx`)** — Port directo de `game.js` a TypeScript dentro de un client component: canvas interno fijo 800×600, clases `Bullet`/`Asteroid`/`Ship`/`Particle`/`PowerUp`, loop `requestAnimationFrame`, controles de teclado (`←` `→` `↑` `Espacio`), HUD propio dibujado en canvas (score/nivel/vidas/triple-shot) tal cual el original. Componente standalone y funcional, sin integrar todavía a `/jugar/[id]`. Verificable: renderizado en una página de prueba, el juego se juega igual que `resources/02-asteroids/index.html`.

3. **Escalado responsive** — Envolver el canvas en un contenedor que lo escale por CSS (`transform: scale` o `width/height` con `aspect-ratio: 4/3`) para llenar el `.crt-screen` disponible, manteniendo la resolución lógica interna en 800×600 (coordenadas del motor sin cambios). Verificable: el canvas se ve nítido y proporcional en distintos anchos de ventana.

4. **Integración en `/jugar/[id]`** — En `app/jugar/[id]/page.tsx`, cuando `id === "asteroides"` renderizar `<AsteroidsGame />` dentro de `.crt-screen` en vez del `.game-arena` decorativo; para cualquier otro id, sin cambios. Verificable: `/jugar/asteroides` muestra el juego jugable; `/jugar/bloque-buster` (u otro) sigue mostrando la arena estática de siempre.

5. **HUD externo sincronizado** — Convertir la página `/jugar/asteroides` (o un wrapper cliente) en Client Component para sostener `useState<AsteroidsHudState>`; pasar `onHudChange` a `AsteroidsGame` y usar esos valores en el panel `.player-hud` externo (Puntuación/Vidas/Nivel) en lugar de los valores estáticos actuales. Verificable: al jugar, el panel externo cambia en vivo junto con el HUD dibujado en el canvas, mostrando siempre los mismos números.

6. **PAUSA y overlay "PAUSADO"** — Exponer `togglePause`/`forceGameOver` vía `forwardRef` + `useImperativeHandle` en `AsteroidsGame`; conectar el botón PAUSA de la página a `togglePause()`. Cuando `phase === "paused"`, el loop deja de actualizar física/colisiones (sigue dibujando) y se muestra un overlay "PAUSADO" centrado sobre el canvas con indicación de cómo reanudar. Verificable: pausar detiene el juego y muestra el overlay; volver a presionar PAUSA reanuda exactamente donde quedó.

7. **Modal de confirmación + FIN** — Crear modal de confirmación propio (estilo arcade: pixel font, bordes neón, botones SI/NO) que se abre al presionar FIN. Confirmar llama a `forceGameOver()` (mata la nave, fuerza `state = 'gameover'`, mismo overlay que quedarse sin vidas); cancelar cierra el modal sin efecto. Verificable: FIN → modal → SI termina la partida con el overlay GAME OVER; NO/cerrar deja el juego como estaba (pausado si estaba pausado, jugando si estaba jugando).

8. **Controles táctiles** — Agregar botones fijos (◄ ► ▲ ●) visibles solo bajo el breakpoint táctil/móvil ya usado por la app, superpuestos o debajo del frame CRT. Cada botón simula el `keydown`/`keyup` correspondiente del motor (mismo mecanismo `keys`/`justPressed` que ya usa el teclado, sin duplicar lógica de input). Verificable: en viewport móvil (o emulación táctil), se puede jugar una partida completa solo con los botones on-screen; en desktop no aparecen.

9. **Atajo de teclado `P` para pausar + botón de pantalla completa** — En `AsteroidsGame.tsx`, agregar `P`/`KeyP` a la escucha de teclado: invoca el mismo `togglePause()` ya expuesto por el `ref` (sin duplicar la lógica de pausa). En `GamePlayer.tsx`, agregar un botón "PANTALLA COMPLETA" en `.hud-actions` que llama a `canvas.requestFullscreen()` sobre el elemento canvas de `AsteroidsGame` (expuesto vía el mismo `ref`/`AsteroidsGameHandle`, ej. método `requestFullscreen()`); CSS `:fullscreen`/`object-fit: contain` en `.asteroids-canvas` para que el canvas mantenga su aspect ratio 4:3 centrado (con barras negras) en vez de deformarse al llenar la pantalla completa. Verificable: presionar `P` pausa/reanuda igual que el botón PAUSA (incluyendo el overlay "PAUSADO"), tanto dentro como fuera de pantalla completa; el botón de pantalla completa hace que el canvas llene toda la pantalla sin deformarse, y `Escape` sale de pantalla completa (comportamiento nativo).

10. **Verificación end-to-end** — Jugar una partida completa en desktop (teclado) y en viewport móvil (táctil): disparar, romper asteroides grandes→medianos→pequeños, recoger power-up de triple disparo, subir de nivel, perder las 3 vidas y ver GAME OVER, reiniciar con Espacio. Probar PAUSA/reanudar y FIN con confirmación en ambos sentidos (SI/NO), el atajo `P` y pantalla completa. Confirmar que `/jugar/rocas` (u otro id) no cambió. Correr `tsc --noEmit`/`next build` sin errores.

## Criterios de aceptación

- [x] `GAMES` en `lib/data.ts` incluye una entrada `asteroides` (título "ASTEROIDES", cat `SHOOTER`, color `yellow`, cover `cover-asteroides`) visible en Biblioteca y Home igual que el resto de los juegos.
- [x] `/juego/asteroides` carga sin errores, mostrando la info del juego con el mismo patrón mock que los demás juegos.
- [x] `/jugar/asteroides` reemplaza la arena decorativa estática por el juego Asteroids real y jugable dentro del frame CRT.
- [x] `/jugar/<otro-id>` (ej. `rocas`, `bloque-buster`) no cambia respecto al comportamiento actual — sigue mostrando la arena decorativa estática.
- [x] Con teclado, `←`/`→` rotan la nave, `↑` propulsa, `Espacio` dispara — comportamiento idéntico al original (`resources/02-asteroids`).
- [x] Los asteroides grandes se parten en medianos al ser destruidos, los medianos en pequeños, y los pequeños desaparecen sin dividirse, sumando 20/50/100 puntos respectivamente.
- [x] El power-up de disparo triple aparece ocasionalmente al destruir asteroides, se puede recoger, y activa disparo triple durante su duración antes de desactivarse.
- [x] Al perder las 3 vidas se muestra el overlay "GAME OVER" con el puntaje final, y `Espacio` reinicia una partida nueva.
- [x] El panel `.player-hud` externo (Puntuación/Vidas/Nivel) se actualiza en tiempo real con los mismos valores que el HUD dibujado dentro del canvas, sin desincronizarse.
- [x] El botón PAUSA detiene el loop del juego (física/colisiones), muestra un overlay "PAUSADO" sobre el canvas, y volver a presionarlo reanuda exactamente donde quedó.
- [x] El botón FIN abre un modal de confirmación con estilo arcade (no `confirm()` nativo); confirmar termina la partida de inmediato mostrando "GAME OVER"; cancelar no tiene efecto sobre la partida en curso.
- [x] El canvas escala manteniendo aspect ratio 4:3 dentro del `.crt-screen` disponible, sin deformarse ni recortarse, en al menos tres anchos de viewport distintos (ej. 1920px, 1024px, 375px).
- [x] En viewport móvil/táctil aparecen los controles on-screen (◄ ► ▲ ●) y permiten jugar una partida completa sin teclado; en desktop no aparecen.
- [x] No hay ninguna llamada a Supabase, `localStorage`, ni ninguna otra forma de persistencia del puntaje/resultado — recargar la página reinicia el juego desde cero.
- [x] Presionar `P` pausa/reanuda el juego igual que el botón PAUSA (mismo overlay "PAUSADO"), tanto con el juego en tamaño normal como en pantalla completa.
- [x] El botón de pantalla completa hace que el canvas llene toda la pantalla del dispositivo, manteniendo el aspect ratio 4:3 sin deformarse (barras negras si hace falta); `Escape` sale de pantalla completa.
- [x] `tsc --noEmit` (o `next build`) pasa sin errores de tipos en los archivos nuevos/modificados.

## Decisiones

- **Nuevo id `asteroides` en vez de reutilizar `rocas`.** Motivo: decisión explícita del usuario — `rocas` queda como entrada mock independiente, sin relación con este juego jugable, evitando pisar contenido existente que no se pidió tocar.
- **HUD dual (canvas + panel externo sincronizado), en vez de uno solo.** Motivo: decisión explícita del usuario — se preserva el HUD original dibujado en canvas (fidelidad al arcade fuente) y además se sincroniza el panel `.player-hud` ya existente en la UI de la app, sin eliminar ninguno de los dos.
- **`onHudChange` se dispara solo en cambios de valor, no en cada frame.** Motivo: evitar 60 renders/segundo en React solo para actualizar 3-4 números; el motor de juego sigue corriendo a framerate completo de forma imperativa (canvas), desacoplado del ciclo de render de React.
- **Resolución interna fija 800×600 con escalado CSS, en vez de reescribir la lógica de coordenadas.** Motivo: mantiene intacto el balance/física del juego original (velocidades, radios, spread de disparo triple ya calibrados para 800×600); escalar visualmente vía CSS es más simple y seguro que recalcular constantes para múltiples resoluciones lógicas.
- **PAUSA y FIN funcionales, con overlay "PAUSADO" y modal de confirmación propio (no `confirm()` nativo).** Motivo: decisión explícita del usuario — consistencia con el lenguaje visual retro-arcade del resto de la app, que no usa diálogos nativos del navegador en ningún otro lugar.
- **Controles táctiles on-screen, visibles solo en viewport táctil/chico.** Motivo: decisión explícita del usuario — permite jugar en móvil sin teclado físico, sin agregar ruido visual innecesario en desktop donde el teclado ya funciona.
- **Sin persistencia de puntaje/resultado en este spec.** Motivo: decisión explícita del usuario — consistente con la filosofía de specs anteriores (ninguna feature de gameplay se conecta a Supabase todavía); se pospone a un spec futuro que además defina cómo se relaciona con el Salón de la Fama.
- **Port del motor de juego como lógica imperativa encapsulada (clases + canvas), no reescrito a estado de React por entidad.** Motivo: el patrón original (game loop con `requestAnimationFrame`, clases con `update`/`draw`) es el enfoque correcto para un juego de acción en tiempo real; modelar cada bala/asteroide/partícula como estado de React generaría re-renders masivos y complejidad innecesaria sin beneficio.
- **Tecla `P` para el atajo de pausa, en vez de `Escape`.** Motivo: decisión explícita del usuario tras la alternativa — `Escape` colisiona con el comportamiento nativo del navegador para salir de pantalla completa, que se agrega en el mismo cambio.
- **Pantalla completa aplica solo al canvas, no al frame `.crt` completo.** Motivo: decisión explícita del usuario — más inmersivo (solo el juego, sin bisel decorativo) y más simple de implementar; el HUD dibujado dentro del canvas ya es autosuficiente (score/vidas/nivel/triple-shot), y el atajo `P` cubre la necesidad de pausar sin depender del HUD externo mientras se está en pantalla completa.
- **Salir de pantalla completa usa el comportamiento nativo del navegador (`Escape`), sin botón de salida propio.** Motivo: es el patrón estándar de la Fullscreen API y evita código adicional; documentado como riesgo menor de descubribilidad más abajo.
- **Botón de pantalla completa en el HUD externo (junto a PAUSA/FIN/SALIR), no superpuesto al canvas.** Motivo: decisión explícita del usuario — consistente con el resto de acciones del reproductor, mismo lenguaje visual (`.btn`).

## Riesgos identificados

- **Desincronización entre el HUD del canvas y el panel externo de React.** Si `onHudChange` no captura algún cambio de estado (ej. transición a `gameover` durante la animación de muerte), los dos HUD podrían mostrar valores distintos momentáneamente. Mitigación: derivar `AsteroidsHudState` desde el mismo objeto de estado interno que usa el dibujo del canvas, invocando el callback en el mismo punto del loop donde se actualiza el HUD dibujado.
- **El escalado CSS del canvas puede introducir desalineación entre coordenadas de puntero y coordenadas lógicas** si en el futuro se agregan controles por mouse/touch sobre el propio canvas (no aplica a los controles táctiles de este spec, que son botones HTML separados, no gestos sobre el canvas). Mitigación: ninguna necesaria en este spec; documentado por si un spec futuro agrega input directo sobre el canvas.
- **Simular `keydown`/`keyup` desde los botones táctiles puede desincronizarse del estado `keys`/`justPressed` real** si el usuario mezcla teclado físico y botones táctiles a la vez (ej. en un dispositivo híbrido). Mitigación: los botones táctiles deben despachar los mismos eventos sintéticos que el teclado usa, reutilizando el mismo listener/estado, en vez de un canal de input paralelo.
- **El modal de confirmación de FIN debe pausar implícitamente el loop mientras está abierto**, o un asteroide podría matar la nave mientras el usuario decide, generando un "game over" inconsistente con lo que el modal preguntaba. Mitigación: abrir el modal debe pausar el motor igual que el botón PAUSA, y solo reanudarlo si el usuario cancela.
- **Motor de juego imperativo dentro de un componente React puede fugar el `requestAnimationFrame`/listeners de teclado si el componente se desmonta mientras juega** (ej. navegar a "SALIR" a mitad de partida). Mitigación: limpiar `requestAnimationFrame`, listeners de `keydown`/`keyup` y cualquier timer en el cleanup del `useEffect`, verificado explícitamente en el paso 9 (navegar fuera durante gameplay y confirmar que no quedan listeners activos ni errores en consola).
- **Descubribilidad de `Escape` para salir de pantalla completa.** Al no haber botón de salida propio, un jugador que no conozca la convención podría no saber cómo salir. Mitigación: es el comportamiento nativo estándar de la Fullscreen API en todos los navegadores modernos (igual que YouTube, Netflix, etc.); no se agrega UI adicional por decisión explícita del usuario.
- **La Fullscreen API requiere gesto explícito del usuario (click) y puede fallar/no estar disponible** en algunos navegadores o contextos (ej. iframes sin permiso, iOS Safari con limitaciones históricas en `<canvas>`). Mitigación: el botón llama a `requestFullscreen()` dentro de un `onClick` real (gesto de usuario válido) y no rompe el juego si la promesa rechaza — el juego sigue jugable en tamaño normal.
