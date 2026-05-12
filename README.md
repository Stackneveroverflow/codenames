# 行动代号

当前版本：`0.9.2`

中文优先的《行动代号》在线发牌与对局工具。当前 `0.9.2` 版本以文字版体验为主，支持本地中文牌库、实时房间、队长答案页、线索/猜词回合、结算弹窗、入口页和桌面宿主。

## 功能概览

- 文字模式默认使用本地中文牌库，不需要 API Key。
- 图片模式支持大模型图片牌库，房主可先预览牌阵，再重新生成或确认开局。
- 游戏人数支持 `4` 到 `12` 名参赛玩家，超出人数会进入旁观。
- 红队固定先手，红队 `9` 张关键牌，蓝队 `8` 张关键牌。
- 队长可查看关键答案牌阵；普通队员只能看公共牌阵。
- 给线索时会校验线索内容和线索数量，线索不能包含牌阵中出现的字。
- 入口页和游戏首页右下角会显示当前版本号。

## Workspace

- `apps/entry`: 入口页，默认端口 `5174`，负责打开游戏窗口。
- `apps/web`: React + Vite 游戏前端，默认端口 `5173`。
- `apps/server`: Express + Socket.IO 服务端、房间状态、牌库生成。
- `apps/desktop`: Electron 桌面宿主，房主本机托管服务。
- `packages/shared`: 共享类型、协议和 schema。
- `packages/game-core`: 纯规则与状态机。

## 本地开发

安装依赖：

```bash
corepack pnpm install
```

同时启动入口页、游戏前端和服务端：

```bash
corepack pnpm dev
```

也可以分别启动：

```bash
corepack pnpm --filter @codenames/server dev
corepack pnpm --filter @codenames/web dev
corepack pnpm --filter @codenames/entry dev
```

默认端口：

- 服务端：`3001`
- 游戏前端：`5173`
- 入口页：`5174`

局域网调试时，房主电脑启动服务后，其他设备访问入口页或游戏前端的局域网地址。前端会自动连接同一台房主电脑的服务端端口；如果页面可打开但无法创建/加入房间，优先检查防火墙是否放行 Node.js 和服务端端口。

## 桌面宿主

桌面版采用 Hosted Server：房主启动可执行文件后，本机同时托管前端、HTTP API 和 Socket.IO。默认端口为 `3210`，如果端口被占用会自动尝试后续端口。等待房间会显示局域网访问地址，其他玩家在同一网络中访问该地址即可加入。

```bash
corepack pnpm desktop:dev
```

打包命令：

```bash
corepack pnpm desktop:pack   # 生成 release/linux-unpacked
corepack pnpm desktop:dist   # 生成平台安装包/可执行分发物
```

## AI 图片牌库

文字模式不需要大模型牌库。图片模式如果使用大模型牌库，需要在创建房间时配置对应供应商的 API Key 和图片模型。

当前 UI 中图片模式默认选择火山的 Seedream 4.5。服务端生成图片牌阵时会要求纯图片内容，不应包含文字说明；生成后由房主确认再正式开局。

## 验证命令

发布或合并前建议运行：

```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

常用的局部验证：

```bash
corepack pnpm --filter @codenames/server test
corepack pnpm --filter @codenames/game-core test
corepack pnpm --filter @codenames/web lint
corepack pnpm --filter @codenames/web build
```
