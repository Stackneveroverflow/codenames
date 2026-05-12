# Repository Guidelines

## Project Structure & Module Organization

This is a `pnpm` workspace for the Chinese-first Codenames dealer/game app.

- `apps/web`: React + Vite game client and UI tests.
- `apps/entry`: entry/invite launcher app.
- `apps/server`: Express + Socket.IO backend, room state, and deck services.
- `apps/desktop`: Electron shell and packaging entrypoints.
- `packages/shared`: shared types, schemas, and protocol contracts.
- `packages/game-core`: pure game rules and state-machine logic.
- `generated/` and `release/`: generated outputs; avoid unrelated changes.

Keep rules in `packages/game-core`, contracts in `packages/shared`, UI in `apps/web` or `apps/entry`, and transport/server behavior in `apps/server`.

## Build, Test, and Development Commands

Use `corepack pnpm` from the repository root.

- `corepack pnpm dev`: run server, web, and entry apps in parallel.
- `corepack pnpm build`: build all workspace packages.
- `corepack pnpm test`: run all Vitest suites.
- `corepack pnpm lint`: run TypeScript checks for each package.
- `corepack pnpm desktop:dev`: build required packages and launch Electron.
- `corepack pnpm desktop:pack`: create an unpacked desktop build.

For focused work, use filters such as `corepack pnpm --filter @codenames/server test`.

## Coding Style & Naming Conventions

Use TypeScript ES modules with 2-space indentation. Prefer explicit named exports and small modules. Component files use `PascalCase` names such as `BoardRoom.tsx`; tests use `*.test.ts`.

There is no separate formatter config. Follow existing style and rely on `tsc` plus Vitest.

## Testing Guidelines

Vitest is the test runner. Current tests live in `apps/web/src/*.test.ts`, `apps/server/test/*.test.ts`, and `packages/game-core/test/*.test.ts`.

Add behavior-focused tests beside the code they cover, especially for rules, room state, deck generation, reconnect behavior, and shared protocol changes. Run the narrowest relevant test first, then `corepack pnpm test` before broad merges.

## Commit & Pull Request Guidelines

Recent history uses short imperative messages, often Conventional Commit style, for example `feat: add codenames v1 workspace`. Keep commits focused and avoid unrelated generated artifacts.

Pull requests should include a concise description, commands run, screenshots or recordings for UI changes, and linked issues when available.

## Security & Configuration Tips

Do not commit secrets. Server model features may read `OPENAI_API_KEY`, but local fallback decks must work without keys.

## Agent-Specific Instructions

When answering questions about libraries, frameworks, SDKs, APIs, CLI tools, or cloud services, fetch current docs with `ctx7` first: resolve with `npx ctx7@latest library <name> "<question>"`, then fetch with `npx ctx7@latest docs <libraryId> "<question>"`.
