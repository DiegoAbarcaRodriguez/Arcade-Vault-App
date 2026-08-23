# Cobertura de versión móvil por juego

Memoria persistente de `mobile-designer`. Un juego pasa a "Completo" cuando
tiene pad táctil funcional (o el input directo que le corresponda), layout
responsive verificado y una corrida de Playwright que lo confirma en un
viewport móvil real.

| Juego         | Pad táctil                       | Layout responsive | Verificado (Playwright) | Última corrida | Notas                                                                                                                                                                                                                                                                                              |
| ------------- | -------------------------------- | ----------------- | ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| asteroides    | ✅ `TouchControls.tsx`           | ✅                | ⏳                      | —              | Implementación de referencia del patrón "pad vía teclado sintético": `.touch-group` en fila (◄ ▲ ►) + `.touch-btn.fire` (●). Código y CSS existentes leídos en la corrida que sembró esta bitácora (2026-08-23); falta la pasada de verificación con Playwright.                                   |
| tetris        | ✅ `TetrisTouchControls.tsx`     | ⏳                | ⏳                      | —              | Dos `.touch-group` (◄ ▼ ► / ↻ ⤓ hard drop). Arena de 2 canvas (`.tetris-arena`): el panel lateral de 200px no tiene regla móvil propia — revisar legibilidad a ~390px de ancho. Falta verificación con Playwright.                                                                                 |
| serpentina    | ✅ `SerpentinaTouchControls.tsx` | ✅                | ⏳                      | —              | Usa `.touch-group.dpad` (cruz de 4 botones en grid, `gap: 6px` — justo para el pulgar, revisar en la próxima corrida). Falta verificación con Playwright.                                                                                                                                          |
| bloque-buster | ⚠️ parcial                       | ⏳                | ⏳                      | —              | **Sin entrada `Touch:` en `registry.ts`.** El paddle ya se mueve con `touchmove`/`touchstart` directo sobre el canvas (patrón "input analógico", dentro de `BloqueBusterGame.tsx`), pero no hay botón on-screen para lanzar la bola ni para pausar. Candidato prioritario para la próxima corrida. |

## Leyenda

- **Pad táctil**: ✅ implementado y registrado en `registry.ts` · ⚠️ parcial (input directo existe pero falta alguna acción) · ❌ inexistente · ⏳ no evaluado en esta corrida.
- **Layout responsive**: ✅ revisado y sin problemas conocidos a ~390px · ⚠️ funciona con salvedades anotadas en Notas · ⏳ no evaluado.
- **Verificado (Playwright)**: ✅ corrida real en viewport móvil con screenshots en `.playwright-screenshots/` · ⏳ pendiente.
