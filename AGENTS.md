# Repository Guidelines

## Project Structure & Module Organization

This is a `pnpm` workspace for the Chinese-first Codenames dealer/game app.

- `apps/web`: React + Vite game client and UI tests.
- `apps/entry`: entry/invite launcher app.
- `apps/server`: Express + Socket.IO backend, room state, AI deck generation, and generated image cache.
- `apps/desktop`: Electron shell and packaging entrypoints.
- `packages/shared`: shared types, schemas, socket protocol contracts, and model metadata.
- `packages/game-core`: pure game rules and state-machine logic.
- `apps/web/public/fallback-image-cards`: tracked local fallback image deck assets.
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
- `corepack pnpm desktop:dist`: create platform release artifacts.

For focused work, use filters such as `corepack pnpm --filter @codenames/server test`.

## Coding Style & Naming Conventions

Use TypeScript ES modules with 2-space indentation. Prefer explicit named exports and small modules. Component files use `PascalCase` names such as `BoardRoom.tsx`; tests use `*.test.ts`.

There is no separate formatter config. Follow existing style and rely on `tsc` plus Vitest.

## Testing Guidelines

Vitest is the test runner. Current tests live in `apps/web/src/*.test.ts`, `apps/server/test/*.test.ts`, and `packages/game-core/test/*.test.ts`.

Add behavior-focused tests beside the code they cover, especially for rules, room state, deck generation, reconnect behavior, shared protocol changes, and fallback asset references. Run the narrowest relevant test first, then `corepack pnpm test` before broad merges.

Image fallback decks reference tracked files under `apps/web/public/fallback-image-cards`; if those URLs change, add or update the assets in the same patch and keep the server test that checks file existence current.

## Product Rules To Preserve

- Text mode is local-only and should not expose AI deck configuration.
- Image AI generation currently supports OpenAI image generation and Volcano Seedream 5.0 lite; Tongyi image generation and Seedream 4.x are intentionally removed.
- Image AI rooms use a two-step lobby flow: generate/preview images, confirm back to lobby, then start the game with the confirmed deck.
- Fixed-team lobby mode shows red/blue captain seats, ordinary seats, and spectator seats; new players default to ordinary seats.
- Clues are `1` to `4` Chinese characters and count must be greater than `0`.
- Image mode should not use image alt text for clue collision checks or display hidden prompt text in the UI.

## Commit & Pull Request Guidelines

Recent history uses short imperative messages, often Conventional Commit style, for example `feat: polish image mode lobby flow`. Keep commits focused and avoid unrelated generated artifacts.

Pull requests should include a concise description, commands run, screenshots or recordings for UI changes, and linked issues when available.

## Security & Configuration Tips

Do not commit secrets. Server model features may read API keys from user input or environment, but local fallback decks must work without keys.

Keep `.swp` files, `generated/qa/`, `release/`, and local reference folders out of normal commits unless explicitly requested.

## Desktop Window Guidelines

Keep the desktop player-window content area aligned with the browser entry popup. The current player viewport is `520x1040`; if this changes, update `apps/entry/src/main.js`, `apps/web/src/App.tsx`, and `apps/desktop/src/main.ts` together.

For Electron `window.open()` flows, set `overrideBrowserWindowOptions` in `setWindowOpenHandler` so child player windows keep the same content size and security options as the initial player window. Verify desktop window changes with `corepack pnpm --filter @codenames/desktop lint`, `corepack pnpm desktop:build`, and an Electron smoke check that reads `BrowserWindow.getContentBounds()`.

## Agent-Specific Instructions

When answering questions about libraries, frameworks, SDKs, APIs, CLI tools, or cloud services, fetch current docs with `ctx7` first:

1. Resolve library: `npx ctx7@latest library <name> "<question>"`
2. Fetch docs: `npx ctx7@latest docs <libraryId> "<question>"`
3. If the answer is insufficient, rerun the docs command with `--research`.

Do not use `ctx7` for business-logic debugging, code review, or general programming concepts.
