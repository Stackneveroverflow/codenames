# codenames

中文优先的 Codenames Online v1 MVP。技术栈为 `pnpm` workspace + React/Vite + Node/Socket.IO。

## Workspace

- `apps/web`: 前端三屏与实时房间 UI
- `apps/server`: Socket.IO 服务端、房间 store、AI 发牌
- `packages/shared`: 共享类型、协议和 schema
- `packages/game-core`: 纯规则与状态机

## Run

```bash
corepack pnpm install
corepack pnpm --filter @codenames/server dev
corepack pnpm --filter @codenames/web dev
```

服务端默认端口 `3001`，前端默认端口 `5173`。

若要启用 AI 发牌，请设置：

```bash
export OPENAI_API_KEY=...
export OPENAI_DECK_MODEL=gpt-5.4-mini
```

未配置 API key 时，会自动回退到本地词库，保证游戏仍可开始。
