# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About this project

Arcade Vault (`arcade-vault`) is a Next.js 16 app for playing games online and competing on point leaderboards. It has moved past the scaffold stage: it now has real routes, a Supabase-backed data layer, a multi-game contract, and several playable games (see below).

## Critical: Next.js version

This project uses **Next.js 16.2.11**, which has breaking changes vs. older Next.js knowledge (including this model's training data). **Before writing framework-related code, read the relevant guide in `node_modules/next/dist/docs/`** rather than assuming APIs from prior Next.js versions. Notable changes already confirmed in this repo:

- Middleware has been renamed to **Proxy**: create `proxy.ts` at the project root (not `middleware.ts`), exporting a `proxy` function instead of `middleware`. See `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- Docs are organized under `node_modules/next/dist/docs/01-app/` (this project uses the App Router, not Pages Router) — check the relevant subsection (e.g. `03-api-reference/05-config/01-next-config-js/` for config options) before using any Next.js API you're not certain about in this version.

## Skills

Project-local skills live in both `.agents/skills/` and `.claude/skills/` (duplicated between the two), each defined in its own `SKILL.md`. Read that file before relying on a skill's exact behavior:

- **`frontend-design`** (`.claude/skills/frontend-design/SKILL.md`) — usa siempre `/frontend-design` para diseñar la interfaz de usuario.
- **`spec`** (`.agents/skills/spec/SKILL.md`) — interactive spec design (see Spec-driven workflow below). Never writes code.
- **`spec-impl`** (`.agents/skills/spec-impl/SKILL.md`) — implements an approved spec, one plan step at a time (see Spec-driven workflow below).
- **`spec-impl-game`** (`.claude/skills/spec-impl-game/SKILL.md`, not duplicated in `.agents/skills/`) — same four phases as `/spec-impl`, specialized for game specs: searches `specs/` recursively (so it finds `specs/game-jam/<juego>/NN-slug.md` too) and, once the plan's last step is implemented, automatically chains `skin-designer` then `mobile-designer` for the game's id — always sequentially, one `Task` call at a time, never in parallel, since both agents write to the same game files. See Adding a new playable game below.
- **`add-game`** (`.claude/skills/add-game/SKILL.md`, plus `reference.md` with the exact game contracts) — designs the spec for a new playable game, either ported from `resources/` or from a from-scratch description (see Adding a new playable game below). Never writes code.

## Agentes

Project-local subagents live in `.claude/agents/`:

- **`game-planner`** (`.claude/agents/game-planner.md`) — decides _which_ game should be added next (as opposed to `/add-game`, which decides _how_). Analyzes the current catalog (`components/games/registry.ts`, `lib/archived-games.ts`, the `games` table) and returns an argued recommendation plus discarded alternatives; never writes specs or code. Keeps a running memory of every suggestion (proposed/implemented/discarded) in `resources/game-suggestions-todo.md` so it never re-proposes something already evaluated. Flow: `game-planner` (proposes) → `/add-game` (designs the spec for the chosen game) → human review `Draft`→`Approved` → `/spec-impl` (implements).
- **`skin-designer`** (`.claude/agents/skin-designer.md`) — implements and verifies the three visual skins (`clasico`, `retro`, `neon`) for a game explicitly named by whoever invokes it; never runs on the whole catalog unprompted. Writes production code (`lib/games/skins.ts`, `components/games/SkinSelector.tsx`, per-game palettes inside `components/<Juego>Game.tsx`). Keeps coverage state in `resources/game-with-themes.md`.
- **`mobile-designer`** (`.claude/agents/mobile-designer.md`) — implements and verifies the mobile version (responsive layout + on-screen touch pad, following the `components/TouchControls.tsx` pattern from `asteroides`) for a game explicitly named by whoever invokes it; never runs on the whole catalog unprompted. Registers new `components/<Juego>TouchControls.tsx` components in `Touch:` on `GAME_REGISTRY`, and verifies the result with the Playwright MCP (mobile viewport resize + screenshots under `.playwright-screenshots/`). Keeps coverage state in `resources/game-with-mobile-version.md`.
- **`game-jam`** (`.claude/agents/game-jam.md`) — given the title or a short description of _one concrete game_, designs **2 mutually exclusive implementation alternatives of that same game** (same concept/goal, different engine/mechanics scope and effort) and writes a full spec for each under `specs/game-jam/<game-id>/NN-slug.md` in `Draft`. The user picks one to implement. Never writes code or migrations. Complements `game-planner` (what to build) and `/add-game` (how to port a chosen game).

## Herramientas MCP

Todos los screenshots generados por el MCP de Playwright deben ser almacenados en `.playwright-screenshots/`.

## Architecture

- App Router (`app/`) with TypeScript, React 19. Route groups/pages implemented so far: `app/(home)/`, `app/acerca-de/` (about/contact), `app/auth/`, `app/biblioteca/` (game library), `app/juego/[id]/` (game detail + leaderboard), `app/jugar/[id]/` (the playable game screen), `app/salon/` (hall of fame / global leaderboard).
- Styling: Tailwind CSS v4 via `@tailwindcss/postcss` (no `tailwind.config.*` — v4 is configured through `app/globals.css` / PostCSS).
- Path alias `@/*` maps to the project root (`tsconfig.json`).
- Fonts loaded via `next/font/google` (Geist Sans/Mono) in `app/layout.tsx`.
- Data layer: `lib/data.ts` and `lib/archived-games.ts` hold static/local game metadata; `lib/supabase/` (`client.ts`, `server.ts`, `queries.ts`, `actions.ts`) holds the Supabase-backed reads (`listGames`, `getGame`, `getScores`) and the `submitScore` server action. Both sources currently coexist during the migration described in `specs/06-leaderboard-y-juegos.md`.
- Games/HUD contract: `components/games/registry.ts` (`GameHudState`, `GameHandle`, `GAME_REGISTRY`) lets `components/GamePlayer.tsx` mount any registered game generically (HUD sync, PAUSA/FIN, fullscreen, and the Supabase score-saving flow are all game-agnostic) — see "Adding a new playable game" below.

### External services

- **Supabase** — primary data backend. `games` and `scores` tables (see `lib/supabase/queries.ts` for the exact shape); `lib/supabase/client.ts` is the browser client, `lib/supabase/server.ts` the server client, both configured from `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`). A Supabase MCP server is also available for schema/migration/query work directly from Claude Code. Setup documented in `specs/04-supabase-setup.md`.
- **Resend** — transactional email for the contact form (`app/acerca-de/actions.ts`, `sendContactMessage`), configured via `RESEND_API_KEY` (see `.env.example`). Sends from `onboarding@resend.dev` to the site owner's address, using the submitter's email as `replyTo`.

## Spec-driven workflow

This project follows spec-driven design via the `/spec` and `/spec-impl` skills (installed from `Klerith/fernando-skills`, defined in `.agents/skills/spec/SKILL.md` and `.agents/skills/spec-impl/SKILL.md`). Non-trivial features should go through this flow rather than being implemented ad hoc:

1. **`/spec <description>`** — interactively designs a spec: clarifying questions first, then builds the doc section by section (header, scope, data model, implementation plan, acceptance criteria, decisions, risks) using `.agents/skills/spec/template.md`. Saves to `specs/NN-slug.md` in `Draft` state. Never writes code.
2. A human reviews the spec and manually flips its state to `Approved`.
3. **`/spec-impl <NN-slug>`** — refuses to run unless the spec's state means "Approved". If approved, creates/switches to branch `spec-NN-slug` (controlled by `AutoCreateBranch` in `specs/.spec-config.yml`, default `true`), then implements the plan one step at a time, pausing for review after each step.

`specs/` currently holds, in order: `01-vistas-mvp`, `02-home-page`, `03-about-contact`, `04-supabase-setup`, `05-asteroids-jugable`, `06-leaderboard-y-juegos`, `07-tetris-jugable`, `08-bloque-buster-jugable`, `09-serpentina-jugable`. Game-jam alternatives live in their own subtree, `specs/game-jam/<game-id>/NN-slug.md`, with numbering that restarts per folder — currently `specs/game-jam/frogger/` holds `01-ranaria-jugable` (**Implementado** — shipped as the `frogger` game), `02-ranaria-rio-jugable` (`Draft`, the expanded alternative, not implemented) and `03-fix-glow-performance` (`Draft`). When picking up work in this repo, check `specs/` recursively for existing specs and their state before starting new feature work.

### Adding a new playable game

Games are wired through a shared multi-game contract: `components/games/registry.ts` (`GameHudState`, `GameHandle`, `GAME_REGISTRY`) lets `components/GamePlayer.tsx` mount any registered game generically (HUD sync, PAUSA/FIN, fullscreen, and the Supabase score-saving flow are all game-agnostic). Adding a game means implementing `components/<Game>Game.tsx` against that contract, adding its row to the `games` table in Supabase, and registering it in `GAME_REGISTRY`.

Games implemented so far (registered in `GAME_REGISTRY`):

- **`asteroides`** — `components/AsteroidsGame.tsx` + `components/TouchControls.tsx`. Lives + level HUD. 3 skins.
- **`tetris`** — `components/TetrisGame.tsx` + `components/TetrisTouchControls.tsx`. No lives, has level HUD. 3 skins.
- **`bloque-buster`** — `components/BloqueBusterGame.tsx`. Lives + level HUD. 3 skins. No `Touch:` entry yet — the paddle already responds to direct `touchmove`/`touchstart` on the canvas, but there's no on-screen button to launch the ball or pause.
- **`serpentina`** — `components/SerpentinaGame.tsx` + `components/SerpentinaTouchControls.tsx`. Lives + level HUD. 3 skins.
- **`frogger`** — `components/FroggerGame.tsx` + `components/FroggerTouchControls.tsx` (4-arrow d-pad). Lives + level HUD. 3 skins. Built from scratch (no `resources/` prototype); spec `specs/game-jam/frogger/01-ranaria-jugable.md`. Mobile version verified with Playwright.

Skin coverage (three skins per game: `clasico`, `retro`, `neon`) is tracked in `resources/game-with-themes.md`; mobile/touch coverage in `resources/game-with-mobile-version.md`. All five games above currently have the three skins implemented.

**`/add-game <resources/ folder | game description>`** — a project skill (`.agents/skills/add-game/SKILL.md`, duplicated in `.claude/skills/add-game/`) that designs the spec for a new game: it ports an existing prototype from `resources/` (e.g. `03-tetris`, `04-arkanoid`) or takes a from-scratch description, asks the adaptation questions the contract requires (aspect ratio, HUD mapping, controls, assets, `games` row metadata), and saves `specs/NN-slug.md` in `Draft` state — same house style as `/spec`. It never writes code; run `/spec-impl-game NN-slug` afterward to implement it (or plain `/spec-impl` if you deliberately want to skip the skins/mobile chaining).

Full flow for a new game: `game-planner` (proposes _which_ game to add next) → then either `/add-game` (designs a single spec for the chosen game — ports from `resources/` or from a description) or `game-jam` (designs 2 competing implementation specs of one concrete game under `specs/game-jam/<game-id>/`, user picks one) → human review flips `Draft`→`Approved` → **`/spec-impl-game NN-slug`** (implements the plan step by step, then automatically runs `skin-designer` and `mobile-designer`, in that order, for the game's id).
