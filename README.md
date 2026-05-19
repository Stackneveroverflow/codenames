# 行动代号

当前版本：`0.9.7`

中文优先的《行动代号》房间、发牌和对局工具。它可以作为普通 Web 应用运行，也可以打包成桌面宿主：房主启动后，本机托管入口页、游戏前端、HTTP API 和 Socket.IO，其他玩家通过同一局域网加入。

## 主要功能

- 支持文字情报和影像情报两种模式，均为标准 `5x5`、`25` 张牌。
- 文字模式固定使用本地中文词牌，不需要 API Key。
- 图片模式支持本地 `25` 张 WebP 图片牌库，也支持大模型生成图片牌阵。
- 图片大模型模式下，房主先点击 `生成图片`，预览后可 `重新生成` 或 `确认`；确认后返回等候房间，再点击 `开始游戏` 正式开局。
- 分队支持完全随机和固定队伍。固定队伍显示红蓝两侧座位、队长位、普通位和旁观位，玩家可自行移动。
- 红队固定先手，红队 `9` 张关键牌，蓝队 `8` 张关键牌。
- 队长可看关键答案，队员只能看公共牌阵；当前操作者会在局内显眼展示。
- 支持队长给线索、队员猜牌、结束回合、刺客结算和全部揭示结算。
- 文字线索限制 `1` 到 `4` 个汉字，数量必须大于 `0`；文字模式会校验线索不能包含文字牌面中的字。
- 图片模式不展示图片文字说明，线索也不会按图片 alt 文本做撞字校验。
- 图片牌支持点击放大；未翻牌可在弹窗中翻开，翻开后弹窗自动关闭。
- 倒计时只做提醒，不强制推进；超时提示为 `抓紧时间`。
- 支持房间重连、房主转移、返回等候房间和重新发牌。
- 桌面 portable 启动时会先显示轻量启动页，内置服务就绪后自动进入入口页。

## 使用流程

1. 房主打开入口页或桌面版，创建房间。
2. 选择文字情报或影像情报。
3. 等候房间中选择完全随机或固定队伍；随机模式可设置游戏人数，固定模式按红蓝座位入座。
4. 将房间码或入口链接发给同一网络内的玩家。
5. 图片大模型模式下，房主先生成并确认图片牌阵；确认后回到等候房间。
6. 房主点击开始游戏。
7. 队长查看关键答案并给线索，队员在公共牌阵上猜牌。
8. 点中刺客或一方关键牌全部揭示后，进入结算。

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

## 服务器容器部署

服务器部署使用单镜像、单端口同源模式。容器内由 Express 同时托管游戏页 `/`、入口页 `/entry/`、HTTP API 和 Socket.IO，默认监听 `3001`。

构建镜像：

```bash
docker build -t codenames:0.9.7 .
```

运行容器：

```bash
docker run -d \
  --name codenames \
  --restart unless-stopped \
  -p 3001:3001 \
  codenames:0.9.7
```

健康检查：

```bash
curl http://127.0.0.1:3001/health
```

公网部署时，建议用 Nginx、Caddy 或云厂商负载均衡把 HTTPS 域名反向代理到 `127.0.0.1:3001`，并确保 WebSocket upgrade 生效。入口页地址为 `https://你的域名/entry/`，游戏页和分享链接会保持同源。

如需使用图片大模型相关环境变量，不要写入镜像；运行时通过 `--env-file` 或 `-e` 注入。

## 桌面版

桌面版采用 Hosted Server 架构。启动后会在本机开启服务，默认端口 `3210`；如果端口被占用，会自动尝试后续端口。等待房间会显示房主服务器地址，其他设备访问该地址即可加入。

```bash
corepack pnpm desktop:dev
```

打包命令：

```bash
corepack pnpm desktop:pack   # 生成未压缩的桌面构建
corepack pnpm desktop:dist   # 生成平台分发产物
```

GitHub Release workflow 会构建并发布 Windows portable `.exe` 和 macOS `.zip`。当前 `v0.9.7` 发布产物命名为：

- `codenames-0.9.7-windows-x64.exe`
- `codenames-0.9.7-macos-x64.zip`

Windows 包会校验 `sharp` 的 win32 原生模块和 libvips runtime，并在打包后执行一次 `require("sharp")` 烟测，避免图片牌库运行时才暴露 native 依赖缺失。

## 牌库与模型

文字模式：

- 固定走本地中文词牌。
- 创建房间时不会展示大模型牌库配置。
- 不需要任何 API Key。

图片模式：

- 本地牌库使用 `apps/web/public/fallback-image-cards/` 下的 `25` 张 WebP 图片。
- 大模型牌库当前推荐且唯一保留的火山生图模型是 `Seedream 5.0 lite`，实际模型 ID 为 `doubao-seedream-5-0-260128`。
- OpenAI 图片模型仍保留为 `ImageGen2`，实际模型 ID 为 `gpt-image-2`。
- 通义图片模型、Seedream 4.0 和 Seedream 4.5 已从图片模式选项和服务端生图路径中移除。
- 火山生图会附带一张 `Codenames: Pictures` 参考图，帮助维持卡牌可读性和卡面气质。
- 生图 prompt 每局随机抽取：`5` 张来自单体主体池，`20` 张来自融合主体池；服务端生成整张 `5x5` 图片后切成 `25` 张牌并缓存在内存中。
- API Key 只在创建房间请求中提交给房主服务器，不应写入仓库。
- 大模型生成失败时不会自动回退到本地牌库。

## 0.9.7 更新重点

- 等候房间图片模式新增 `生成图片` / `开始游戏` 双按钮流程；图片确认后返回等候房间，开始游戏时复用已确认图片。
- 图片确认页按钮改为 `重新生成` 和 `确认`，确认不再直接发牌。
- 新增 `25` 张本地 WebP 图片牌资产，并加入测试确保引用文件存在。
- 图片模式 UI 去掉图片文字说明，图片弹窗和翻牌交互更接近正式牌局。
- 生图模型收敛：火山只保留 Seedream 5.0 lite，移除通义图片模型和 Seedream 4.x。
- 扩充火山生图单体池和融合池，加入更多常见场景、角色、运动和物件。
- 固定队伍模式支持红蓝座位、队长位和旁观位，玩家可在等候房间自行移动。
- 优化横竖屏局内布局、当前操作者提示、顶部线索条、结束回合按钮和已翻牌视觉状态。

## 0.9.6 更新重点

- 图片大模型提示词改成结构化模板，分为目标、布局、构图、参考、风格和硬性要求。
- 火山 Seedream 请求加入固定参考图，提升图片牌的参考方向稳定性。
- 千问图片模型曾改用中文短提示词；该路径已在 `0.9.7` 移除。

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
