# 行动代号

当前版本：`0.9.5`

中文优先的《行动代号》房间、发牌和对局工具。它可以作为普通 Web 应用运行，也可以打包成桌面宿主：房主启动后，本机托管前端、HTTP API 和 Socket.IO，其他玩家通过同一局域网加入。

## 主要功能

- 支持 `4` 到 `12` 名游戏玩家，额外成员可作为旁观者加入。
- 支持文字情报和影像情报两种模式，均为标准 `5x5`、`25` 张牌。
- 文字模式固定使用本地中文词牌，不需要 API Key。
- 图片模式可使用本地占位牌库，也可配置大模型生成图片牌阵。
- 大模型图片牌阵会先进入房主预览，房主可重新生成或确认开局。
- 红队固定先手，红队 `9` 张关键牌，蓝队 `8` 张关键牌。
- 开局后自动分配红蓝队长和队员；队长可看关键答案，队员只能看公共牌阵。
- 支持队长给线索、队员猜牌、结束回合、刺客结算和全部揭示结算。
- 线索会做牌面文字校验，不能包含文字牌阵中出现的字。
- 倒计时只做提醒，不强制推进；超时提示为 `抓紧时间`。
- 支持房间重连、房主转移、返回等候房间和重新发牌。
- 桌面 portable 启动时会先显示轻量启动页，内置服务就绪后自动进入入口页。

## 使用流程

1. 房主打开入口页或桌面版，创建房间。
2. 选择文字情报或影像情报，并设置游戏人数。
3. 将房间码或入口链接发给同一网络内的玩家。
4. 等待玩家加入；超出设定人数的成员会进入旁观队列，也可手动切换旁观。
5. 房主点击开始游戏。图片大模型模式下，先确认图片牌阵再开局。
6. 队长查看关键答案并给线索，队员在公共牌阵上猜牌。
7. 点中刺客或一方关键牌全部揭示后，进入结算。

## Workspace

- `apps/entry`: 入口/邀请页，默认端口 `5174`。
- `apps/web`: React + Vite 游戏前端，默认端口 `5173`。
- `apps/server`: Express + Socket.IO 服务端，负责房间状态、牌库生成和图片缓存。
- `apps/desktop`: Electron 桌面宿主，内嵌服务端并托管前端。
- `packages/shared`: 共享类型、schema 和 Socket 协议。
- `packages/game-core`: 纯规则逻辑，包括发牌、分队、回合和胜负判定。
- `generated/`、`release/`: 生成产物目录，避免无关提交。

规则逻辑放在 `packages/game-core`，协议和类型放在 `packages/shared`，UI 放在 `apps/web` 或 `apps/entry`，服务端行为放在 `apps/server`。

## 本地开发

使用仓库根目录的 `corepack pnpm`。

```bash
corepack pnpm install
corepack pnpm dev
```

默认端口：

- 服务端：`3001`
- 游戏前端：`5173`
- 入口页：`5174`

常用局部启动：

```bash
corepack pnpm --filter @codenames/server dev
corepack pnpm --filter @codenames/web dev
corepack pnpm --filter @codenames/entry dev
```

局域网调试时，确保房主电脑防火墙放行 Node.js 和服务端端口。入口页会打开 `520x1040` 的玩家视口；桌面版玩家窗口也保持同样的内容区尺寸。

首屏和模式选择页使用压缩 WebP 资源。入口页只携带自己的轻量资源，避免把完整游戏素材重复打进桌面包。

## 桌面版

桌面版采用 Hosted Server 架构。启动后会在本机开启服务，默认端口 `3210`；如果端口被占用，会自动尝试后续端口。等待房间会显示房主服务器地址，其他设备访问该地址即可加入。

portable 首次打开可能仍受系统解包和安全扫描影响。应用会先显示本地启动页，再在内置服务就绪后自动切到入口页。

```bash
corepack pnpm desktop:dev
```

打包命令：

```bash
corepack pnpm desktop:pack   # 生成未压缩的桌面构建
corepack pnpm desktop:dist   # 生成平台分发产物
```

GitHub Release workflow 会构建并发布 Windows portable `.exe` 和 macOS `.zip`。当前 `v0.9.5` 发布产物命名为：

- `codenames-0.9.5-windows-x64.exe`
- `codenames-0.9.5-macos-x64.zip`

Windows 包会校验 `sharp` 的 win32 原生模块和 libvips runtime，并在打包后执行一次 `require("sharp")` 烟测，避免图片牌库运行时才暴露 native 依赖缺失。

## 牌库与模型

文字模式：

- 固定走本地中文词牌。
- 创建房间时不会展示大模型牌库配置。
- 不需要任何 API Key。

图片模式：

- 默认选择大模型牌库，可切换到本地牌库。
- 支持 OpenAI、火山、千问图片模型。
- OpenAI 默认模型显示为 `ImageGen2`，实际模型 ID 为 `gpt-image-2`。
- 火山默认模型显示为 `Seedream 4.5`。
- 千问可选模型为 `qwen-image-2.0-pro-2026-04-22`、`qwen-image-2.0-pro`、`qwen-image-2.0-pro-2026-03-03`。
- API Key 只在创建房间请求中提交给房主服务器，不应写入仓库。
- 大模型生成失败时不会自动回退到本地牌库。
- 服务端会把生成的整张 `5x5` 图片切成 `25` 张牌并缓存在内存中。
- 本地图片占位牌库使用轻量 WebP 素材，减少桌面包体积和模式页加载等待。

## 0.9.5 更新重点

- 优化桌面 portable 启动体验：先显示轻量启动页，再进入入口页。
- 压缩首屏、模式页、封面和头像资源，构建后的 `apps/web/dist` 约 `2MB`，`apps/entry/dist` 约 `64KB`。
- 修复 Windows 图片牌库的 `sharp` 原生运行时打包问题，显式包含 `@img/sharp-libvips-win32-x64`。
- 发布流水线新增 Windows packaged `sharp` 加载烟测。
- 桌面玩家窗口内容区保持 `520x1040`，与 Web 入口打开的玩家窗口一致。

## 常用验证

发布或合并前建议运行：

```bash
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

常用局部验证：

```bash
corepack pnpm --filter @codenames/server test
corepack pnpm --filter @codenames/game-core test
corepack pnpm --filter @codenames/web lint
corepack pnpm --filter @codenames/desktop lint
corepack pnpm desktop:build
```

桌面窗口相关改动还应做 Electron smoke check，确认 `BrowserWindow.getContentBounds()` 与入口玩家视口尺寸一致。

## 安全注意

- 不要提交 API Key、真实密钥或本地环境文件。
- 大模型 Key 通过 UI 输入，仅用于当前房间创建/生成流程。
- `release/`、`generated/`、临时 QA 目录和本地参考资料不要随手提交。
