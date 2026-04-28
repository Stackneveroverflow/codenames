# codenames-online v1 `PLAN.md` 规格

## Summary
- 交付物是一个中文优先、匿名昵称入房、私密房间制的可玩 Web MVP，支持完整 Codenames 核心流程：建房、加入、选边、分配队长/队员、发牌、出线索、猜词、翻牌、回合切换、胜负结算、再来一局。
- 工程按通用 Node 长连接平台设计，采用 `pnpm` workspace 的全栈结构：`apps/web`、`apps/server`、`packages/game-core`、`packages/shared`。`game-core` 只放纯规则与状态机；`server` 负责房间、同步、AI 发牌；`web` 负责 UI 与交互。
- 前端采用 React + TypeScript + Vite；服务端采用 Node + TypeScript + Socket.IO。房间状态用单实例内存存储，带 TTL 清理；v1 不做数据库、不做账号、不做公开匹配、不做横向扩容。
- 视觉方向定为“情报档案室”风格：木纹/牛皮纸桌面、红蓝阵营高对比、档案卡片式词牌、明显的队长视图与队员视图分层。移动端必须可用，但桌面端是主体验。
- AI 只负责“开局生成词牌内容”，不参与猜词或出线索。服务端统一走 OpenAI `Responses API`，但默认模型改为 `gpt-5.4-mini`，因为官方模型页明确把它定位为面向高吞吐、低延迟、低成本场景的更高性价比选择；`gpt-5.5` 不再作为默认，只保留为可切换的高质量备选。
- 后续图片版扩展继续预留 `CardContent` 联合类型，并按官方图像文档为未来接入 `gpt-image-2` 生成图片牌做接口准备。
- 执行阶段应把本规格写入 `PLAN.md`，并在 `.logs/` 下创建至少三份日志：`discovery`、`implementation`、`qa`，文件名使用日期前缀。

## Implementation Changes
- 房间与协议：
  - 房间码为短随机大写字母数字串，房主创建后分享给其他玩家。
  - 玩家只需昵称即可入房；昵称在房间内唯一，重名则拒绝。
  - 角色分为 `host`、`red_spymaster`、`red_operatives`、`blue_spymaster`、`blue_operatives`、`spectator`。
  - 房主可分配阵营/角色、切换是否启用 AI 词牌、开始对局、重开。
- 游戏状态机：
  - `lobby -> setup -> in_round -> finished`。
  - 开局生成 25 张牌，按经典分布生成红蓝中立与刺客。
  - 队长仅可见牌面阵营；普通队员只见未翻开的公共牌面。
  - 每回合流程固定为：当前队长提交线索与数字，当前队员连续猜测，猜错或主动结束则切换回合，刺客即刻结束游戏。
  - 断线重连按 `playerId + roomId` 恢复；房主离线时自动移交给最早在线玩家。
- AI 发牌内容服务：
  - `CardContent` 定义为 `word | image` 联合，v1 只落地 `word`，字段保持未来兼容。
  - 开局时若启用 AI 词牌，由服务端请求 OpenAI 并用结构化 JSON 返回 25 个中文词条。
  - 默认模型为 `gpt-5.4-mini`；服务端配置保留 `OPENAI_DECK_MODEL`，允许切换到 `gpt-5.5` 做质量对比，但不在 v1 UI 暴露。
  - 词条约束固定：常见名词或短语，2-6 个中文字符，去重，无敏感词，无品牌/人名/地名依赖，不使用标点或数字，难度适合大众玩家联想。
  - 服务端本地二次校验：数量、唯一性、字符集、长度、敏感词；失败则先用同模型重试一次，再降级到本地内置词库，保证游戏可开始。
  - 提示词写法偏短、约束清晰、少推理链，避免为简单高频任务浪费 token；静态规则放前、动态参数放后；使用 Structured Outputs，不在 prompt 里手写 schema。
  - 由于这是单次、边界清晰的内容生成任务，不使用高推理配置；默认 `reasoning.effort` 设为 `low` 或最小可用档，目标是稳住成本和延迟。
- 前端页面与体验：
  - 页面只做三屏：首页/建房入房、房间大厅、对局页。
  - 首页强调“一键建房、匿名开玩、AI 随机发牌”。
  - 大厅包含房间码、玩家列表、角色分配、开始按钮、规则提示。
  - 对局页固定三栏信息：顶部比分与当前回合，中间 5x5 牌盘，底部线索/猜测/系统事件区。
  - 队长与队员视图通过明确的视觉状态区分，不依赖隐藏入口。
  - 移动端保留完整功能，但将事件流折叠为抽屉/底栏，保证 `390x844` 下首屏能看到关键状态、牌盘主体和当前操作按钮。
- 工程与日志：
  - `packages/shared` 放协议事件名、Zod schema、共享类型。
  - `packages/game-core` 放纯函数 reducer、胜负判定、线索/猜测规则。
  - `apps/server` 放 Socket.IO 网关、房间 store、AI deck service、内容校验、降级词库。
  - `apps/web` 放路由、房间页面、牌盘组件、角色面板、事件流、连接状态提示。
  - `.logs/` 至少记录：仓库发现与决策、实施里程碑、Playwright QA 结果与截图清单。

## Public Interfaces / Types
- 共享核心类型：
  - `CardContent = { type: "word"; text: string } | { type: "image"; imageUrl: string; alt: string }`
  - `CardState = { id; content; owner; revealed }`
  - `RoomState = { roomId; phase; hostId; players; config; board; turn; winner; activityLog }`
  - `RoomConfig = { locale: "zh-CN"; deckMode: "ai" | "fallback"; boardSize: "classic" }`
- Socket 事件：
  - Client -> Server: `room:create`, `room:join`, `room:rejoin`, `room:update_config`, `room:assign_role`, `game:start`, `game:submit_clue`, `game:guess_card`, `game:end_turn`, `game:restart`
  - Server -> Client: `room:snapshot`, `room:error`, `presence:update`, `game:event`, `connection:restored`
- 服务端 AI 边界：
  - 不暴露给浏览器直接调用 OpenAI。
  - Web 客户端只通过 `game:start` 触发 AI 发牌。
  - 服务端 AI service 输出统一为 `ValidatedDeck`，上层不接原始模型文本。

## Test Plan
- 单元测试：
  - 牌面分布正确，先手队伍额外一张牌，刺客唯一。
  - 线索提交与猜测次数规则正确，翻到己方/敌方/中立/刺客的转移正确。
  - AI 词牌校验覆盖：重复词、非法字符、长度越界、敏感词、数量不足、OpenAI 响应异常、降级词库兜底。
  - `gpt-5.4-mini` 下的返回稳定性要单独加 fixture，验证在低成本模型下结构化输出仍能通过校验。
- 集成测试：
  - 两名玩家建房入房并开局成功。
  - 四名玩家完成一局最小闭环。
  - 玩家断线重连后恢复房间快照。
  - 房主断线后的主机移交。
  - 非当前角色越权操作被拒绝。
- Playwright Interactive QA：
  - 先写覆盖清单，再做桌面 `1600x900` 和移动 `390x844` 双上下文验证。
  - 功能检查覆盖：首页建房/入房、大厅角色分配、AI 发牌开局、队长线索提交、队员猜牌、回合切换、胜负弹层、再来一局、断线提示。
  - 视觉检查覆盖：首屏可读性、5x5 牌盘完整可见、红蓝阵营对比、队长视图信息层级、移动端首屏不裁切、事件流在高密状态下仍清晰。
  - 探索性场景至少 2 个：同名入房、非当前队伍误操作、网络短断连后继续游戏。
  - `.logs/qa-*.md` 记录 QA inventory、通过项、截图文件名、未解决缺陷。
- 负向确认：
  - 不允许首屏核心牌盘被裁切。
  - 不允许因为 AI 失败导致整局无法开始。
  - 不允许客户端单独决定翻牌结果或胜负。

## Assumptions And Defaults
- v1 默认单实例部署；房间与对局状态不持久化，服务重启后房间消失可接受。
- v1 不做注册登录、好友系统、公开大厅、观战聊天审核、积分排行、支付与多语言切换。
- 默认中文 UI 与中文词牌；英文或双语作为后续版本。
- 后续图片版不改协议主干，只把 `CardContent.type` 从 `word` 扩展到 `image`，图片资源生成默认按官方图像文档优先考虑 `gpt-image-2`。
- OpenAI 相关实现依据官方文档约束：
  - 截至 `2026-04-28`，官方模型页明确写明“若优化延迟和成本，可选更小变体如 `gpt-5.4-mini`”
    https://developers.openai.com/api/docs/models
  - `gpt-5.4-mini` 的官方模型页将其定位为“面向高吞吐工作负载的更快、更高效模型”
    https://developers.openai.com/api/docs/models/gpt-5.4-mini
  - 官方 `2026年3月` 变更日志说明 `gpt-5.4-mini` 已发布到 `Responses API`
    https://developers.openai.com/api/docs/changelog
  - 多轮与结构化输出仍优先用 `Responses API`
    https://developers.openai.com/api/docs/guides/latest-model#using-reasoning-models
  - 图片版后续参考：单次图片生成可用 Image API；对话式、可编辑图像体验可用 `Responses API`；新图像工作流优先 `gpt-image-2`
    https://developers.openai.com/api/docs/guides/image-generation#choosing-the-right-api
    https://developers.openai.com/api/docs/models/gpt-image-2

