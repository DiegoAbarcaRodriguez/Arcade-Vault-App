# SPEC — Frogger: eliminar stutter de GC causado por shadowBlur en el glow de la rana

> **Estado:** Draft
> **Depende de:** specs/game-jam/frogger/01-ranaria-jugable.md
> **Fecha:** 2026-08-25
> **Objetivo:** Eliminar las ráfagas de frames perdidos (medidas: 6–30 frames, 33–100ms, cada ~15s) que sufre Frogger en los skins `retro`/`neon` cacheando el glow de la rana en un canvas offscreen en vez de activar `ctx.shadowBlur` en cada frame del loop principal, y de paso limpiar el único punto de re-render evitable en `FroggerGame.tsx`.

**Nota sobre el segundo objetivo:** se revisó `FroggerGame.tsx` completo — tiene un solo `useState` (`skin`), necesario porque controla el `<select>` del `SkinSelector`; no se puede pasar a `useRef` sin romper el control del input. El único ajuste real disponible es agregarle el array de dependencias `[skin]` a `useImperativeHandle` (hoy corre sin deps, se recrea en cada render aunque `ref.current` casi nunca cambia). Es una mejora de higiene, no de performance medible. `GamePlayer.tsx` (que sí tiene 7 `useState`) queda fuera de este spec por decisión explícita.

**Contexto que justifica el objetivo** (validado con profiling real vía Playwright en la sesión de diseño de este spec, no es especulación):

- Con `clasico` (`frogGlowBlur = 0`): 0 frames con delta > 25ms en 17s de juego real (con muertes y transiciones de ronda incluidas).
- Con `neon` (`frogGlowBlur = 12`, mismo tipo de sesión): 34 frames con delta > 25ms, agrupados en ráfagas cada ~15s, con picos de hasta 100ms.
- Se descartaron con datos: re-renders de React (~3 commits/s en ambos casos, estable) y el propio evento de cambio de skin (frame limpio de 16.7ms en el momento del switch).
- Causa: `ctx.shadowBlur` fuerza al rasterizador del canvas a asignar una superficie offscreen de blur en cada draw call que lo usa; en Frogger esto corre 60 veces por segundo (una vez por frame, sobre la rana) durante toda la partida, generando basura transitoria suficiente para disparar pausas periódicas de GC.

---

## Scope

**In:**

- Cachear el glow de la rana (`shadowBlur`/`shadowColor` detrás del cuerpo) en un `<canvas>` offscreen por skin, generado una sola vez (no en el loop de render), y reemplazar el `shadowBlur` en caliente de `drawFrog()` por un `ctx.drawImage()` del sprite cacheado.
- El cuerpo, ojos y patas de la rana se siguen dibujando en vivo con primitivas canvas (fillStyle/strokeStyle, sin shadowBlur) sobre el glow cacheado, para no perder la animación de salto (lift, patas extendidas).
- Regenerar el sprite de glow cacheado cuando cambia el skin activo (los 3 skins tienen `frogGlowBlur`/`frogGlow` distintos; `clasico` tiene `frogGlowBlur: 0` → no genera sprite, se salta el `drawImage`).
- Agregar el array de dependencias `[skin]` a `useImperativeHandle` en `FroggerGame.tsx` (hoy corre sin deps).
- Verificación de la mejora con el mismo método de profiling ya validado en esta sesión (contador de frames vía `requestAnimationFrame` + deltas, corrido con Playwright): sesión de control en `neon` de ~17s con muertes/transiciones de ronda incluidas, antes y después del fix.

**Fuera de alcance:**

- Los otros 4 juegos (Asteroids, Tetris, Serpentina, Bloque Buster) — mismo patrón de `shadowBlur` sospechado, pero se cubre en specs separados.
- `GamePlayer.tsx` y su reducción de `useState` (`hud`, `confirmingEnd`, `scoreName`, etc.) — es código compartido por los 5 juegos; queda fuera de este spec (candidato a spec propio si se decide más adelante).
- Cualquier cambio visual al glow (radio, color, intensidad) — el sprite cacheado debe verse pixel-a-pixel igual al `shadowBlur` en vivo actual, no es un rediseño.
- Profiling en dispositivos móviles reales o CPU throttling — la verificación se hace en el mismo entorno (Chromium desktop vía Playwright) que ya reprodujo el problema.
- Optimizaciones adicionales de canvas fuera del glow de la rana (p. ej. batching de `drawEntities`, offscreen caching de carriles) — no hay evidencia de que aporten con los datos medidos hasta ahora.

---

## Data model

### Cache de sprites de glow (nueva estructura interna, no exportada)

Vive dentro del mismo `useEffect` del motor en `FroggerGame.tsx`, junto al resto del estado mutable (`score`, `lives`, `lanes`, etc.) — no es un `useState` ni un `useRef` de React, es una variable de closure más, coherente con el resto del motor.

```ts
// Sprite offscreen del glow de la rana, cacheado por skin. `null` cuando el
// skin activo tiene frogGlowBlur = 0 (clasico) — no hace falta canvas ni
// drawImage en ese caso.
const glowSpriteCache = new Map<Skin, HTMLCanvasElement | null>();

// Tamaño fijo del sprite: cubre la elipse del cuerpo (28×24) más el radio
// de blur máximo entre los 3 skins (12px en retro/neon) con margen.
const GLOW_SPRITE_SIZE = 64; // px, cuadrado
```

### Función de construcción del sprite (nueva, interna a `FroggerGame.tsx`)

```ts
function buildGlowSprite(palette: FroggerPalette): HTMLCanvasElement | null {
  if (palette.frogGlowBlur <= 0) return null;
  const off = document.createElement("canvas");
  off.width = GLOW_SPRITE_SIZE;
  off.height = GLOW_SPRITE_SIZE;
  const octx = off.getContext("2d")!;
  const cx = GLOW_SPRITE_SIZE / 2;
  const cy = GLOW_SPRITE_SIZE / 2;
  octx.shadowBlur = palette.frogGlowBlur;
  octx.shadowColor = palette.frogGlow;
  octx.fillStyle = palette.frogGlow;
  octx.beginPath();
  octx.ellipse(cx, cy, 14, 12, 0, 0, Math.PI * 2);
  octx.fill();
  return off;
}
```

`shadowBlur` se sigue usando acá — pero **una sola vez por skin**, no una vez por frame. Es exactamente el mismo costo de rasterizado que hoy paga cada frame, movido a un evento infrecuente (carga inicial + cambio de skin).

No se introducen tipos nuevos en `registry.ts`, `lib/games/skins.ts` ni ninguna tabla de Supabase — todo el cambio es interno a `FroggerGame.tsx`.

---

## Implementation plan

1. **Agregar la cache de sprites y `buildGlowSprite()`** dentro del `useEffect` del motor en `FroggerGame.tsx` (junto a las demás variables mutables del closure, antes de `initGame()`):
   - Declarar `glowSpriteCache` y `GLOW_SPRITE_SIZE` como en el data model.
   - Implementar `buildGlowSprite(palette)`.
   - Función `getGlowSprite(skinValue: Skin): HTMLCanvasElement | null` que lee de `glowSpriteCache`, y si no existe la entrada para ese skin, la construye con `buildGlowSprite(SKINS[skinValue])` y la guarda antes de devolverla.
     Verificación: `npm run build` sigue sin errores de TypeScript (función sin uso todavía, no rompe nada).

2. **Poblar la cache cuando cambia el skin** — en el `useEffect` existente que sincroniza `paletteRef.current`/`skinRef.current` al cambiar `skin` (línea ~339-342), agregar la llamada a `getGlowSprite(skin)` para pre-construir el sprite ANTES de que `drawFrog()` lo necesite en el próximo frame (evita un frame con glow faltante o un `buildGlowSprite` ejecutado a destiempo dentro del loop).
   Verificación: cambiar de skin en el `<select>` sigue sin re-montar el juego ni reiniciar la partida (mismo comportamiento actual).

3. **Reescribir `drawFrog()`** para usar el sprite cacheado en vez de `ctx.shadowBlur`/`ctx.shadowColor` en caliente:
   - Calcular `px`, `py` igual que hoy (posición interpolada durante el salto).
   - Si `getGlowSprite(skinRef.current)` no es `null`: `ctx.drawImage(sprite, px - GLOW_SPRITE_SIZE / 2, py - GLOW_SPRITE_SIZE / 2)` antes de dibujar el cuerpo.
   - Eliminar las líneas `ctx.shadowBlur = palette.frogGlowBlur` / `ctx.shadowColor = palette.frogGlow` / `ctx.shadowBlur = 0` — el cuerpo, patas y ojos se dibujan igual que hoy pero sin tocar `shadowBlur` en ningún punto del loop principal.
     Verificación visual: capturar screenshot de la rana en `neon` antes y después del cambio (Playwright) — debe verse pixel-a-pixel equivalente (mismo radio/color de glow, ahora como sprite en vez de blur en vivo).

4. **Agregar `[skin]` como dependencias de `useImperativeHandle`** (línea ~325-330) — cambio de higiene, no afecta el loop del juego ni requiere verificación de performance, solo que `setSkin` siga funcionando desde el HUD externo (`GamePlayer`).

5. **Verificación de performance (antes/después)** — repetir la metodología ya validada en esta sesión con Playwright:
   - Instrumentar `requestAnimationFrame` para registrar deltas entre frames + `PerformanceObserver` para long tasks.
   - Sesión de control: skin `neon`, ~17s de juego real con al menos una muerte y una transición de ronda (mismas condiciones que la medición original de este spec).
   - Criterio: 0 (o near-0) frames con delta > 25ms, igual que el resultado ya medido en `clasico` — confirma que el fix lleva a `neon` al mismo perfil que `clasico`.
     Verificación: los números quedan documentados en el resultado de este paso (no hace falta un script permanente en el repo — es profiling manual de verificación, no un test automatizado).

6. **Verificación final** — `npm run build` termina sin errores de TypeScript. La ruta `/jugar/frogger` sigue cargando y jugándose igual que antes (mismo comportamiento de vidas, puntaje, nivel, pausa, game over, guardado de score) en los 3 skins.

---

## Acceptance criteria

- [ ] `FroggerGame.tsx` define `glowSpriteCache`, `GLOW_SPRITE_SIZE` y `buildGlowSprite()` dentro del closure del motor.
- [ ] `getGlowSprite(skin)` devuelve `null` para `clasico` (sin construir canvas ni llamar `shadowBlur`) y un `HTMLCanvasElement` cacheado para `retro`/`neon`.
- [ ] Cambiar de skin desde el `<select>` del HUD pre-construye el sprite del nuevo skin antes del siguiente frame dibujado (sin frame con glow faltante).
- [ ] `drawFrog()` ya no contiene ninguna asignación a `ctx.shadowBlur` ni `ctx.shadowColor`.
- [ ] En `neon`/`retro`, el glow de la rana se ve visualmente equivalente al comportamiento anterior (mismo radio, mismo color) — confirmado por comparación de screenshots antes/después.
- [ ] En `clasico`, la rana se sigue viendo sin ningún glow (comportamiento sin cambios).
- [ ] La animación de salto (lift, patas extendidas) de la rana sigue funcionando igual que antes en los 3 skins.
- [ ] `useImperativeHandle` en `FroggerGame.tsx` tiene `[skin]` como array de dependencias.
- [ ] El HUD externo (`GamePlayer`) sigue pudiendo cambiar el skin de Frogger vía `setSkin` sin romper la partida en curso.
- [ ] Profiling de control (skin `neon`, ~17s, con al menos una muerte y una transición de ronda) muestra 0 (o near-0) frames con delta > 25ms — mismo perfil que `clasico` medía antes del fix.
- [ ] El resto de la mecánica de Frogger (score, vidas, nivel, pausa, game over, guardado de score en Supabase) funciona sin cambios en los 3 skins.
- [ ] `npm run build` completa sin errores de TypeScript.
- [ ] Ninguna ruta existente devuelve 500.

---

## Decisions

- **Sí: Cachear el glow en un canvas offscreen por skin, en vez de eliminar el efecto** — mantiene el `shadowBlur` como técnica (es correcta para lograr el look), pero lo saca del hot path (60 veces/segundo) y lo deja en un evento infrecuente (carga inicial + cambio de skin). Razón: cero pérdida visual, y el fix ataca la causa raíz medida (asignación de superficie de blur por frame → basura transitoria → pausas de GC), no un síntoma.

- **Sí: El cuerpo/ojos/patas de la rana se siguen dibujando en vivo, solo el glow se cachea** — porque el cuerpo necesita reflejar la animación de salto (interpolación de posición, lift, patas extendidas) frame a frame; cachear el sprite completo de la rana requeriría un sprite por cada frame de animación posible, mucho más complejo sin beneficio adicional (el cuerpo sin `shadowBlur` ya es barato de dibujar).

- **Sí: Verificar con la misma metodología de profiling (rAF deltas + PerformanceObserver vía Playwright) que ya reprodujo el problema en esta sesión** — es la única metodología que mostró la diferencia real entre `clasico` y `neon` (0 vs 34 frames con delta > 25ms); usar la misma metodología antes/después da una comparación directa y ya validada, en vez de introducir un método nuevo sin historial de haber detectado el problema.

- **Sí: Agregar `[skin]` a `useImperativeHandle`** — corrección de higiene de bajo impacto (evita recrear el objeto de controles en cada render), incluida porque el usuario pidió explícitamente reducir puntos de re-render evitables, aunque no se mide un impacto de performance por separado.

- **No: Reducir los `useState` de `FroggerGame.tsx`** — el único `useState` (`skin`) controla el valor del `<select>` del `SkinSelector`; pasarlo a `useRef` rompería el patrón de input controlado de React (el select dejaría de reflejar el valor actual sin un re-render). Se descarta por decisión explícita del usuario tras confirmar que no hay otro `useState` en el archivo.

- **No: Tocar `GamePlayer.tsx`** — tiene 7 `useState` y sí sería un candidato real a reducir, pero es código compartido por los 5 juegos; se deja fuera de este spec (enfocado solo en Frogger) por decisión explícita del usuario. Queda como candidato a spec propio si se decide más adelante.

- **No: Aplicar el mismo fix a Asteroids/Tetris/Serpentina/Bloque Buster en este spec** — comparten el mismo patrón de `shadowBlur` (sospechado, no medido todavía) pero se dejan fuera por decisión de alcance ya tomada ("solo Frogger ahora"); cada uno probablemente necesita su propia medición porque aplican `shadowBlur` a múltiples entidades por frame (asteroides, segmentos de serpiente, bloques), no a una sola figura como en Frogger.

- **No: Cambiar el look visual del glow (radio, color, intensidad)** — el objetivo es igualar el rendimiento de `clasico` sin alterar lo que ya construyó `skin-designer`; cualquier ajuste visual queda fuera de este spec.

- **No: Profiling en dispositivo móvil real o con CPU throttling** — el problema ya se reprodujo y se puede verificar en el mismo entorno (Chromium desktop vía Playwright); agregar un entorno de verificación distinto no aporta certeza adicional sobre si este fix específico funciona.

---

## Identified risks

- **Desalineación del sprite cacheado con la posición animada de la rana** — si `GLOW_SPRITE_SIZE`/el centrado del `drawImage` no coincide exactamente con el centro usado en `ctx.ellipse` del cuerpo, el glow podría verse corrido durante el salto. Mitigación: el sprite se construye centrado en `(GLOW_SPRITE_SIZE/2, GLOW_SPRITE_SIZE/2)` y se dibuja restando `GLOW_SPRITE_SIZE/2` a `px`/`py`, igual que el offset ya usado hoy en `ctx.ellipse(px, py, ...)` — mismo sistema de coordenadas, se verifica visualmente en el paso 3 del plan.

- **El profiling de verificación no es un test automatizado del repo** — depende de correr el script manualmente con Playwright en cada verificación; si en el futuro se reintroduce `shadowBlur` en el hot path por error, nada lo detecta automáticamente. Mitigación: fuera de alcance de este spec (agregar un test de regresión de performance sería su propio spec); se acepta el riesgo porque el objetivo acá es resolver el problema medido, no prevenir reintroducciones futuras.
