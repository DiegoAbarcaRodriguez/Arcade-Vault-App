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
