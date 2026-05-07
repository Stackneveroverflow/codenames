# codenames

中文优先的 Codenames Online v1 MVP。技术栈为 `pnpm` workspace + React/Vite + Node/Socket.IO。

## Workspace

- `apps/web`: 前端三屏与实时房间 UI
- `apps/server`: Socket.IO 服务端、房间 store、AI 发牌
- `apps/desktop`: Electron 桌面宿主，房主本机托管服务
- `packages/shared`: 共享类型、协议和 schema
- `packages/game-core`: 纯规则与状态机

## Run

```bash
corepack pnpm install
corepack pnpm --filter @codenames/server dev
corepack pnpm --filter @codenames/web dev
```

服务端默认端口 `3001`，前端默认端口 `5173`。

## Desktop Hosted Server

桌面版采用 Hosted Server：房主启动可执行文件后，本机同时托管前端、HTTP API 和 Socket.IO。默认端口为 `3210`，如果端口被占用会自动尝试后续端口。等待房间会显示局域网访问地址，其他玩家在同一网络中访问该地址即可加入。

```bash
corepack pnpm desktop:dev
```

一台电脑多开演示时，可以使用应用里的“多开演示 / 打开本机玩家窗口”，或在浏览器打开桌面版显示的本机地址。

打包命令：

```bash
corepack pnpm desktop:pack   # 生成 release/linux-unpacked
corepack pnpm desktop:dist   # 生成平台安装包/可执行分发物
```

若要启用 AI 发牌，请设置：

```bash
export OPENAI_API_KEY=...
export OPENAI_DECK_MODEL=gpt-5.4-mini
```

未配置 API key 时，会自动回退到本地词库，保证游戏仍可开始。
