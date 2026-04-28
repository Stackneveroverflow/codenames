# Repository Guidelines

## Project Structure & Module Organization

This repository is a `pnpm` workspace for a Chinese-first Codenames Online MVP.

- `apps/web`: React + Vite client
- `apps/server`: Express + Socket.IO backend
- `packages/shared`: shared types, schema, and protocol helpers
- `packages/game-core`: pure game rules and state machine logic
- `packages/*/test`: Vitest tests

Keep game logic in `packages/game-core` or `packages/shared`; keep UI-only code in `apps/web` and transport code in `apps/server`.

## Build, Test, and Development Commands

Use `corepack pnpm` from the repo root.

- `corepack pnpm install`: install workspace dependencies
- `corepack pnpm dev`: run web and server in parallel
- `corepack pnpm build`: build all workspace packages
- `corepack pnpm test`: run all tests with Vitest
- `corepack pnpm lint`: type-check each workspace

For package-specific work, use `corepack pnpm --filter @codenames/server test` or similar.

## Coding Style & Naming Conventions

Use TypeScript with ES modules and 2-space indentation. Prefer small, focused modules and explicit named exports.

- Component files use `PascalCase` names, for example `Board.tsx`
- Test files use `*.test.ts`
- Package names follow `@codenames/*`
- Keep shared contracts in `packages/shared` instead of duplicating types

There is no formatter or linter config beyond TypeScript checks, so rely on `tsc` and Vitest to catch regressions.

## Testing Guidelines

Vitest is the test runner. Existing tests live in:

- `apps/server/test/*.test.ts`
- `packages/game-core/test/*.test.ts`

Add tests alongside the code they cover. Prefer behavior-focused tests for game rules, room state, and deck generation. Run the narrowest relevant test command first, then `corepack pnpm test` before merging.

## Commit & Pull Request Guidelines

Commit history uses short Conventional Commit-style messages, such as `feat: add codenames v1 workspace`.

Pull requests should include:

- a brief description of the change
- testing notes or commands run
- screenshots or screen recordings for UI changes
- links to related issues when applicable

## Security & Configuration Tips

Do not commit secrets. The server can use `OPENAI_API_KEY` and `OPENAI_DECK_MODEL`, but it falls back to a local word list when the key is absent. Keep generated logs and local run artifacts out of version control.
