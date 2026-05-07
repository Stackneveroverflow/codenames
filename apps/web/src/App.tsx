import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import type { CardOwner, GameMode, KeyCellState, PlayerRole, PlayerState, PlayerViewSnapshot, RoomConfig, TeamName, TeamSize } from "@codenames/shared";
import { socketEvents } from "@codenames/shared";

import { IconButton, icons } from "./components/IconButton";
import { PhaserBoardEffects } from "./components/PhaserBoardEffects";
import { useGsapEntrance } from "./hooks/useGsapEntrance";
import { playSound } from "./lib/audio";
import { getServerUrl, getSocket } from "./lib/socket";

const storageKey = "codenames-dealer:identity";

type StoredIdentity = Record<string, { playerId: string }>;
type HomeStep = "home" | "mode" | "headcount" | "join";
type BoardTab = "public" | "key";
type HostInfo = { port: number; localUrl: string; lanUrls: string[] };

const nicknameParts = ["灯塔", "纸鹤", "北风", "旧桥", "风铃", "墨砚", "茶盏", "星图", "港湾", "罗盘", "青灯", "火漆"];
const teamSizeOptions: TeamSize[] = [4, 5, 6, 7, 8, 9, 10];

const modeLabels: Record<GameMode, string> = {
  text: "文字情报",
  image: "影像情报",
};

const ownerLabels: Record<CardOwner, string> = {
  red: "红队",
  blue: "蓝队",
  neutral: "平民",
  assassin: "刺客",
};

const teamLabels: Record<TeamName, string> = {
  red: "红队",
  blue: "蓝队",
};

function roleLabel(role: PlayerRole) {
  const labels: Record<PlayerRole, string> = {
    host: "房主",
    red_spymaster: "红队队长",
    red_operatives: "红队队员",
    blue_spymaster: "蓝队队长",
    blue_operatives: "蓝队队员",
    spectator: "旁观",
  };
  return labels[role];
}

function generateNickname() {
  return nicknameParts[Math.floor(Math.random() * nicknameParts.length)] ?? "灯塔";
}

function readIdentity(roomId: string) {
  const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as StoredIdentity;
  return parsed[roomId];
}

function saveIdentity(roomId: string, playerId: string) {
  const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as StoredIdentity;
  parsed[roomId] = { playerId };
  sessionStorage.setItem(storageKey, JSON.stringify(parsed));
}

function useDebouncedAction(delay = 180) {
  const lastRun = useRef(0);

  return useCallback(
    (action: () => void, tone: "tap" | "deal" | "score" | "danger" = "tap") => {
      const now = Date.now();
      if (now - lastRun.current < delay) {
        return;
      }
      lastRun.current = now;
      playSound(tone);
      action();
    },
    [delay],
  );
}

function useHostInfo() {
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${getServerUrl()}/host-info`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: HostInfo | null) => {
        if (active) {
          setHostInfo(payload);
        }
      })
      .catch(() => {
        if (active) {
          setHostInfo(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return hostInfo;
}

function openDemoWindow(roomId?: string) {
  const target = roomId ? `/?join=${roomId}` : "/";
  window.open(target, "_blank", "popup,width=430,height=900");
}

function boardColumns() {
  return 5;
}

function keyForCard(keyGrid: KeyCellState[] | null | undefined, cardId: string) {
  return keyGrid?.find((cell) => cell.cardId === cardId)?.owner;
}

function canViewKey(snapshot: PlayerViewSnapshot) {
  return Boolean(snapshot.keyGrid);
}

function nicknameFor(snapshot: PlayerViewSnapshot, playerId: string | null | undefined) {
  if (!playerId) {
    return "无人";
  }
  return snapshot.players.find((player) => player.id === playerId)?.nickname ?? "未知玩家";
}

function teamPlayers(snapshot: PlayerViewSnapshot, team: TeamName) {
  return snapshot.players.filter((player) => player.role === `${team}_spymaster` || player.role === `${team}_operatives`);
}

function playerMeta(snapshot: PlayerViewSnapshot, player: PlayerState) {
  const tags = [roleLabel(player.role), player.online ? "在线" : "离线"];
  if (snapshot.selfId === player.id) {
    tags.push("你");
  }
  if (snapshot.hostId === player.id) {
    tags.push("房主");
  }
  return tags.join(" · ");
}

function HomePage() {
  const scopeRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const socket = getSocket();
  const hostInfo = useHostInfo();
  const [step, setStep] = useState<HomeStep>("home");
  const [nickname, setNickname] = useState(generateNickname);
  const [joinCode, setJoinCode] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("text");
  const [teamSize, setTeamSize] = useState<TeamSize>(4);
  const [error, setError] = useState("");
  const runAction = useDebouncedAction();
  useGsapEntrance(scopeRef, step);

  useEffect(() => {
    const roomToJoin = new URLSearchParams(window.location.search).get("join");
    if (roomToJoin) {
      setJoinCode(roomToJoin.toUpperCase());
      setStep("join");
    }
  }, []);

  useEffect(() => {
    function onSnapshot(snapshot: PlayerViewSnapshot) {
      saveIdentity(snapshot.roomId, snapshot.selfId);
      navigate(`/room/${snapshot.roomId}`);
    }

    function onError(payload: { message: string }) {
      setError(payload.message);
      playSound("danger");
    }

    socket.on(socketEvents.roomSnapshot, onSnapshot);
    socket.on(socketEvents.roomError, onError);
    return () => {
      socket.off(socketEvents.roomSnapshot, onSnapshot);
      socket.off(socketEvents.roomError, onError);
    };
  }, [navigate, socket]);

  function createRoom() {
    socket.emit(socketEvents.roomCreate, { nickname, config: { gameMode, teamSize } });
  }

  function joinRoom() {
    socket.emit(socketEvents.roomJoin, { roomId: joinCode.trim().toUpperCase(), nickname });
  }

  return (
    <Shell scopeRef={scopeRef}>
      <TopBar
        label="潜入频道"
        actionLabel={nickname}
        onAction={() => runAction(() => setNickname(generateNickname()), "score")}
      />

      {step === "home" && (
        <section className="home-screen">
          <div className="hero-copy" data-animate="panel">
            <p className="eyebrow">Cinematic Party Game</p>
            <h1>行动代号</h1>
            <p className="caption">开启一场中文线索对抗。房主发牌，队长掌握答案，队员只看到公共牌阵。</p>
          </div>
          <MissionPreview />
          <div className="home-actions" data-animate="panel">
            <IconButton icon={icons.deal} label="创建任务" className="primary action-button" onClick={() => runAction(() => setStep("mode"), "deal")} />
            <IconButton icon={icons.key} label="加入房间" className="secondary action-button" onClick={() => runAction(() => setStep("join"))} />
          </div>
          <HostPanel hostInfo={hostInfo} compact />
        </section>
      )}

      {step === "mode" && (
        <section className="stack-screen">
          <ScreenTitle title="选择情报载体" note="文字局更像经典 Codenames；影像局更适合沉浸演示。" />
          <div className="mode-list">
            <ModeCard active={gameMode === "text"} image="/mode-text.jpg" title="文字情报" note="5 x 5 中文词阵" onClick={() => runAction(() => setGameMode("text"), "score")} />
            <ModeCard active={gameMode === "image"} image="/mode-image.jpg" title="影像情报" note="5 x 4 图片任务牌" onClick={() => runAction(() => setGameMode("image"), "score")} />
            <button type="button" className="mode-card mode-card--disabled" disabled data-animate="card">
              <span>二重奏行动</span>
              <strong>后续版本开放</strong>
            </button>
          </div>
          <FooterNav back={() => runAction(() => setStep("home"))} next={() => runAction(() => setStep("headcount"))} />
        </section>
      )}

      {step === "headcount" && (
        <section className="stack-screen">
          <ScreenTitle title="配置行动小队" note="选择本局参与人数。系统优先本地牌库，避免桌边等待。" />
          <StatusCard label="当前模式" value={modeLabels[gameMode]} />
          <div className="headcount-grid" data-animate="panel">
            {teamSizeOptions.map((size) => (
              <button key={size} type="button" className={`count-tile${teamSize === size ? " count-tile--active" : ""}`} onClick={() => runAction(() => setTeamSize(size), "score")} data-animate="card">
                <span>{size}</span>
                <small>人</small>
              </button>
            ))}
          </div>
          <DeckCard />
          {error && <ErrorText message={error} />}
          <FooterNav back={() => runAction(() => setStep("mode"))} next={() => runAction(createRoom, "deal")} nextLabel="创建房间" />
        </section>
      )}

      {step === "join" && (
        <section className="stack-screen">
          <ScreenTitle title="接入行动频道" note="输入房主分享的房间码，加入后会自动恢复身份。" />
          <label className="input-field">
            <span>房间码</span>
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="E5NOM" maxLength={8} />
          </label>
          <label className="input-field">
            <span>代号昵称</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="你的代号" maxLength={20} />
          </label>
          <GuideCard items={["房间码不区分大小写", "队长答案只在授权账号显示", "断线后会尝试恢复当前身份"]} />
          {error && <ErrorText message={error} />}
          <FooterNav back={() => runAction(() => setStep("home"))} next={() => runAction(joinRoom, "deal")} nextLabel="加入房间" nextDisabled={!joinCode.trim() || !nickname.trim()} />
        </section>
      )}
    </Shell>
  );
}

function Shell({ children, scopeRef }: { children: React.ReactNode; scopeRef?: React.RefObject<HTMLElement | null> }) {
  return (
    <main className="app-stage">
      <section ref={scopeRef} className="app-shell">
        <div className="cinema-bg" />
        <div className="scanline" />
        {children}
      </section>
    </main>
  );
}

function TopBar({ label, actionLabel, onAction }: { label: string; actionLabel: string; onAction: () => void }) {
  return (
    <header className="top-bar">
      <span className="signal-chip">{label}</span>
      <IconButton icon={icons.refresh} label={actionLabel} className="ghost-button top-button" onClick={onAction} />
    </header>
  );
}

function MissionPreview() {
  const cells = ["海港", "纸鹤", "灯塔", "星图", "密钥", "列车", "雪线", "罗盘", "黑曜石"];
  return (
    <div className="mission-preview" data-animate="panel" aria-hidden="true">
      <div className="radar-ring" />
      <div className="preview-grid">
        {cells.map((cell, index) => (
          <span key={cell} className={index % 5 === 0 ? "preview-red" : index % 4 === 0 ? "preview-dark" : index % 2 === 0 ? "preview-blue" : ""}>
            {cell}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-card" data-animate="panel">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DeckCard() {
  return (
    <div className="deck-card" data-animate="panel">
      <img src="/deck-cover.jpg" alt="" />
      <div>
        <span>牌库状态</span>
        <strong>本地情报牌库就绪</strong>
        <p>无 API Key 时仍可直接开局。</p>
      </div>
    </div>
  );
}

function GuideCard({ items }: { items: string[] }) {
  return (
    <aside className="guide-card" data-animate="panel">
      <span>行动提示</span>
      <ol>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </aside>
  );
}

function ScreenTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="screen-title" data-animate="panel">
      <p className="eyebrow">Mission Setup</p>
      <h1>{title}</h1>
      <p className="caption">{note}</p>
    </div>
  );
}

function HostPanel({ hostInfo, compact = false }: { hostInfo: HostInfo | null; compact?: boolean }) {
  const lanUrl = hostInfo?.lanUrls[0];

  return (
    <section className={compact ? "host-panel host-panel--compact" : "host-panel"} data-animate="panel">
      <div>
        <span>房主服务器</span>
        <strong>{lanUrl ?? hostInfo?.localUrl ?? "开发服务器"}</strong>
      </div>
      <IconButton icon={icons.demo} label="演示" className="ghost-button small-button" onClick={() => {
        playSound();
        openDemoWindow();
      }} />
    </section>
  );
}

function ModeCard({ active, image, title, note, onClick }: { active: boolean; image: string; title: string; note: string; onClick: () => void }) {
  return (
    <button type="button" className={`mode-card${active ? " mode-card--active" : ""}`} onClick={onClick} data-animate="card">
      <img src={image} alt="" />
      <span>{title}</span>
      <strong>{note}</strong>
    </button>
  );
}

function FooterNav({
  back,
  next,
  nextLabel = "下一步",
  nextDisabled = false,
}: {
  back: () => void;
  next: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <footer className="footer-nav">
      <IconButton icon={icons.back} label="返回" className="secondary action-button" onClick={back} />
      <IconButton icon={nextLabel === "创建房间" ? icons.deal : icons.magic} label={nextLabel} className="primary action-button" disabled={nextDisabled} onClick={next} />
    </footer>
  );
}

function ErrorText({ message }: { message: string }) {
  return <p className="error-text">{message}</p>;
}

function RoomPage() {
  const scopeRef = useRef<HTMLElement | null>(null);
  const { roomId = "" } = useParams();
  const socket = getSocket();
  const hostInfo = useHostInfo();
  const [snapshot, setSnapshot] = useState<PlayerViewSnapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<BoardTab>("public");
  const runAction = useDebouncedAction();
  useGsapEntrance(scopeRef, `${snapshot?.phase ?? "loading"}-${tab}`);

  useEffect(() => {
    const identity = readIdentity(roomId);
    if (identity?.playerId) {
      socket.emit(socketEvents.roomRejoin, { roomId, playerId: identity.playerId });
    }

    function onSnapshot(next: PlayerViewSnapshot) {
      saveIdentity(next.roomId, next.selfId);
      setSnapshot(next);
      setError("");
      if (!next.keyGrid) {
        setTab("public");
      }
    }

    function onError(payload: { message: string }) {
      setError(payload.message);
      playSound("danger");
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
      <Shell>
        <section className="loading-screen">
          <span className="loader-ring" />
          <p>正在恢复行动频道...</p>
          {error && <ErrorText message={error} />}
        </section>
      </Shell>
    );
  }

  const isHost = snapshot.hostId === snapshot.selfId;
  const onlineCount = snapshot.players.filter((player) => player.online).length;

  return (
    <Shell scopeRef={scopeRef}>
      <header className="room-header">
        <div>
          <p className="eyebrow">Room Code</p>
          <h1>{snapshot.roomId}</h1>
        </div>
        <span className="status-pill">{snapshot.phase === "dealt" ? "已发牌" : "集结中"}</span>
      </header>

      {snapshot.phase === "lobby" ? (
        <WaitingRoom
          snapshot={snapshot}
          onlineCount={onlineCount}
          isHost={isHost}
          error={error}
          hostInfo={hostInfo}
          onStart={() => runAction(() => socket.emit(socketEvents.gameStart, { roomId }), "deal")}
          onUpdateConfig={(config) => socket.emit(socketEvents.roomUpdateConfig, { roomId, config })}
        />
      ) : (
        <BoardRoom
          snapshot={snapshot}
          tab={tab}
          setTab={(nextTab) => runAction(() => setTab(nextTab))}
          isHost={isHost}
          error={error}
          onRestart={() => runAction(() => socket.emit(socketEvents.gameRestart, { roomId }), "deal")}
          onSubmitClue={(clue, count) => runAction(() => socket.emit(socketEvents.gameSubmitClue, { roomId, clue, count }), "score")}
          onGuessCard={(cardId) => runAction(() => socket.emit(socketEvents.gameGuessCard, { roomId, cardId }), "tap")}
          onEndTurn={() => runAction(() => socket.emit(socketEvents.gameEndTurn, { roomId }), "score")}
        />
      )}
    </Shell>
  );
}

function WaitingRoom({
  snapshot,
  onlineCount,
  isHost,
  error,
  hostInfo,
  onStart,
  onUpdateConfig,
}: {
  snapshot: PlayerViewSnapshot;
  onlineCount: number;
  isHost: boolean;
  error: string;
  hostInfo: HostInfo | null;
  onStart: () => void;
  onUpdateConfig: (config: Partial<RoomConfig>) => void;
}) {
  return (
    <section className="lobby-screen">
      <div className="lobby-stats" data-animate="panel">
        <StatusCard label="在线成员" value={`${onlineCount} / ${snapshot.config.teamSize}`} />
        <StatusCard label="行动模式" value={modeLabels[snapshot.config.gameMode]} />
      </div>
      <HostPanel hostInfo={hostInfo} />
      <IconButton icon={icons.demo} label="打开本机玩家窗口" className="secondary action-button full-width" onClick={() => {
        playSound();
        openDemoWindow(snapshot.roomId);
      }} />
      <div className="player-grid">
        {Array.from({ length: snapshot.config.teamSize }, (_, index) => {
          const player = snapshot.players[index];
          return (
            <article key={player?.id ?? index} className={`player-slot${player ? "" : " player-slot--empty"}`} data-animate="card">
              <img src="/avatar-agent.jpg" alt="" />
              <span>{player?.nickname ?? "邀请位"}</span>
              <small>{player ? playerMeta(snapshot, player) : "等待接入"}</small>
            </article>
          );
        })}
      </div>
      <div className="setting-row">
        <label className="input-field">
          <span>模式</span>
          <select disabled={!isHost} value={snapshot.config.gameMode} onChange={(event) => onUpdateConfig({ gameMode: event.target.value as GameMode })}>
            <option value="text">文字情报</option>
            <option value="image">影像情报</option>
          </select>
        </label>
        <label className="input-field">
          <span>人数</span>
          <select disabled={!isHost} value={snapshot.config.teamSize} onChange={(event) => onUpdateConfig({ teamSize: Number(event.target.value) as TeamSize })}>
            {teamSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} 人
              </option>
            ))}
          </select>
        </label>
      </div>
      <GuideCard items={["所有人到齐后由房主发牌", "开局后系统随机分配红蓝队和队长", "只有队长账号可见关键答案"]} />
      {error && <ErrorText message={error} />}
      <IconButton icon={icons.deal} label={isHost ? "开始发牌" : "等待房主发牌"} className="primary action-button full-width sticky-action" disabled={!isHost} onClick={onStart} />
    </section>
  );
}

function BoardRoom({
  snapshot,
  tab,
  setTab,
  isHost,
  error,
  onRestart,
  onSubmitClue,
  onGuessCard,
  onEndTurn,
}: {
  snapshot: PlayerViewSnapshot;
  tab: BoardTab;
  setTab: (tab: BoardTab) => void;
  isHost: boolean;
  error: string;
  onRestart: () => void;
  onSubmitClue: (clue: string, count: number) => void;
  onGuessCard: (cardId: string) => void;
  onEndTurn: () => void;
}) {
  const [clue, setClue] = useState("");
  const [count, setCount] = useState(1);
  const canSeeKey = canViewKey(snapshot);
  const cols = boardColumns();
  const cards = snapshot.board ?? [];
  const turn = snapshot.turn;
  const activeIsSelf = turn?.activePlayerId === snapshot.selfId;
  const canSubmitClue = activeIsSelf && turn?.phase === "clue";
  const canGuess = activeIsSelf && turn?.phase === "guess";
  const redPlayers = teamPlayers(snapshot, "red");
  const bluePlayers = teamPlayers(snapshot, "blue");
  const keyCounts = useMemo(() => {
    const counts: Record<CardOwner, number> = { red: 0, blue: 0, neutral: 0, assassin: 0 };
    snapshot.keyGrid?.forEach((cell) => {
      counts[cell.owner] += 1;
    });
    return counts;
  }, [snapshot.keyGrid]);
  const scoreTotal = keyCounts.red + keyCounts.blue;
  const bannerText = turn?.result
    ? `${teamLabels[turn.result.winner]}获胜：${turn.result.reason === "assassin" ? "对手点中刺客" : "己方词牌全部揭示"}`
    : turn
      ? `${teamLabels[turn.currentTeam]}回合 · ${turn.phase === "clue" ? "队长给线索" : "队员猜词"} · 当前操作者 ${nicknameFor(snapshot, turn.activePlayerId)}`
      : "公共牌阵已部署。";

  function submitCurrentClue() {
    const trimmed = clue.trim();
    if (!trimmed) {
      return;
    }
    onSubmitClue(trimmed, count);
    setClue("");
  }

  return (
    <section className="board-screen">
      <PhaserBoardEffects cards={cards} keyCounts={keyCounts} mode={tab} triggerId={`${snapshot.roomId}-${snapshot.updatedAt}-${tab}`} />
      <div className={`feedback-banner${tab === "key" ? " feedback-banner--danger" : ""}`} role="status" data-animate="panel">
        <span className="pulse-dot" />
        {tab === "key" && canSeeKey ? "队长答案正在显示，请避免让队员看到屏幕。" : bannerText}
      </div>
      <div className="tab-row" data-animate="panel">
        <IconButton icon={icons.game} label="公共牌阵" className={tab === "public" ? "tab-button tab-button--active" : "tab-button"} onClick={() => setTab("public")} />
        <IconButton icon={icons.key} label="关键答案" className={tab === "key" ? "tab-button tab-button--active" : "tab-button"} disabled={!canSeeKey} onClick={() => setTab("key")} />
      </div>

      <section className="turn-panel" data-animate="panel">
        <div className="turn-score">
          <span className="score-chip score-chip--red">红 {turn?.remainingByTeam.red ?? 0}</span>
          <span className="score-chip score-chip--blue">蓝 {turn?.remainingByTeam.blue ?? 0}</span>
          <span className="score-chip">剩余猜测 {turn?.remainingGuesses ?? 0}</span>
        </div>
        <div className="team-strip">
          <TeamRoster label="红队" players={redPlayers} snapshot={snapshot} />
          <TeamRoster label="蓝队" players={bluePlayers} snapshot={snapshot} />
        </div>
        {turn?.clue && (
          <p className="clue-line">
            线索 <strong>{turn.clue.text}</strong> / {turn.clue.count}
          </p>
        )}
        {turn?.phase === "clue" && (
          <div className="clue-form">
            <input value={clue} onChange={(event) => setClue(event.target.value)} placeholder={canSubmitClue ? "输入线索" : `等待 ${nicknameFor(snapshot, turn.activePlayerId)} 给线索`} maxLength={20} disabled={!canSubmitClue} />
            <input className="count-input" type="number" min={0} max={9} value={count} onChange={(event) => setCount(Number(event.target.value))} disabled={!canSubmitClue} />
            <IconButton icon={icons.key} label="提交" className="primary small-button" disabled={!canSubmitClue || !clue.trim()} onClick={submitCurrentClue} />
          </div>
        )}
        {turn?.phase === "guess" && (
          <div className="guess-actions">
            <span>{canGuess ? "选择一张公共牌，或结束回合。" : `等待 ${nicknameFor(snapshot, turn.activePlayerId)} 猜词`}</span>
            <IconButton icon={icons.back} label="结束回合" className="secondary small-button" disabled={!canGuess} onClick={onEndTurn} />
          </div>
        )}
      </section>

      {tab === "key" && canSeeKey ? (
        <div className="key-wrap">
          <div className="key-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {cards.map((card) => {
              const owner = keyForCard(snapshot.keyGrid, card.id) ?? "neutral";
              return (
                <div key={card.id} className={`key-cell key-cell--${owner}`} data-animate="card">
                  <span>{ownerLabels[owner]}</span>
                  <small>{card.content.type === "word" ? card.content.text : card.content.alt}</small>
                </div>
              );
            })}
          </div>
          <div className="key-legend">
            <span className="score-chip score-chip--red">红 {keyCounts.red}</span>
            <span className="score-chip score-chip--blue">蓝 {keyCounts.blue}</span>
            <span className="score-chip">白 {keyCounts.neutral}</span>
            <span className="score-chip score-chip--danger">黑 {keyCounts.assassin}</span>
          </div>
          <div className="score-meter" aria-label={`答案计分，红蓝共 ${scoreTotal} 张`}>
            <div style={{ width: `${scoreTotal ? (keyCounts.red / scoreTotal) * 100 : 50}%` }} />
          </div>
        </div>
      ) : (
        <div className={`card-grid card-grid--${snapshot.config.gameMode}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cards.map((card) => (
            <button key={card.id} type="button" className={`public-card${card.revealedOwner ? ` public-card--${card.revealedOwner}` : ""}`} disabled={!canGuess || Boolean(card.revealedOwner)} onClick={() => onGuessCard(card.id)} data-animate="card">
              {card.content.type === "word" ? (
                <span>{card.content.text}</span>
              ) : (
                <>
                  <img src={card.content.imageUrl} alt={card.content.alt} />
                  <small>{card.content.alt}</small>
                </>
              )}
              {card.revealedOwner && <em>{ownerLabels[card.revealedOwner]}</em>}
            </button>
          ))}
        </div>
      )}

      <footer className="board-footer">
        <span>{canSeeKey ? "队长答案仅当前账号可见" : "队员视图不显示答案"}</span>
        <IconButton icon={icons.refresh} label="再发一局" className="secondary action-button compact-action" disabled={!isHost} onClick={onRestart} />
      </footer>
      {error && <ErrorText message={error} />}
    </section>
  );
}

function TeamRoster({ label, players, snapshot }: { label: string; players: PlayerState[]; snapshot: PlayerViewSnapshot }) {
  return (
    <div className="team-roster">
      <strong>{label}</strong>
      <span>{players.map((player) => `${player.nickname}${snapshot.selfId === player.id ? "(你)" : ""}`).join("、")}</span>
    </div>
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
