---
name: spec-impl-game
description: Implementa un spec de juego aprobado (mismo flujo que /spec-impl) y, al terminar, encadena automáticamente los agentes skin-designer y mobile-designer, en ese orden y nunca en paralelo.
disable-model-invocation: true
argument-hint: <NN-spec-name>
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(cat:*), Bash(ls:*), Bash(find:*), Task
---

# /spec-impl-game — Implementer of approved game specs

## Session context

Current repository state:
!`git status --short`

Current branch:
!`git branch --show-current`

Specs available (recursive, includes specs/game-jam/<juego>/):
!`find specs -name '*.md' -not -name 'template.md' 2>/dev/null | sort || echo "The specs/ folder does not exist"`

Branch-creation config:
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, no config file)"`

---

## Instructions

Follow these six phases in strict order. **Do not advance to the next phase if the previous one did not complete correctly.**

This skill is the game-specific sibling of `/spec-impl`: Phases 1–4 are identical in spirit (same state machine, same branch rules, same step-by-step implementation discipline). What's new is Phase 3.5 (resolve the game's id) and Phases 5–6 (chain `skin-designer` → `mobile-designer` automatically once the plan is implemented).

---

### Phase 1 — Identify the spec

The received argument is: `$ARGUMENTS`

If `$ARGUMENTS` is empty:

- List the files available under `specs/` (you already have them above, including any under `specs/game-jam/<juego>/`).
- Ask the user to specify the exact name of the spec.
- Stop and wait for an answer. Do not continue.

If `$ARGUMENTS` has a value:

- Search **recursively** under `specs/` (top level and every `specs/game-jam/<juego>/` subfolder). The user may have written the full name (`01-mvp-arkanoid`), only the number (`01`), or only the slug (`ranaria-jugable`). Try to find the correct file in any of those cases.
- If the argument matches more than one file (e.g. a `01-*` exists both at the top level and inside a `game-jam` subfolder), **do not guess** — list every candidate with its full path and ask the user to disambiguate.
- If you do not find the file, show the available specs and ask the user to correct the name.
- If you find exactly one, continue to Phase 2.

---

### Phase 2 — Validate the spec's state

Read the spec file you located in Phase 1 using the Read tool or `cat`.

In the file's contents, look for the line that contains the spec's state. The header label is typically `**Status:**` / `**Estado:**` (or equivalent in any other language), but match by position (status line near the top of the spec) and by the surrounding state machine, not by the exact label.

**Absolute rule:** You can only continue if the state **means "Approved"** — regardless of the language used.

Treat any of the following (and their equivalents in other languages) as the **Approved** state and continue:

- English: `Approved`
- Spanish: `Aprobado`
- Portuguese: `Aprovado`
- French: `Approuvé`
- German: `Genehmigt`
- Italian: `Approvato`
- …or any other language's word that clearly means "approved"

Anything else — including `Propuesto` (a state used by the `game-jam` spec template, distinct from `Draft`/`Borrador`), `In review`/`En revisión`, `Implemented`/`Implementado`, `Obsolete`/`Obsoleto`, or any unrecognized value — means **stop** and show the error message below.

| State category                            | Examples (any language)                           | Action                                                                     |
| ----------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Approved                                  | `Approved`, `Aprobado`, `Aprovado`, `Approuvé`, … | Continue to Phase 3.                                                       |
| Draft / Proposed                          | `Draft`, `Borrador`, `Propuesto`, …               | Stop. Show the error message below.                                        |
| In review                                 | `In review`, `En revisión`, …                     | Stop. Show the error message below.                                        |
| Implemented                               | `Implemented`, `Implementado`, …                  | Stop. Show the error message below.                                        |
| Obsolete                                  | `Obsolete`, `Obsoleto`, …                         | Stop. Show the error message below.                                        |
| State line not found / unrecognized value | —                                                 | Stop. The file does not follow the expected format. Tell this to the user. |

If you are unsure whether a value means "approved", **do not assume**. Stop and ask the user to clarify or to update the spec to the canonical wording.

**Standard error message when the state does not mean Approved:**

```
❌ No puedo implementar este spec.

Estado actual: [ESTADO ENCONTRADO]
Solo trabajo con specs cuyo estado significa "Aprobado" (ej. `Approved`, `Aprobado`,
o el equivalente en otro idioma).

Para continuar tenés dos opciones:
  1. Si el spec está listo para implementarse, abrilo y cambiá el estado
     a "Aprobado" (o el término equivalente que use tu equipo) manualmente.
     Ese cambio lo hace un humano, no el agente.
  2. Si el spec todavía necesita trabajo, usá /spec [nombre] o /add-game
     para retomarlo.
```

Do not offer alternatives, do not suggest "puedo arrancar igual si querés". The block is intentional.

---

### Phase 3 — Create the git branch and switch to it

Once you have confirmed the state means `Approved`:

1. Derive the branch name from the spec file's **basename**, without extension or parent folders. Format: `spec-NN-slug`. Examples:

   - `specs/01-mvp-arkanoid.md` → branch `spec-01-mvp-arkanoid`
   - `specs/game-jam/frogger/01-ranaria-jugable.md` → branch `spec-01-ranaria-jugable`

2. Read the `AutoCreateBranch` flag from the **Branch-creation config** shown in the session context above.

   - If the config file does not exist, the value is missing, or the value is unrecognized → treat it as `true` (the default).
   - Only an explicit `false` (in any capitalization) disables automatic branch creation.

   **If `AutoCreateBranch` is `true` (default):** proceed without asking.

   - If the branch **does not exist**: create it with `git checkout -b spec-NN-slug`.
   - If it **already exists**: inform the user that the branch already existed (it may mean previous work is being resumed).
   - In both cases: switch to the branch with `git checkout spec-NN-slug` and confirm the change was successful before continuing.

   **If `AutoCreateBranch` is `false`:** ask before touching git. Show:

   ```
   AutoCreateBranch está en false.
   ¿Crear y cambiar a la rama spec-NN-slug? [y/N]
   ```

   - If the user answers **yes**: create/switch to the branch exactly as in the `true` case above.
   - If the user answers **no** or leaves it empty: **do not create any branch.** Tell the user you will implement on the current branch (the one shown in the session context above) and ask for explicit confirmation to continue there. Do not improvise — wait for the answer.

3. Visually confirm to the user the spec is ready and which branch is active:

   ```
   ✅ Listo para implementar.

   Spec:   <ruta completa del spec>
   Rama:   spec-NN-slug  (activa)   (← o la rama actual, si no se creó una nueva)
   Estado: Aprobado   (← eco del valor real encontrado en el spec)
   ```

4. **Do not start implementing yet.** First show the spec summary to the user so they have it fresh. Extract and show:
   - The **objective** (the line after `**Objective:**` / `**Objetivo:**` / equivalent label).
   - The **scope** (the `## Scope` / `## Alcance` / equivalent section).
   - The **implementation plan** (the section with the numbered steps).
   - The **acceptance criteria** (the checklist).

Match section headings by meaning, not by exact wording — the spec may be authored in any language.

---

### Phase 3.5 — Resolve the game's `id`

This is the phase that doesn't exist in `/spec-impl`: this skill needs to know which `GAME_REGISTRY` id it will hand off to `skin-designer` and `mobile-designer` in Phase 5, so resolve it now, before writing any code.

1. Look for an explicit id in the spec, in this order of confidence:
   - The objective line often states it directly (e.g. "con ID `frogger`").
   - The **Data model** section's `INSERT INTO games (id, …) VALUES ('<id>', …)` is the most authoritative source when present.
2. If no explicit id is found, derive it from the spec's slug (e.g. `09-serpentina-jugable` → `serpentina`), stripping ordinal prefixes and suffixes like `-jugable`.
3. Show the detected id together with the Phase 3 confirmation block, e.g. `Game id: frogger`. Ask for explicit confirmation **only** if the id could not be determined with confidence (no explicit id in the spec AND the slug is ambiguous) — if the spec states it clearly, do not ask, just state it.
4. Keep this `gameId` for Phases 5 and 6.

---

### Phase 4 — Implement step by step

After showing the spec summary, tell the user:

```
Voy a implementar el spec siguiendo el plan de implementación al pie de la letra.
Voy a pausar después de cada paso para que puedas revisar el diff.

¿Arrancamos con el Paso 1?
```

Wait for explicit confirmation ("sí", "dale", "adelante", or equivalent). Do not start without it.

Once confirmed, follow these rules during the entire implementation:

**One rule above all:** implement what the spec says. If something in the spec looks suboptimal to you, mention it as an observation but implement what was agreed. Changes to the spec go into the spec, not into the code by surprise.

**Work rhythm:**

- Implement one step of the plan.
- Show a summary of which files you touched and what you did.
- Say: `Paso N completado. ¿Podés revisar el diff y decirme si sigo con el Paso N+1?`
- Wait for confirmation before continuing.

**If during the implementation you find an ambiguity** the spec does not resolve:

- Stop.
- Describe the ambiguity exactly.
- Present two or three concrete options.
- Wait for the user's decision.
- Do not improvise.

**If the user asks for something that is out of the spec's scope:**

- Remind them that it is out of this spec's scope.
- Suggest noting it down for the next spec.
- Do not implement it on this branch.

**When finishing the last step of the plan:**

1. Before announcing anything, **reread `components/games/registry.ts`** and confirm the `gameId` resolved in Phase 3.5 exists as a real entry. If the plan's last step was supposed to add it and it's missing, stop here — report it as an unfinished plan step and do not proceed to Phase 5 (the agents below require a real registry entry to point at).
2. If the id is confirmed in the registry, announce the transition to the polish phase:

```
✅ Todos los pasos del plan están implementados.

Ahora encadeno la fase de pulido, en orden secuencial (nunca en paralelo):
  1. skin-designer   → skins clasico / retro / neon de `<gameId>`
  2. mobile-designer → layout responsive + pad táctil de `<gameId>`
```

Then continue immediately to Phase 5 — this phase does not require additional user confirmation, per the agreed behavior of this skill (unlike `/spec-impl`, which stops here).

---

### Phase 5 — Chain the polish agents, sequentially

**Regla dura, sin excepciones:** nunca lances `skin-designer` y `mobile-designer` en el mismo mensaje ni en paralelo. Ambos son agentes de escritura que tocan `components/<Juego>Game.tsx`, `components/games/registry.ts` y potencialmente `app/globals.css`; correrlos a la vez puede hacer que uno pise los cambios del otro a mitad de escritura. Una sola llamada `Task` por turno, y la segunda solo después de haber leído el reporte final de la primera.

1. **`skin-designer` primero.** Invocá el agente `skin-designer` (una única llamada `Task`) con un prompt que nombre el id explícitamente, por ejemplo:

   > Implementá los tres skins (`clasico`, `retro`, `neon`) del juego `<gameId>`, recién implementado desde `<ruta del spec>`.

   `skin-designer` rechaza pedidos sin un id concreto, así que el id siempre va explícito.

2. Esperá a que termine. Resumile al usuario, en español, su reporte: archivos tocados/creados, las tres paletas y el razonamiento de contraste, y el estado que dejó en `resources/game-with-themes.md`.

3. **Si `skin-designer` falló o dejó el trabajo incompleto:** no lances `mobile-designer`. Informá al usuario el estado real y esperá su decisión — encadenar el siguiente agente sobre una base a medio terminar solo multiplica el riesgo de conflicto de archivos.

4. **`mobile-designer` después**, solo si el paso anterior salió bien. Invocalo (otra única llamada `Task`, en un turno separado de la anterior) con el mismo id explícito, por ejemplo:

   > Implementá y verificá la versión móvil (layout responsive + pad táctil) del juego `<gameId>`.

   Nota para vos: este agente necesita un dev server corriendo para verificar con Playwright; si no hay uno, puede levantarlo él mismo en background. Guarda screenshots en `.playwright-screenshots/`.

5. Resumile al usuario, en español, su reporte: mapeo acción→botón o input directo, viewports verificados, ruta de los screenshots, y el estado que dejó en `resources/game-with-mobile-version.md`.

**Por qué este orden y no al revés:** los skins agregan el `SkinSelector` al HUD del juego. `mobile-designer` necesita ver ese HUD ya en su forma final para verificar en viewport móvil que el selector de skin y el pad táctil no se superponen (el proyecto ya tiene una regla `.game-skin-panel` dentro del `@media (max-width: 840px)` pensada justamente para esa convivencia).

---

### Phase 6 — Close out

Once both agents have reported (or Phase 5 stopped early because `skin-designer` failed — in that case, close out with the partial state instead):

```
✅ Juego `<gameId>` implementado, con skins y versión móvil.

  Spec:    <ruta del spec>
  Rama:    spec-NN-slug
  Skins:   <resumen de una línea del reporte de skin-designer>
  Mobile:  <resumen de una línea del reporte de mobile-designer>

Próximo paso: verificar los criterios de aceptación del spec uno por uno.
Si pasan todos, cambiá el estado del spec a "Implementado" (o el equivalente
en el idioma de tu repo) y hacé el commit final antes de mergear esta rama.
```

---

## Summary of expected behavior

```
/spec-impl-game 01-ranaria-jugable

  Fase 1  →  Encuentra specs/game-jam/frogger/01-ranaria-jugable.md
  Fase 2  →  Lee el estado → "Propuesto" → ❌ corta
             Muestra el mensaje de error estándar
             No crea rama, no toca código, no lanza agentes

/spec-impl-game 09-serpentina-jugable  (estado: Aprobado)

  Fase 1    →  Encuentra specs/09-serpentina-jugable.md
  Fase 2    →  Lee el estado → "Aprobado" → ✅ continúa
  Fase 3    →  git checkout -b spec-09-serpentina-jugable
               Muestra objetivo, alcance, plan y criterios
  Fase 3.5  →  Resuelve gameId = "serpentina" desde el spec
  Fase 4    →  Implementa paso a paso con pausas
               Al terminar el último paso, confirma que "serpentina"
               existe en GAME_REGISTRY y anuncia la Fase 5
  Fase 5    →  Task → skin-designer("serpentina")   (una sola llamada, espera reporte)
               Task → mobile-designer("serpentina")  (llamada separada, después de leer el reporte anterior)
  Fase 6    →  Resume todo y recuerda verificar los criterios de aceptación
```

**Branch creation is controlled by the `AutoCreateBranch` flag** in `specs/.spec-config.yml`, exactly like in `/spec-impl`. It defaults to `true`.

**Diferencia clave con `/spec-impl`:** esta skill nunca se detiene a pedir confirmación antes de lanzar la fase de agentes — al completar el último paso del plan, encadena `skin-designer` y luego `mobile-designer` automáticamente, siempre en ese orden y siempre en llamadas `Task` separadas (nunca en paralelo).
