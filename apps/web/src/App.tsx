import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import type { ActivityEntry, CardOwner, GameMode, PlayerRole, PlayerViewSnapshot, RoomConfig, TeamSize } from "@codenames/shared";
import { socketEvents } from "@codenames/shared";

import { ActivityLog } from "./components/ActivityLog";
import { Board } from "./components/Board";
import { RolePanel } from "./components/RolePanel";
import { getSocket } from "./lib/socket";

const storageKey = "codenames-online:identity";

type StoredIdentity = Record<string, { playerId: string }>;

const nicknameParts = [
  "灯塔",
  "纸鹤",
  "北风",
  "旧桥",
  "风铃",
  "墨砚",
  "茶盏",
  "星图",
  "港湾",
  "罗盘",
  "青灯",
  "木舟",
  "云梯",
  "雨巷",
  "火漆",
  "银针",
  "烟岚",
  "书页",
  "列车",
  "海图",
  "铜钟",
  "晨雾",
  "雀鸟",
  "梅枝",
  "竹笛",
  "山岚",
  "木屋",
  "舟影",
  "雨声",
  "云灯",
  "白露",
  "清风",
  "落霞",
  "寒星",
  "北极星",
  "旧书店",
  "黑胶片",
  "老钟表",
  "小纸船",
  "木偶戏",
  "旧邮局",
  "古戏台",
];

const gameModeLabels: Record<GameMode, string> = {
  text: "文字版",
  image: "图片版",
};

const teamSizeOptions: TeamSize[] = [2, 3, 4, 5];

function generateNickname() {
  const candidates = nicknameParts.filter((name) => name.length >= 2 && name.length <= 4);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? "纸鹤";
}

type RoomAction =
  | { type: "start"; team: "red" | "blue" }
  | { type: "clue"; team: "red" | "blue"; clue: string; count: number }
  | { type: "guess"; cardId: string; label: string }
  | { type: "turn_end"; team: "red" | "blue" }
  | { type: "finish"; team: "red" | "blue"; reason: "all_found" | "assassin" };

function readIdentity(roomId: string) {
  const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as StoredIdentity;
  return parsed[roomId];
}

function saveIdentity(roomId: string, playerId: string) {
  const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as StoredIdentity;
  parsed[roomId] = { playerId };
  localStorage.setItem(storageKey, JSON.stringify(parsed));
}

function createActivity(message: string, type: ActivityEntry["type"], createdAt = new Date().toISOString()): ActivityEntry {
  return {
    id: `${type}-${createdAt}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt,
    type,
    message,
  };
}

function toActivityType(actionType: RoomAction["type"]): ActivityEntry["type"] {
  const map: Record<RoomAction["type"], ActivityEntry["type"]> = {
    start: "game_started",
    clue: "clue_submitted",
    guess: "card_guessed",
    turn_end: "turn_ended",
    finish: "game_finished",
  };
  return map[actionType];
}

function buildDemoSnapshot(): PlayerViewSnapshot {
  const board = [
    ["北斗", "red"],
    ["纸鹤", "red"],
    ["茶馆", "red"],
    ["钟楼", "red"],
    ["火车", "red"],
    ["灯塔", "blue"],
    ["罗盘", "blue"],
    ["风筝", "blue"],
    ["邮差", "blue"],
    ["潜艇", "blue"],
    ["古井", "neutral"],
    ["广场", "neutral"],
    ["桥洞", "neutral"],
    ["墨镜", "neutral"],
    ["票根", "neutral"],
    ["雪线", "neutral"],
    ["港口", "neutral"],
    ["木箱", "neutral"],
    ["星图", "neutral"],
    ["口琴", "neutral"],
    ["药瓶", "neutral"],
    ["火花", "neutral"],
    ["沙漏", "neutral"],
    ["密钥", "neutral"],
    ["黑曜石", "assassin"],
  ].map(([text, owner], index) => ({
    id: `demo-card-${index + 1}`,
    content: { type: "word" as const, text },
    owner: owner as CardOwner,
    revealed: false,
  }));

  return {
    roomId: "DEMO",
    phase: "lobby",
    hostId: "demo-host",
    players: [
      { id: "demo-host", nickname: "舰长", role: "host", online: true, joinedAt: new Date().toISOString() },
      { id: "demo-red", nickname: "红队长", role: "red_spymaster", online: true, joinedAt: new Date().toISOString() },
      { id: "demo-red-2", nickname: "红队员", role: "red_operatives", online: true, joinedAt: new Date().toISOString() },
      { id: "demo-blue", nickname: "蓝队长", role: "blue_spymaster", online: true, joinedAt: new Date().toISOString() },
      { id: "demo-blue-2", nickname: "蓝队员", role: "blue_operatives", online: true, joinedAt: new Date().toISOString() },
    ],
    config: { locale: "zh-CN", gameMode: "text", deckMode: "fallback", teamSize: 2, boardSize: "classic" },
    board: board,
    turn: null,
    winner: null,
    activityLog: [
      createActivity("Demo 已就绪，点击开始观看完整局流程。", "system"),
      createActivity("5 名示例玩家已入场。", "player_joined"),
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    selfId: "demo-host",
    selfRole: "host",
  };
}

function applyDemoAction(snapshot: PlayerViewSnapshot, action: RoomAction): PlayerViewSnapshot {
  const now = new Date().toISOString();
  const next = structuredClone(snapshot);
  next.updatedAt = now;

  if (action.type === "start") {
    next.phase = "in_round";
    next.turn = { team: action.team, phase: "clue", clue: null };
    next.activityLog.push(createActivity(`对局开始，${action.team === "red" ? "红队" : "蓝队"}先手。`, toActivityType(action.type), now));
    return next;
  }

  if (!next.turn) return next;

  if (action.type === "clue") {
    next.turn = {
      ...next.turn,
      team: action.team,
      phase: "guess",
      clue: {
        byPlayerId: action.team === "red" ? "demo-red" : "demo-blue",
        clue: action.clue,
        count: action.count,
        guessesRemaining: action.count + 1,
      },
    };
    next.activityLog.push(createActivity(`${action.team === "red" ? "红队" : "蓝队"}队长给出线索「${action.clue} ${action.count}」。`, toActivityType(action.type), now));
    return next;
  }

  if (action.type === "guess") {
    const card = next.board?.find((item) => item.id === action.cardId);
    if (card) {
      card.revealed = true;
    }
    if (next.turn?.clue && next.turn.clue.guessesRemaining > 0) {
      next.turn.clue.guessesRemaining -= 1;
    }
    next.activityLog.push(createActivity(action.label, toActivityType(action.type), now));
  }

  if (action.type === "turn_end") {
    next.turn = { team: action.team === "red" ? "blue" : "red", phase: "clue", clue: null };
    next.activityLog.push(createActivity(`${action.team === "red" ? "红队" : "蓝队"}回合结束，轮到下一队。`, toActivityType(action.type), now));
  }

  if (action.type === "finish") {
    next.phase = "finished";
    next.turn = null;
    next.winner = { team: action.team, reason: action.reason };
    next.activityLog.push(createActivity(`${action.team === "red" ? "红队" : "蓝队"}达成胜利条件，Demo 结束。`, toActivityType(action.type), now));
  }

  return next;
}

function useDemoSnapshot() {
  const [snapshot, setSnapshot] = useState<PlayerViewSnapshot>(() => buildDemoSnapshot());

  useEffect(() => {
    const script: RoomAction[] = [
      { type: "start", team: "red" },
      { type: "clue", team: "red", clue: "交通", count: 2 },
      { type: "guess", cardId: "demo-card-2", label: "红队员猜中「纸鹤」" },
      { type: "guess", cardId: "demo-card-4", label: "红队员猜中「钟楼」" },
      { type: "turn_end", team: "red" },
      { type: "clue", team: "blue", clue: "天空", count: 2 },
      { type: "guess", cardId: "demo-card-6", label: "蓝队员猜中「灯塔」" },
      { type: "guess", cardId: "demo-card-7", label: "蓝队员猜中「罗盘」" },
      { type: "turn_end", team: "blue" },
      { type: "clue", team: "red", clue: "城市", count: 3 },
      { type: "guess", cardId: "demo-card-1", label: "红队员猜中「北斗」" },
      { type: "guess", cardId: "demo-card-3", label: "红队员猜中「茶馆」" },
      { type: "guess", cardId: "demo-card-5", label: "红队员猜中「火车」" },
      { type: "finish", team: "red", reason: "all_found" },
    ];

    let index = 0;
    const timer = window.setInterval(() => {
      setSnapshot((current) => {
        const action = script[index];
        if (!action) {
          window.clearInterval(timer);
          return current;
        }
        index += 1;
        return applyDemoAction(current, action);
      });
    }, 1600);

    return () => window.clearInterval(timer);
  }, []);

  return snapshot;
}

function GameShell({
  snapshot,
  error,
  roomId,
  isHost,
  onAssignRole,
  onStart,
  onRestart,
  onGuess,
  onSubmitClue,
  onEndTurn,
  onUpdateConfig,
}: {
  snapshot: PlayerViewSnapshot;
  error: string;
  roomId: string;
  isHost: boolean;
  onAssignRole: (playerId: string, role: PlayerRole) => void;
  onStart: () => void;
  onRestart: () => void;
  onGuess: (cardId: string) => void;
  onSubmitClue: (clue: string, count: number) => void;
  onEndTurn: () => void;
  onUpdateConfig: (config: Partial<RoomConfig>) => void;
}) {
  const navigate = useNavigate();
  const [clue, setClue] = useState("");
  const [count, setCount] = useState("1");
  const boardCount = useMemo(() => snapshot.board?.length ?? 0, [snapshot.board]);
  const redScore = snapshot.board?.filter((card) => card.revealed && card.owner === "red").length ?? 0;
  const blueScore = snapshot.board?.filter((card) => card.revealed && card.owner === "blue").length ?? 0;
  const phaseLabel = snapshot.phase === "lobby" ? "大厅准备" : snapshot.phase === "finished" ? "结算中" : "行动进行中";

  const canSubmitClue =
    snapshot.phase === "in_round" &&
    snapshot.turn?.phase === "clue" &&
    ((snapshot.turn.team === "red" && snapshot.selfRole === "red_spymaster") ||
      (snapshot.turn.team === "blue" && snapshot.selfRole === "blue_spymaster"));

  return (
    <main className={`shell shell--game${roomId === "DEMO" ? " shell--demo" : ""}`}>
      <section className="game-mobile-shell">
        <header className="game-topbar">
          <div className="game-topbar__row">
            {roomId === "DEMO" && (
              <button type="button" className="ghost ghost--mobile" onClick={() => navigate("/")}>
                ← 返回首页
              </button>
            )}
            <span className="hero-status-pill">房间 {snapshot.roomId}</span>
            <span className="hero-status-pill">{phaseLabel}</span>
          </div>
          <div className="game-topbar__body">
            <div>
              <p className="eyebrow">行动代号</p>
              <h1>{snapshot.phase === "finished" ? "本局已结算" : snapshot.phase === "lobby" ? "等待全员就位" : "行动进行中"}</h1>
              <p className="hero-copy hero-copy--compact">
                {snapshot.phase === "finished" ? "本局结果已锁定，可以直接再来一局。" : snapshot.phase === "lobby" ? "先分配角色，再由房主开始对局。" : "队长给出线索，队员根据牌盘完成猜测。"}
              </p>
            </div>
            <div className="scoreboard scoreboard--mobile">
              <div className="score score--red">红队 {redScore}</div>
              <div className="score score--blue">蓝队 {blueScore}</div>
            </div>
          </div>
          <div className="game-chip-row">
            <div className="turn-pill">{snapshot.turn ? `${snapshot.turn.team === "red" ? "红队" : "蓝队"} · ${snapshot.turn.phase === "clue" ? "出线索" : "猜词"}` : "待开始"}</div>
            <div className="turn-pill turn-pill--soft">{boardCount} 张牌</div>
            <div className="turn-pill turn-pill--soft">{gameModeLabels[snapshot.config.gameMode]}</div>
            <div className="turn-pill turn-pill--soft">每队 {snapshot.config.teamSize} 人</div>
            <div className="turn-pill turn-pill--soft">{snapshot.selfRole.includes("spymaster") ? "队长视角" : "队员视角"}</div>
          </div>
        </header>

        <div className="game-main">
          <Board snapshot={snapshot} onGuess={onGuess} />
          <section className="panel clue-panel clue-panel--mobile">
            <div className="panel-header">
              <div>
                <p className="eyebrow">线索与操作</p>
                <h2>当前行动区</h2>
              </div>
            </div>
            <div className="clue-status">
              <strong>{snapshot.turn?.clue ? `${snapshot.turn.clue.clue} ${snapshot.turn.clue.count}` : "等待队长提交线索"}</strong>
              <span>{snapshot.turn?.clue ? `剩余猜测 ${snapshot.turn.clue.guessesRemaining}` : "当前没有线索"}</span>
            </div>
            <div className="clue-form clue-form--mobile">
              <input placeholder="线索词" value={clue} onChange={(event) => setClue(event.target.value)} />
              <input placeholder="数字" value={count} onChange={(event) => setCount(event.target.value)} />
              <button type="button" disabled={!canSubmitClue || !clue.trim()} onClick={() => onSubmitClue(clue, Number(count) || 0)}>
                提交线索
              </button>
              <button type="button" className="ghost ghost--mobile" disabled={!(snapshot.phase === "in_round" && snapshot.turn?.phase === "guess")} onClick={onEndTurn}>
                结束回合
              </button>
            </div>
            {snapshot.winner && <div className="winner-banner">{snapshot.winner.team === "red" ? "红队" : "蓝队"} 胜利</div>}
            {error && <p className="error-text">{error}</p>}
          </section>

          <RolePanel snapshot={snapshot} onAssignRole={onAssignRole} />
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">对局控制</p>
                <h2>房主操作</h2>
              </div>
            </div>
            <div className="room-config-grid">
              <label className="config-field">
                <span>游戏版型</span>
                <select
                  disabled={!isHost}
                  value={snapshot.config.gameMode}
                  onChange={(event) => onUpdateConfig({ gameMode: event.target.value as GameMode })}
                >
                  <option value="text">文字版</option>
                  <option value="image">图片版</option>
                </select>
              </label>
              <label className="config-field">
                <span>每队人数</span>
                <select
                  disabled={!isHost}
                  value={snapshot.config.teamSize}
                  onChange={(event) => onUpdateConfig({ teamSize: Number(event.target.value) as TeamSize })}
                >
                  {teamSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size} 人
                    </option>
                  ))}
                </select>
              </label>
              <label className="config-row config-row--switch">
                <span>AI 发牌</span>
                <input
                  checked={snapshot.config.deckMode === "ai"}
                  disabled={!isHost}
                  onChange={(event) => onUpdateConfig({ deckMode: event.target.checked ? "ai" : "fallback" })}
                  type="checkbox"
                />
              </label>
            </div>
            <div className="button-row">
              <button type="button" disabled={!isHost} onClick={onStart}>
                开始对局
              </button>
              <button type="button" className="ghost ghost--mobile" disabled={!isHost} onClick={onRestart}>
                再来一局
              </button>
            </div>
            <p className="help-text">队长看到阵营信息，队员只看到已翻开的结果。AI 失败会自动回落到本地词库。</p>
          </section>
          <ActivityLog snapshot={snapshot} />
        </div>
      </section>
    </main>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const socket = getSocket();
  const [nickname, setNickname] = useState(() => generateNickname());
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>("text");
  const [teamSize, setTeamSize] = useState<TeamSize>(2);

  useEffect(() => {
    function onSnapshot(snapshot: PlayerViewSnapshot) {
      saveIdentity(snapshot.roomId, snapshot.selfId);
      navigate(`/room/${snapshot.roomId}`);
    }

    function onError(payload: { message: string }) {
      setError(payload.message);
    }

    socket.on(socketEvents.roomSnapshot, onSnapshot);
    socket.on(socketEvents.roomError, onError);
    return () => {
      socket.off(socketEvents.roomSnapshot, onSnapshot);
      socket.off(socketEvents.roomError, onError);
    };
  }, [navigate, socket]);

  return (
    <main className="hero-page landing-page">
      <div className="landing-orbit landing-orbit--red" />
      <div className="landing-orbit landing-orbit--blue" />
      <section className="landing-shell">
        <header className="landing-topbar">
          <button type="button" className="hero-link hero-link--rules" onClick={() => setRulesOpen(true)}>
            玩法说明
          </button>
        </header>

        <div className="landing-grid">
          <section className="landing-copy">
            <p className="eyebrow landing-copy__eyebrow">行动代号</p>
            <h1 className="landing-title">
              <span>Codenames</span>
            </h1>
          </section>

          <section className="launch-panel launch-panel--home">
            <div className="launch-panel__header launch-panel__header--stacked">
              <div>
                <p className="eyebrow">开始行动</p>
                <h2>你的昵称</h2>
              </div>
              <button type="button" className="hero-link hero-link--inline" onClick={() => setNickname(generateNickname())}>
                换一个
              </button>
            </div>
            <div className="nickname-pill">你的昵称：{nickname}</div>
            <div className="room-config-grid room-config-grid--home">
              <label className="config-field">
                <span>游戏版型</span>
                <select value={gameMode} onChange={(event) => setGameMode(event.target.value as GameMode)}>
                  <option value="text">文字版</option>
                  <option value="image">图片版</option>
                </select>
              </label>
              <label className="config-field">
                <span>每队人数</span>
                <select value={teamSize} onChange={(event) => setTeamSize(Number(event.target.value) as TeamSize)}>
                  {teamSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size} 人
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="primary-action primary-action--large"
              type="button"
              onClick={() => socket.emit(socketEvents.roomCreate, { nickname, config: { gameMode, teamSize } })}
              disabled={!nickname.trim()}
            >
              创建房间
            </button>
            <div className="hero-sub-actions hero-sub-actions--home">
              <button type="button" className="ghost ghost--mobile" onClick={() => setJoinOpen((open) => !open)}>
                {joinOpen ? "收起加入" : "加入房间"}
              </button>
            </div>
            {joinOpen && (
              <div className="join-sheet">
                <div className="launch-field">
                  <label className="field-label" htmlFor="join-code">
                    房间码
                  </label>
                  <input
                    id="join-code"
                    placeholder="输入房间码"
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  />
                </div>
                <button
                  type="button"
                  className="join-confirm"
                  onClick={() => socket.emit(socketEvents.roomJoin, { roomId: joinCode, nickname })}
                  disabled={!joinCode.trim()}
                >
                  加入房间
                </button>
              </div>
            )}
            {error && <p className="error-text">{error}</p>}
          </section>
        </div>
      </section>

      {rulesOpen && (
        <section className="rules-overlay" role="dialog" aria-modal="true" aria-label="游戏规则说明">
          <div className="rules-card rules-card--sheet">
            <button type="button" className="rules-close" onClick={() => setRulesOpen(false)} aria-label="关闭玩法介绍">
              ×
            </button>
            <div className="rules-poster-header">
              <p className="eyebrow">游戏规则</p>
              <h2>30 秒看懂怎么玩</h2>
              <p className="rules-intro">两队对抗，队长给线索，队员猜词。先找齐自己队伍的词，同时避开对手、中立词和刺客。</p>
              <div className="rules-poster-rule">
                <span>目标</span>
                <strong>先找齐自己队伍的词</strong>
              </div>
            </div>
            <div className="rules-grid">
              <article className="rule-figure">
                <div className="rule-icon rule-icon--red">1</div>
                <h3>队长给线索</h3>
                <p>每回合只能说一个词和一个数字，例如“海洋 2”，提示队员去找同阵营的词。</p>
              </article>
              <article className="rule-figure">
                <div className="rule-icon rule-icon--blue">2</div>
                <h3>队员依次猜词</h3>
                <p>可以继续猜到数字上限，也可以随时停手。猜中自己队伍可以继续，碰到别队就结束回合。</p>
              </article>
              <article className="rule-figure">
                <div className="rule-icon rule-icon--assassin">3</div>
                <h3>刺客直接结束</h3>
                <p>翻到中立词会立刻停回合；翻到刺客则游戏立刻结束。先找齐自己队伍全部词的一方获胜。</p>
              </article>
            </div>
            <div className="rules-strip rules-strip--poster">
              <span>一个词 + 一个数字</span>
              <span>猜对可继续</span>
              <span>刺客直接结束游戏</span>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function RoomPage() {
  const { roomId = "" } = useParams();
  const socket = getSocket();
  const [snapshot, setSnapshot] = useState<PlayerViewSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const identity = readIdentity(roomId);
    if (identity?.playerId) {
      socket.emit(socketEvents.roomRejoin, { roomId, playerId: identity.playerId });
    }

    function onSnapshot(next: PlayerViewSnapshot) {
      saveIdentity(next.roomId, next.selfId);
      setSnapshot(next);
    }

    function onError(payload: { message: string }) {
      setError(payload.message);
    }

    socket.on(socketEvents.roomSnapshot, onSnapshot);
    socket.on(socketEvents.roomError, onError);
    return () => {
      socket.off(socketEvents.roomSnapshot, onSnapshot);
      socket.off(socketEvents.roomError, onError);
    };
  }, [roomId, socket]);

  if (!snapshot) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>正在恢复房间...</h1>
          {error && <p className="error-text">{error}</p>}
        </section>
      </main>
    );
  }

  const isHost = snapshot.hostId === snapshot.selfId;
  return (
    <GameShell
      snapshot={snapshot}
      error={error}
      roomId={roomId}
      isHost={isHost}
      onAssignRole={(playerId, role) => socket.emit(socketEvents.roomAssignRole, { roomId, playerId, role })}
      onStart={() => socket.emit(socketEvents.gameStart, { roomId })}
      onRestart={() => socket.emit(socketEvents.gameRestart, { roomId })}
      onGuess={(cardId) => socket.emit(socketEvents.gameGuessCard, { roomId, cardId })}
      onSubmitClue={(clue, count) => socket.emit(socketEvents.gameSubmitClue, { roomId, clue, count })}
      onEndTurn={() => socket.emit(socketEvents.gameEndTurn, { roomId })}
      onUpdateConfig={(config) => socket.emit(socketEvents.roomUpdateConfig, { roomId, config })}
    />
  );
}

function DemoPage() {
  const snapshot = useDemoSnapshot();
  const navigate = useNavigate();

  return (
    <GameShell
      snapshot={snapshot}
      error=""
      roomId="DEMO"
      isHost
      onAssignRole={() => {}}
      onStart={() => {}}
      onRestart={() => navigate("/demo", { replace: true })}
      onGuess={() => {}}
      onSubmitClue={() => {}}
      onEndTurn={() => {}}
      onUpdateConfig={() => {}}
    />
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
