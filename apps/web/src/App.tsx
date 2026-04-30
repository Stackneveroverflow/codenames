import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import type { ActivityEntry, CardOwner, PlayerRole, PlayerViewSnapshot } from "@codenames/shared";
import { socketEvents } from "@codenames/shared";

import { ActivityLog } from "./components/ActivityLog";
import { Board } from "./components/Board";
import { RolePanel } from "./components/RolePanel";
import { getSocket } from "./lib/socket";

const storageKey = "codenames-online:identity";

type StoredIdentity = Record<string, { playerId: string }>;

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
    config: { locale: "zh-CN", deckMode: "fallback", boardSize: "classic" },
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
  onUpdateConfig: (deckMode: "ai" | "fallback") => void;
}) {
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
            <label className="config-row">
              <span>AI 发牌</span>
              <input
                checked={snapshot.config.deckMode === "ai"}
                disabled={!isHost}
                onChange={(event) => onUpdateConfig(event.target.checked ? "ai" : "fallback")}
                type="checkbox"
              />
            </label>
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
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

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
    <main className="hero-page">
      <section className="hero-card hero-card--mobile">
        <div className="hero-mobile-shell">
          <header className="hero-mobile-top">
            <div className="hero-status-pill">微信小游戏风格 H5</div>
            <button type="button" className="hero-link" onClick={() => setRulesOpen(true)}>
              玩法说明
            </button>
          </header>

          <section className="hero-banner" aria-hidden="true">
            <div className="hero-banner__glow hero-banner__glow--red" />
            <div className="hero-banner__glow hero-banner__glow--blue" />
            <div className="hero-banner__content">
              <p className="hero-banner__eyebrow">情报局联机行动</p>
              <h1>行动代号</h1>
              <p className="hero-banner__subtitle">中文猜词对抗，开房即玩</p>
            </div>
            <div className="hero-banner__board">
              {["海港", "纸鹤", "灯塔", "星图", "密钥", "列车", "雪线", "罗盘", "黑曜石"].map((word, index) => (
                <span key={word} className={`hero-banner__tile hero-banner__tile--${index === 8 ? "assassin" : index % 3 === 0 ? "red" : index % 3 === 1 ? "blue" : "neutral"}`}>
                  {word}
                </span>
              ))}
            </div>
            <div className="hero-banner__chips">
              <span className="hero-banner__chip hero-banner__chip--red">红队先手</span>
              <span className="hero-banner__chip hero-banner__chip--blue">5x5 牌盘</span>
            </div>
          </section>

          <section className="hero-brief">
            <div className="hero-brief__item">
              <strong>2 队</strong>
              <span>实时联机</span>
            </div>
            <div className="hero-brief__item">
              <strong>Demo</strong>
              <span>快速体验</span>
            </div>
            <div className="hero-brief__item">
              <strong>重连</strong>
              <span>回房继续</span>
            </div>
          </section>

          <section className="launch-panel launch-panel--mobile">
            <div className="launch-panel__header launch-panel__header--stacked">
              <div>
                <p className="eyebrow">开始行动</p>
                <h2>输入昵称后开局</h2>
              </div>
              <span className="launch-badge">Lobby</span>
            </div>
            <div className="launch-field">
              <label className="field-label" htmlFor="nickname">
                行动代号
              </label>
              <input id="nickname" placeholder="输入你的昵称" value={nickname} onChange={(event) => setNickname(event.target.value)} />
            </div>
            <button className="primary-action primary-action--large" type="button" onClick={() => socket.emit(socketEvents.roomCreate, { nickname })} disabled={!nickname.trim()}>
              开始游戏
            </button>
            <div className="hero-sub-actions">
              <button type="button" className="ghost ghost--mobile" onClick={() => setJoinOpen((open) => !open)}>
                {joinOpen ? "收起房间码" : "加入房间"}
              </button>
              <button type="button" className="demo-action" onClick={() => navigate("/demo")}>
                试玩 Demo
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
                  disabled={!nickname.trim() || !joinCode.trim()}
                >
                  确认加入
                </button>
              </div>
            )}

            <div className="hero-footnote">支持中文线索、队长视角、自动发牌与断线重连。</div>
            {error && <p className="error-text">{error}</p>}
          </section>
        </div>
      </section>

      {rulesOpen && (
        <section className="rules-overlay" role="dialog" aria-modal="true" aria-label="游戏规则说明">
          <div className="rules-card rules-card--sheet">
            <div className="panel-header">
              <div>
                <p className="eyebrow">图文规则</p>
                <h2>一分钟看懂怎么玩</h2>
              </div>
              <button type="button" className="ghost" onClick={() => setRulesOpen(false)}>
                关闭
              </button>
            </div>
            <div className="rules-grid">
              <article className="rule-figure">
                <div className="rule-icon rule-icon--red">A</div>
                <h3>1. 队长给线索</h3>
                <p>每回合只说一个词和一个数字，例如“海洋 2”，提示队员去找同阵营的词。</p>
              </article>
              <article className="rule-figure">
                <div className="rule-icon rule-icon--blue">B</div>
                <h3>2. 队员依次猜词</h3>
                <p>可以连续猜到数字上限，也可以提前停手。猜中自己队伍会加分，碰到别的阵营会结束回合。</p>
              </article>
              <article className="rule-figure">
                <div className="rule-icon rule-icon--neutral">中</div>
                <h3>3. 中立词会打断节奏</h3>
                <p>翻到中立词不会直接失败，但会把回合带偏。刺客词一旦翻开，游戏立刻结束。</p>
              </article>
              <article className="rule-figure">
                <div className="rule-icon rule-icon--assassin">X</div>
                <h3>4. 先找齐目标的一方获胜</h3>
                <p>谁先把自己的所有情报卡翻完，谁就赢。队长和队员视图不同，只有队长能看到阵营分布。</p>
              </article>
            </div>
            <div className="rules-strip">
              <span>队长视图</span>
              <span>队员视图</span>
              <span>AI 发牌失败会自动回落本地词库</span>
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
      onUpdateConfig={(deckMode) => socket.emit(socketEvents.roomUpdateConfig, { roomId, config: { deckMode } })}
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
