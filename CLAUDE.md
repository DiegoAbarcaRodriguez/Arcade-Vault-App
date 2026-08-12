# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About this project

Arcade Vault (`arcade-vault`) is a Next.js 16 app for playing games online and competing on point leaderboards. It is currently a fresh `create-next-app` scaffold — no game features, routes, or data layer have been built yet.

## Critical: Next.js version

This project uses **Next.js 16.2.11**, which has breaking changes vs. older Next.js knowledge (including this model's training data). **Before writing framework-related code, read the relevant guide in `node_modules/next/dist/docs/`** rather than assuming APIs from prior Next.js versions. Notable changes already confirmed in this repo:

- Middleware has been renamed to **Proxy**: create `proxy.ts` at the project root (not `middleware.ts`), exporting a `proxy` function instead of `middleware`. See `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- Docs are organized under `node_modules/next/dist/docs/01-app/` (this project uses the App Router, not Pages Router) — check the relevant subsection (e.g. `03-api-reference/05-config/01-next-config-js/` for config options) before using any Next.js API you're not certain about in this version.

## Skills

Usa siempre /frontend-design para disenar la interfaz de usuario.

## Herramientas MCP

Todos los screenshots generados por el MCP de Playwright deben ser almacenados en `.playwright-screenshots/`.

## Architecture

- App Router (`app/`) with TypeScript, React 19.
- Styling: Tailwind CSS v4 via `@tailwindcss/postcss` (no `tailwind.config.*` — v4 is configured through `app/globals.css` / PostCSS).
- Path alias `@/*` maps to the project root (`tsconfig.json`).
- Fonts loaded via `next/font/google` (Geist Sans/Mono) in `app/layout.tsx`.

## Spec-driven workflow

This project follows spec-driven design via the `/spec` and `/spec-impl` skills (installed from `Klerith/fernando-skills`, defined in `.agents/skills/spec/SKILL.md` and `.agents/skills/spec-impl/SKILL.md`). Non-trivial features should go through this flow rather than being implemented ad hoc:

1. **`/spec <description>`** — interactively designs a spec: clarifying questions first, then builds the doc section by section (header, scope, data model, implementation plan, acceptance criteria, decisions, risks) using `.agents/skills/spec/template.md`. Saves to `specs/NN-slug.md` in `Draft` state. Never writes code.
2. A human reviews the spec and manually flips its state to `Approved`.
3. **`/spec-impl <NN-slug>`** — refuses to run unless the spec's state means "Approved". If approved, creates/switches to branch `spec-NN-slug` (controlled by `AutoCreateBranch` in `specs/.spec-config.yml`, default `true`), then implements the plan one step at a time, pausing for review after each step.

The `specs/` directory does not exist yet — it will be created the first time `/spec` saves a spec. When picking up work in this repo, check `specs/` for existing specs and their state before starting new feature work.

### Adding a new playable game

Games are wired through a shared multi-game contract: `components/games/registry.ts` (`GameHudState`, `GameHandle`, `GAME_REGISTRY`) lets `components/GamePlayer.tsx` mount any registered game generically (HUD sync, PAUSA/FIN, fullscreen, and the Supabase score-saving flow are all game-agnostic). Adding a game means implementing `components/<Game>Game.tsx` against that contract, adding its row to the `games` table in Supabase, and registering it in `GAME_REGISTRY`.

**`/add-game <resources/ folder | game description>`** — a project skill (`.agents/skills/add-game/SKILL.md`, duplicated in `.claude/skills/add-game/`) that designs the spec for a new game: it ports an existing prototype from `resources/` (e.g. `03-tetris`, `04-arkanoid`) or takes a from-scratch description, asks the adaptation questions the contract requires (aspect ratio, HUD mapping, controls, assets, `games` row metadata), and saves `specs/NN-slug.md` in `Draft` state — same house style as `/spec`. It never writes code; run `/spec-impl NN-slug` afterward to implement it. See `.agents/skills/add-game/reference.md` for the exact contracts and file patterns it relies on.
