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
    <main className="app-container">
      <section className="hero-banner">
        <p className="eyebrow">情报档案室</p>
        <h1 className="hero-banner__title">代号行动</h1>
        <p className="hero-banner__subtitle">匿名建房 · AI 发牌 · 中文 Codenames</p>
      </section>

      <section className="launch-panel">
        <div className="launch-field">
          <label>代号名称</label>
          <input 
            placeholder="输入你的代号" 
            value={nickname} 
            onChange={(event) => setNickname(event.target.value)} 
          />
        </div>
        
        <button 
          type="button" 
          className="btn-primary btn-large" 
          onClick={() => socket.emit(socketEvents.roomCreate, { nickname })} 
          disabled={!nickname.trim()}
        >
          发起行动
        </button>
        
        <div className="join-sheet">
          <div className="launch-field">
            <label>房间密钥</label>
            <input 
              placeholder="输入房间码" 
              value={joinCode} 
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())} 
            />
          </div>
          <button
            type="button"
            className="btn-secondary btn-large"
            onClick={() => socket.emit(socketEvents.roomJoin, { roomId: joinCode, nickname })}
            disabled={!nickname.trim() || !joinCode.trim()}
          >
            加入房间
          </button>
        </div>
        
        {error && <p className="error-text">{error}</p>}
        
        <div className="hero-sub-actions">
          <button type="button" className="btn-ghost" onClick={() => navigate('/demo')}>
            试玩 DEMO
          </button>
          <button type="button" className="btn-ghost" onClick={() => alert('任务说明')}>
            任务说明
          </button>
        </div>
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
      <main className="app-container">
        <button className="btn-back" onClick={() => window.location.href = '/'}>← 返回首页</button>
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
    <main className="app-container">
      <button className="btn-back" onClick={() => window.location.href = '/'}>← 返回首页</button>
      
      <section className="hero-banner">
        <p className="eyebrow">房间 {snapshot.roomId}</p>
        <h1 className="hero-banner__title">
          {snapshot.phase === "lobby" ? "大厅准备" : snapshot.phase === "finished" ? "任务完成" : "代号行动"}
        </h1>
        <p className="hero-banner__subtitle">
          {snapshot.turn 
            ? `${snapshot.turn.team === "red" ? "红队" : "蓝队"} · ${snapshot.turn.phase === "clue" ? "等待线索" : "猜词中"}`
            : "等待开始"}
        </p>
      </section>

      <div className="scoreboard">
        <div className="score score--red">红队 {score.red}</div>
        <div className="score score--blue">蓝队 {score.blue}</div>
      </div>

      <Board snapshot={snapshot} onGuess={(cardId) => socket.emit(socketEvents.gameGuessCard, { roomId, cardId })} />

      {snapshot.phase !== "lobby" && (
        <section className="clue-panel">
          <div className="clue-panel__header">
            <div>
              <p className="eyebrow">情报中心</p>
              <h2>线索与操作</h2>
            </div>
          </div>
          
          <div className="clue-panel__status">
            <div className="clue-panel__clue">
              {snapshot.turn?.clue 
                ? `${snapshot.turn.clue.clue} ${snapshot.turn.clue.count}`
                : "等待队长提交线索"}
            </div>
            <div className="clue-panel__count">
              {snapshot.turn?.clue 
                ? `剩余猜测 ${snapshot.turn.clue.guessesRemaining}`
                : "当前没有进行中的行动"}
            </div>
          </div>

          {canSubmitClue && (
            <div className="clue-form">
              <input 
                placeholder="输入线索词" 
                value={clue} 
                onChange={(e) => setClue(e.target.value)} 
              />
              <input 
                placeholder="数字" 
                type="number" 
                min="1" 
                max="9" 
                value={count} 
                onChange={(e) => setCount(e.target.value)} 
              />
              <button 
                type="button" 
                className="btn-primary" 
                disabled={!clue.trim()}
                onClick={() => {
                  socket.emit(socketEvents.gameSubmitClue, { roomId, clue: clue.trim(), count: parseInt(count) });
                  setClue("");
                  setCount("1");
                }}
              >
                发送情报
              </button>
            </div>
          )}

          {snapshot.turn?.phase === "guess" && snapshot.selfRole !== "red_spymaster" && snapshot.selfRole !== "blue_spymaster" && (
            <button 
              type="button" 
              className="btn-secondary btn-large"
              onClick={() => socket.emit(socketEvents.gameEndTurn, { roomId })}
            >
              结束回合
            </button>
          )}
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">特勤局</p>
            <h2>角色分配</h2>
          </div>
        </div>
        <RolePanel
          snapshot={snapshot}
          onAssignRole={(playerId, role: PlayerRole) => socket.emit(socketEvents.roomAssignRole, { roomId, playerId, role })}
        />
      </section>

      {isHost && (
        <section className="launch-panel">
          <div className="launch-panel__header">
            <div>
              <p className="eyebrow">指挥官</p>
              <h2 className="launch-panel__title">房主操作</h2>
            </div>
          </div>

          <div className="config-row">
            <label>AI 发牌</label>
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
          </div>

          <div className="game-controls">
            <button 
              type="button" 
              className="btn-primary btn-large" 
              disabled={!isHost} 
              onClick={() => socket.emit(socketEvents.gameStart, { roomId })}
            >
              开始行动
            </button>
            <button 
              type="button" 
              className="btn-ghost btn-large" 
              disabled={!isHost} 
              onClick={() => socket.emit(socketEvents.gameRestart, { roomId })}
            >
              再来一局
            </button>
          </div>

          <p className="help-text">队长看到阵营信息，队员只看到已翻开的结果。AI 失败会自动回落到本地词库。</p>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">情报记录</p>
            <h2>活动日志</h2>
          </div>
        </div>
        <ActivityLog snapshot={snapshot} />
      </section>

      {snapshot.phase === "finished" && (
        <section className={`winner-banner winner-banner--${snapshot.winner}`}>
          <div className="winner-banner__text">
            {snapshot.winner === "red" ? "红队完成使命" : snapshot.winner === "blue" ? "蓝队完成使命" : "平局"}
          </div>
        </section>
      )}
    </main>
  );
}

function DemoPage() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<PlayerViewSnapshot | null>(null);

  useEffect(() => {
    getSocket().emit(socketEvents.roomCreate, { nickname: "指挥官" });

    function onSnapshot(next: PlayerViewSnapshot) {
      setSnapshot(next);
      if (next.phase === "lobby") {
        getSocket().emit(socketEvents.gameStart, { roomId: next.roomId });
      }
    }

    getSocket().on(socketEvents.roomSnapshot, onSnapshot);
    return () => {
      getSocket().off(socketEvents.roomSnapshot, onSnapshot);
    };
  }, []);

  if (!snapshot) {
    return (
      <main className="app-container">
        <button className="btn-back" onClick={() => navigate('/')}>← 返回首页</button>
        <section className="panel">
          <h1>正在初始化演示...</h1>
        </section>
      </main>
    );
  }

  const score = {
    red: snapshot.board?.filter((card) => card.revealed && card.owner === "red").length ?? 0,
    blue: snapshot.board?.filter((card) => card.revealed && card.owner === "blue").length ?? 0,
  };

  return (
    <main className="app-container">
      <button className="btn-back" onClick={() => navigate('/')}>← 返回首页</button>
      
      <section className="hero-banner">
        <p className="eyebrow">战术演示</p>
        <h1 className="hero-banner__title">5 x 5 行动网格</h1>
        <p className="hero-banner__subtitle">这是演示模式，用于熟悉操作</p>
      </section>

      <div className="scoreboard">
        <div className="score score--red">红队 {score.red}</div>
        <div className="score score--blue">蓝队 {score.blue}</div>
      </div>

      <Board snapshot={snapshot} onGuess={(cardId) => getSocket().emit(socketEvents.gameGuessCard, { roomId: snapshot.roomId, cardId })} />

      <section className="clue-panel">
        <div className="clue-panel__header">
          <div>
            <p className="eyebrow">情报中心</p>
            <h2>线索与操作</h2>
          </div>
        </div>
        
        <div className="clue-panel__status">
          <div className="clue-panel__clue">
            {snapshot.turn?.clue 
              ? `${snapshot.turn.clue.clue} ${snapshot.turn.clue.count}`
              : "等待线索"}
          </div>
          <div className="clue-panel__count">
            {snapshot.turn?.clue 
              ? `剩余猜测 ${snapshot.turn.clue.guessesRemaining}`
              : "演示模式"}
          </div>
        </div>
      </section>

      <section className="launch-panel">
        <div className="launch-panel__header">
          <div>
            <p className="eyebrow">指挥官</p>
            <h2 className="launch-panel__title">房主操作</h2>
          </div>
        </div>

        <div className="game-controls">
          <button 
            type="button" 
            className="btn-primary btn-large" 
            onClick={() => navigate('/')}
          >
            回到首页
          </button>
          <button 
            type="button" 
            className="btn-ghost btn-large" 
            onClick={() => window.location.reload()}
          >
            再来一局
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">情报记录</p>
            <h2>活动日志</h2>
          </div>
        </div>
        <ActivityLog snapshot={snapshot} />
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<HomePage />} path="/" />
      <Route element={<RoomPage />} path="/room/:roomId" />
      <Route element={<DemoPage />} path="/demo" />
      <Route element={<Navigate to="/" />} path="*" />
    </Routes>
  );
}
