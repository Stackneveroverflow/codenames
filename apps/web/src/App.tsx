import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import type { PlayerRole, PlayerViewSnapshot } from "@codenames/shared";
import { socketEvents } from "@codenames/shared";

import { ActivityLog } from "./components/ActivityLog";
import { Board } from "./components/Board";
import { RolePanel } from "./components/RolePanel";
import { getSocket } from "./lib/socket";

const storageKey = "codenames-online:identity";

type StoredIdentity = Record<string, { playerId: string }>;

function readIdentity(roomId: string) {
  const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as StoredIdentity;
  return parsed[roomId];
}

function saveIdentity(roomId: string, playerId: string) {
  const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as StoredIdentity;
  parsed[roomId] = { playerId };
  localStorage.setItem(storageKey, JSON.stringify(parsed));
}

function HomePage() {
  const navigate = useNavigate();
  const socket = getSocket();
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

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
      <section className="hero-card">
        <p className="eyebrow">情报档案室</p>
        <h1>匿名建房，AI 发牌，中文 Codenames 直接开局</h1>
        <p className="hero-copy">一键建私密房间，用昵称进场，队长给线索，队员连猜到翻车为止。</p>
        <div className="hero-actions">
          <input placeholder="你的昵称" value={nickname} onChange={(event) => setNickname(event.target.value)} />
          <button type="button" onClick={() => socket.emit(socketEvents.roomCreate, { nickname })} disabled={!nickname.trim()}>
            一键建房
          </button>
        </div>
        <div className="join-row">
          <input placeholder="输入房间码" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} />
          <button
            type="button"
            onClick={() => socket.emit(socketEvents.roomJoin, { roomId: joinCode, nickname })}
            disabled={!nickname.trim() || !joinCode.trim()}
          >
            加入房间
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}

function RoomPage() {
  const { roomId = "" } = useParams();
  const socket = getSocket();
  const [snapshot, setSnapshot] = useState<PlayerViewSnapshot | null>(null);
  const [error, setError] = useState("");
  const [clue, setClue] = useState("");
  const [count, setCount] = useState("1");

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
  const canSubmitClue =
    snapshot.phase === "in_round" &&
    snapshot.turn?.phase === "clue" &&
    ((snapshot.turn.team === "red" && snapshot.selfRole === "red_spymaster") ||
      (snapshot.turn.team === "blue" && snapshot.selfRole === "blue_spymaster"));

  const score = {
    red: snapshot.board?.filter((card) => card.revealed && card.owner === "red").length ?? 0,
    blue: snapshot.board?.filter((card) => card.revealed && card.owner === "blue").length ?? 0,
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">房间 {snapshot.roomId}</p>
          <h1>{snapshot.phase === "lobby" ? "大厅准备" : snapshot.phase === "finished" ? "结算" : "对局进行中"}</h1>
        </div>
        <div className="scoreboard">
          <div className="score score--red">红队 {score.red}</div>
          <div className="score score--blue">蓝队 {score.blue}</div>
          <div className="turn-pill">{snapshot.turn ? `${snapshot.turn.team === "red" ? "红队" : "蓝队"} · ${snapshot.turn.phase === "clue" ? "出线索" : "猜词"}` : "待开始"}</div>
        </div>
      </header>

      <section className="layout">
        <div className="layout-side">
          <RolePanel
            snapshot={snapshot}
            onAssignRole={(playerId, role: PlayerRole) => socket.emit(socketEvents.roomAssignRole, { roomId, playerId, role })}
          />
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
                onChange={(event) =>
                  socket.emit(socketEvents.roomUpdateConfig, {
                    roomId,
                    config: { deckMode: event.target.checked ? "ai" : "fallback" },
                  })
                }
                type="checkbox"
              />
            </label>
            <div className="button-row">
              <button type="button" disabled={!isHost} onClick={() => socket.emit(socketEvents.gameStart, { roomId })}>
                开始对局
              </button>
              <button type="button" className="ghost" disabled={!isHost} onClick={() => socket.emit(socketEvents.gameRestart, { roomId })}>
                再来一局
              </button>
            </div>
            <p className="help-text">队长看到阵营信息，队员只看到已翻开的结果。AI 失败会自动回落到本地词库。</p>
          </section>
        </div>

        <div className="layout-main">
          <Board snapshot={snapshot} onGuess={(cardId) => socket.emit(socketEvents.gameGuessCard, { roomId, cardId })} />
          <section className="panel clue-panel">
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
            <div className="clue-form">
              <input placeholder="线索词" value={clue} onChange={(event) => setClue(event.target.value)} />
              <input placeholder="数字" value={count} onChange={(event) => setCount(event.target.value)} />
              <button
                type="button"
                disabled={!canSubmitClue || !clue.trim()}
                onClick={() => socket.emit(socketEvents.gameSubmitClue, { roomId, clue, count: Number(count) || 0 })}
              >
                提交线索
              </button>
              <button
                type="button"
                className="ghost"
                disabled={!(snapshot.phase === "in_round" && snapshot.turn?.phase === "guess")}
                onClick={() => socket.emit(socketEvents.gameEndTurn, { roomId })}
              >
                结束回合
              </button>
            </div>
            {snapshot.winner && <div className="winner-banner">{snapshot.winner.team === "red" ? "红队" : "蓝队"} 胜利</div>}
            {error && <p className="error-text">{error}</p>}
          </section>
        </div>

        <div className="layout-side">
          <ActivityLog snapshot={snapshot} />
        </div>
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

